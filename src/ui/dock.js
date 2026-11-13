// ---------------------------------------------------------------------------
// The answer dock and the labels that sit on the triangle.
//   Labels  DOM text pinned to points in the world (the 40 m, the 60°, the ?)
//   Dock    one question, up to four options (each a mistake or the answer), and
//           underneath: what the last answer missed, then the working, a line at
//           a time. Options are never struck out; they change places after a miss.
// ---------------------------------------------------------------------------
import * as THREE from '../../vendor/three.module.js';
import { t } from '../engine/i18n.js';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();
/** 20√3 → the root sign over its radicand */
const maths = (s) => String(s).replace(/√(\d+)/g, '<span class="rt">√<i>$1</i></span>');

export class Labels {
  constructor(camera) { this.cam = camera; this.root = $('labels'); this.map = new Map(); }
  /** put (or move) a label: pos is a Vector3 (copied); cls: 'val' | 'ask' | 'word' | 'bad' */
  set(id, text, pos, cls = 'val') {
    let l = this.map.get(id);
    if (!l) { const el = document.createElement('div'); this.root.appendChild(el); l = { el, pos: new THREE.Vector3() }; this.map.set(id, l); }
    l.pos.copy(pos); l.el.className = `lab ${cls}`; l.el.innerHTML = maths(text);
    return l;
  }
  remove(id) { const l = this.map.get(id); if (l) { l.el.remove(); this.map.delete(id); } }
  clear() { for (const l of this.map.values()) l.el.remove(); this.map.clear(); }
  update() {
    if (!this.map.size) return;
    const w = innerWidth, h = innerHeight;
    for (const l of this.map.values()) {
      _v.copy(l.pos).project(this.cam);
      const on = _v.z < 1 && Math.abs(_v.x) < 1.2 && Math.abs(_v.y) < 1.2;
      l.el.style.visibility = on ? 'visible' : 'hidden';
      if (on) l.el.style.transform = `translate(-50%, -50%) translate(${((_v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-_v.y * 0.5 + 0.5) * h).toFixed(1)}px)`;
    }
  }
}

export class Dock {
  constructor(G) {
    this.G = G; this.el = $('dock'); this.q = $('dkQ'); this.opts = $('dkOpts'); this.fb = $('dkFb'); this.work = $('dkWork'); this.timerEl = $('dkTimer');
    this.resolve = null; this.options = []; this.locked = true; this.timerEnd = 0; this.timerLen = 0; this.onTime = null;
    this.opts.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) this.pick(+b.dataset.i); });
    addEventListener('keydown', (e) => { if (this.el.hidden || this.locked || e.repeat) return; const k = e.key >= '1' && e.key <= '4' ? +e.key - 1 : -1; if (k >= 0 && k < this.options.length) this.pick(k); });
  }
  /** show a question; options: [{ text, ... }] */
  ask(question, options, { hint = null } = {}) {
    this.q.textContent = question; this.options = options;
    this.fb.hidden = true; this.work.hidden = true; this.work.innerHTML = ''; this.timerEl.hidden = true; this.timerEnd = 0;
    this.render(); this.el.hidden = false; this.el.classList.remove('out', 'solving');
    this.el.style.animation = 'none'; void this.el.offsetWidth; this.el.style.animation = '';
    if (hint) this.note(hint);
    this.lock(false);
  }
  render() {
    this.opts.className = `dk-opts n${this.options.length}`;
    this.opts.innerHTML = this.options.map((o, i) => `<button data-i="${i}"><span>${maths(o.text)}</span></button>`).join('');
  }
  /** a promise for the next option the player takes */
  choose() { this.lock(false); return new Promise((res) => { this.resolve = res; }); }
  pick(i) {
    if (this.locked || !this.resolve) return;
    const o = this.options[i]; if (!o) return;
    this.lock(true);
    [...this.opts.children].forEach((b, k) => b.classList.toggle('taken', k === i));
    this.G.audio.play('ui');
    const r = this.resolve; this.resolve = null; r(o);
  }
  lock(on) { this.locked = on; this.el.classList.toggle('locked', on); }
  /** after a miss: the same options in new places (nothing is crossed out) */
  reshuffle() {
    const a = this.options;
    for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
    this.render();
  }
  /** what the answer missed: a title and one idea */
  feedback(title, idea) {
    this.fb.hidden = false; this.fb.innerHTML = `<div class="fb-t">${title}</div>${idea ? `<div class="fb-i">${maths(idea)}</div>` : ''}`;
    this.fb.style.animation = 'none'; void this.fb.offsetWidth; this.fb.style.animation = '';
  }
  note(text) { this.fb.hidden = false; this.fb.innerHTML = `<div class="fb-n">${text}</div>`; }
  /** the working, appearing a line at a time; resolves when the last line is up */
  async working(lines, script, gap = 1.1) {
    this.work.hidden = false; this.work.innerHTML = '';
    for (const line of lines) {
      const d = document.createElement('div'); d.className = 'wk'; d.innerHTML = maths(line); this.work.appendChild(d);
      this.G.audio.play('diya', { minGap: 0 });
      await script.waitReal(gap);
    }
  }
  /** light the right option (the answer is being shown, not asked for any more) */
  reveal() { this.el.classList.add('solving'); [...this.opts.children].forEach((b, k) => { b.classList.remove('taken'); b.classList.toggle('right', this.options[k].code === null); }); }
  /** a draining bar; fn() when it is empty */
  timer(seconds, fn) { this.timerEl.hidden = false; this.timerLen = seconds; this.timerEnd = this.G.clock.realTime + seconds; this.onTime = fn; }
  stopTimer() { this.timerEnd = 0; this.timerEl.hidden = true; }
  update() {
    if (!this.timerEnd) return;
    const left = this.timerEnd - this.G.clock.realTime, k = Math.max(0, left / this.timerLen);
    this.timerEl.firstElementChild.style.transform = `scaleX(${k.toFixed(3)})`;
    this.timerEl.classList.toggle('low', left < 7);
    if (left <= 0) { this.timerEnd = 0; const fn = this.onTime; this.onTime = null; if (fn) fn(); }
  }
  hide() { this.lock(true); this.resolve = null; this.timerEnd = 0; if (!this.el.hidden) { this.el.classList.add('out'); setTimeout(() => { if (this.el.classList.contains('out')) this.el.hidden = true; }, 450); } }
}
