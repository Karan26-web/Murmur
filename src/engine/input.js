// ---------------------------------------------------------------------------
// Input: one point of light to lead the flock with (answers are buttons in the
// dock, with number keys 1-4 handled there).
//   touch   drag = lead (a quick tap does not move the light)
//   mouse   move = lead (no button needed)
//   keys    arrows / W A S D move the light; Esc / P = pause; M = sound;
//           Enter = begin / again
// x, y are in normalised device coordinates (-1..1, y up). `leading` turns true
// the first time the player really moves the light.
// ---------------------------------------------------------------------------
const TAP_MS = 230, TAP_PX = 12;
const KEYS = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
const ACTIONS = { Enter: 'confirm', NumpadEnter: 'confirm', Escape: 'pause', KeyP: 'pause', KeyM: 'mute' };

export const input = {
  x: 0, y: 0.25, leading: false, moved: 0, mouse: false, enabled: true,
  keys: new Set(), handlers: new Map(), touch: null,

  init() {
    const ndc = (e) => { this.x = (e.clientX / innerWidth) * 2 - 1; this.y = -((e.clientY / innerHeight) * 2 - 1); };
    const onUi = (e) => e.target && e.target.closest && e.target.closest('button, .veil');
    addEventListener('pointerdown', (e) => {
      if (onUi(e)) return;
      if (e.pointerType === 'mouse') { if (e.button === 0) { ndc(e); this.leading = true; } return; }
      if (this.touch) return;
      this.touch = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
    });
    addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') { this.mouse = true; if (!this.leading) this.moved += Math.abs(e.movementX) + Math.abs(e.movementY); ndc(e); if (this.moved > 30) this.leading = true; return; }
      const tc = this.touch; if (!tc || e.pointerId !== tc.id) return;
      if (!tc.moved && (Math.hypot(e.clientX - tc.x, e.clientY - tc.y) > TAP_PX || performance.now() - tc.t > TAP_MS)) tc.moved = true;
      if (tc.moved) { ndc(e); this.leading = true; }
    });
    const up = (e) => {
      const tc = this.touch; if (!tc || e.pointerId !== tc.id) return;
      this.touch = null;
    };
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
    addEventListener('keydown', (e) => {
      if (KEYS[e.code]) { this.keys.add(e.code); e.preventDefault(); return; }
      const a = ACTIONS[e.code]; if (!a || e.repeat) return;
      if (document.activeElement && document.activeElement.tagName === 'BUTTON' && a === 'confirm') return;   // the button takes it
      this.emit(a);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.touch = null; });
    addEventListener('contextmenu', (e) => e.preventDefault());
  },
  /** the keyboard moves the light like a slow finger */
  update(dt) {
    if (!this.keys.size) return;
    let dx = 0, dy = 0;
    for (const c of this.keys) { const k = KEYS[c]; dx += k[0]; dy += k[1]; }
    if (!dx && !dy) return;
    const m = Math.hypot(dx, dy);
    this.x = Math.max(-1, Math.min(1, this.x + (dx / m) * dt * 1.25)); this.y = Math.max(-1, Math.min(1, this.y + (dy / m) * dt * 1.25));
    this.leading = true;
  },
  on(name, fn) { if (!this.handlers.has(name)) this.handlers.set(name, new Set()); this.handlers.get(name).add(fn); return () => this.handlers.get(name).delete(fn); },
  emit(name) { const s = this.handlers.get(name); if (s) for (const fn of [...s]) fn(); },
};
