// ---------------------------------------------------------------------------
// The little there is on screen: the title, two numbers (with you / home), a sun
// dial, the pause button, one-line hints, the pause card (which doubles as the
// explanation of the three rules) and the results.
// ---------------------------------------------------------------------------
import { t, applyI18n } from '../engine/i18n.js';
import { fmt, clamp } from '../engine/util.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(G) {
    this.G = G;
    applyI18n();
    this.el = { title: $('title'), hud: $('hud'), hint: $('hint'), hintText: $('hintText'), caption: $('caption'), pause: $('pause'), result: $('result'),
      count: $('hudCount'), flockRow: $('hudFlock'), home: $('hudHome'), homeN: $('hudHomeN'), sun: $('dialSun'), mark: $('falconMark'),
      play: $('btnPlay'), best: $('ttBest'), load: $('ttLoad'), fill: $('ttFill'), sound: $('btnSound') };
    this.shown = { count: -1, home: -1 };
    this.hintKey = null; this.hintTimer = 0;
    this.dots = [...document.querySelectorAll('.stray')];
    this.soundLabel();
  }
  progress(p) { this.el.fill.style.transform = `scaleX(${clamp(p, 0, 1).toFixed(3)})`; }
  ready(best) {
    this.el.load.classList.add('done'); this.el.play.hidden = false;
    if (best > 0) { this.el.best.textContent = t('title.best', { n: fmt(best) }); this.el.best.hidden = false; }
  }
  title(on) {
    const e = this.el.title;
    if (on) { e.hidden = false; e.classList.remove('out'); } else { e.classList.add('out'); setTimeout(() => { if (e.classList.contains('out')) e.hidden = true; }, 950); }
  }
  hud(on) { const e = this.el.hud; if (on) { e.hidden = false; requestAnimationFrame(() => e.classList.remove('out')); } else e.classList.add('out'); }
  count(n) {
    if (n === this.shown.count) return;
    if (n > this.shown.count + 5 && this.shown.count >= 0) { const r = this.el.flockRow; r.classList.remove('pop'); void r.offsetWidth; r.classList.add('pop'); }
    this.shown.count = n; this.el.count.textContent = fmt(n);
  }
  home(n, on = true) {
    this.el.home.hidden = !on;
    if (n !== this.shown.home) { this.shown.home = n; this.el.homeN.textContent = fmt(n); }
  }
  /** the sun on its arc: k 0 = high, 1 = on the horizon line */
  sun(k) {
    k = clamp(k, 0, 1.12);
    const a = (0.2 + 0.8 * k) * Math.PI / 2;               // along the right-hand quarter of the arc, sinking
    this.el.sun.setAttribute('cx', (60 + Math.sin(a) * 52).toFixed(1)); this.el.sun.setAttribute('cy', (36 - Math.cos(a) * 52 + (k > 1 ? (k - 1) * 40 : 0)).toFixed(1));
    this.el.sun.style.opacity = k > 1 ? String(clamp(1 - (k - 1) * 8, 0, 1)) : '1';
  }
  /** a red chevron at the edge of the screen pointing at the falcon (or on it) */
  mark(on, x = 0, y = 0, ang = 0) {
    const m = this.el.mark;
    if (!on) { m.hidden = true; return; }
    m.hidden = false; m.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${ang.toFixed(3)}rad)`;
  }
  /** rose dots at the screen's edge for wisps that are out of sight */
  marks(list) {
    for (let i = 0; i < this.dots.length; i++) {
      const d = this.dots[i], m = list[i];
      if (!m) { if (!d.hidden) d.hidden = true; continue; }
      d.hidden = false; d.style.transform = `translate(${m[0].toFixed(1)}px, ${m[1].toFixed(1)}px)`;
    }
  }
  hint(key, { tap = false, hold = 0 } = {}) {
    const e = this.el.hint; clearTimeout(this.hintTimer);
    if (!key) { if (!e.hidden) { e.classList.add('out'); this.hintTimer = setTimeout(() => { e.hidden = true; }, 600); } this.hintKey = null; return; }
    if (this.hintKey === key) return;
    this.hintKey = key; this.el.hintText.textContent = t(key);
    e.hidden = false; e.classList.remove('out'); e.classList.toggle('tap', tap);
    e.style.animation = 'none'; void e.offsetWidth; e.style.animation = '';
    if (hold) this.hintTimer = setTimeout(() => this.hint(null), hold * 1000);
  }
  caption(key) {
    const e = this.el.caption; e.textContent = t(key); e.hidden = false;
    e.style.animation = 'none'; void e.offsetWidth; e.style.animation = '';
    clearTimeout(this.capTimer); this.capTimer = setTimeout(() => { e.hidden = true; }, 4700);
  }
  soundLabel() { this.el.sound.textContent = t(this.G.audio.muted ? 'sound.off' : 'sound.on'); }
  pause(on) { this.el.pause.hidden = !on; if (on) this.soundLabel(); }
  /** the count climbs to the number that came home */
  results({ home, rank, best, isBest }) {
    const e = this.el.result; e.hidden = false;
    const n = $('resN'), stars = [...$('resStars').children];
    stars.forEach((s) => s.classList.remove('on'));
    $('resRank').textContent = t(`rank.${rank}`);
    $('resBest').textContent = isBest && home > 0 ? t('result.new') : best > 0 ? t('result.best', { n: fmt(best) }) : '';
    const t0 = performance.now(), dur = 1800;
    const step = (now) => {
      const k = clamp((now - t0) / dur, 0, 1), v = Math.round(home * (1 - Math.pow(1 - k, 3)));
      n.textContent = fmt(v);
      if (k < 1 && !e.hidden) requestAnimationFrame(step);
      else stars.forEach((s, i) => setTimeout(() => s.classList.toggle('on', i < rank), 180 * i));
    };
    requestAnimationFrame(step);
  }
  hideResults() { this.el.result.hidden = true; }
}
