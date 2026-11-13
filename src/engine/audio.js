// ---------------------------------------------------------------------------
// Murmur: procedural audio (Web Audio API). No sound files to load.
//  * buses: sfx · music · ambience → master → limiter, with a shared reverb (a
//    generated impulse) that gives the lake its size
//  * the score is an evening raga played by the game: a tanpura drone (Karplus-
//    Strong strings rendered once into buffers), a bansuri that wanders through
//    Bhoopali, and every bird the player gathers plucks a note of the same scale
//  * scene(...)  the continuous bed: wings (noise shaped by the flock's size,
//    speed and distance), water, wind, and crickets once the light has gone
//  * play(name)  one-shot cues: gather, flare, the falcon, the temple bell, ...
// ---------------------------------------------------------------------------
import { store, clamp } from './util.js';

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
const SA = 50;                                       // the drone's Sa: D3
const BHOOPALI = [0, 2, 4, 7, 9];                    // S R G P D, a raga of the early night
/** scale degree (0 = Sa, 5 = upper Sa, negatives go below) → MIDI note */
const deg = (i) => SA + 12 * Math.floor(i / 5) + BHOOPALI[((i % 5) + 5) % 5];
const rnd = (a, b) => a + Math.random() * (b - a);
const SFX = {};

/** A plucked string (Karplus-Strong with an all-pass for fine tuning), rendered into a buffer. */
function pluckBuffer(ctx, freq, seconds, { bright = 0.5, decay = 0.996, buzz = 0 } = {}) {
  const sr = ctx.sampleRate, n = Math.floor(sr * seconds), out = new Float32Array(n);
  const period = sr / freq - 0.5, N = Math.max(2, Math.floor(period)), frac = period - N, C = (1 - frac) / (1 + frac);
  const line = new Float32Array(N);
  let prevNoise = 0;
  for (let i = 0; i < N; i++) { const w = Math.random() * 2 - 1; prevNoise = prevNoise + (w - prevNoise) * (0.35 + bright * 0.65); line[i] = prevNoise; }
  let idx = 0, apX = 0, apY = 0;
  for (let i = 0; i < n; i++) {
    const cur = line[idx], nxt = line[(idx + 1) % N];
    const lp = decay * (bright * cur + (1 - bright) * nxt);
    apY = C * (lp - apY) + apX; apX = lp;                 // fractional delay: the string is in tune
    line[idx] = apY; idx = (idx + 1) % N;
    out[i] = cur;
  }
  if (buzz > 0) for (let i = 0; i < n; i++) out[i] = Math.tanh(out[i] * (1 + buzz * 3)) / (1 + buzz);   // the tanpura's jawari
  const fade = Math.min(n, Math.floor(sr * 0.25));
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade;
  const b = ctx.createBuffer(1, n, sr); b.copyToChannel(out, 0);
  return b;
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = store.get('mm_muted', '0') === '1';
    this.vol = { master: 0.95, sfx: 0.95, music: 0.85, amb: 0.85 };
    this.last = new Map(); this.bufs = new Map();
    this.music = { on: false, timer: 0, nextString: 0, string: 0, nextFlute: 0, mood: 0, level: 1 };
    this.chirpAcc = 0;
  }
  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : this.vol.master;
    const lim = (this.limiter = ctx.createDynamicsCompressor());
    lim.threshold.value = -9; lim.knee.value = 10; lim.ratio.value = 8; lim.attack.value = 0.003; lim.release.value = 0.25;
    this.master.connect(lim); lim.connect(ctx.destination);
    const bus = (v) => { const g = ctx.createGain(); g.gain.value = v; g.connect(this.master); return g; };
    this.sfxBus = bus(this.vol.sfx); this.musicBus = bus(this.vol.music); this.ambBus = bus(this.vol.amb);
    // reverb: a long tail of decaying noise, darker toward the end
    this.verb = ctx.createConvolver(); this.verb.buffer = this._impulse(3.6, 2.4);
    this.verbIn = ctx.createGain(); this.verbIn.connect(this.verb);
    const vOut = ctx.createGain(); vOut.gain.value = 0.5; this.verb.connect(vOut); vOut.connect(this.master);
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const wake = () => { if (!document.hidden && ctx.state !== 'running' && !this.paused) ctx.resume().catch(() => {}); };
    document.addEventListener('visibilitychange', () => { if (document.hidden) { if (ctx.state === 'running') ctx.suspend().catch(() => {}); } else wake(); });
    addEventListener('pageshow', wake);
    this._bed();
    return ctx;
  }
  _impulse(seconds, decay) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * seconds), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); let lp = 0;
      for (let i = 0; i < n; i++) { const k = i / n, w = (Math.random() * 2 - 1) * Math.pow(1 - k, decay); lp += (w - lp) * (1 - k * 0.75); d[i] = lp; }
    }
    return b;
  }
  unlock() { const ctx = this.ensure(); if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); return ctx; }
  get now() { return this.ctx ? this.ctx.currentTime : 0; }
  get ready() { return !!this.ctx && this.ctx.state === 'running'; }
  setMuted(m) { this.muted = m; store.set('mm_muted', m ? '1' : '0'); if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.vol.master, this.now, 0.05); }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }
  pause(on) { this.paused = on; if (!this.ctx) return; if (on) this.ctx.suspend().catch(() => {}); else this.ctx.resume().catch(() => {}); }

  /* ------------------------------------------------------------- helpers */
  gain(v, dest) { const g = this.ctx.createGain(); g.gain.value = v; g.connect(dest); return g; }
  pan(p, dest) { if (!this.ctx.createStereoPanner) return dest; const n = this.ctx.createStereoPanner(); n.pan.value = clamp(p, -1, 1); n.connect(dest); return n; }
  /** an output that also feeds the reverb */
  out(bus, wet = 0.3, pan = 0) { const g = this.gain(1, this.pan(pan, bus)); const s = this.gain(wet, this.verbIn); g.connect(s); return g; }
  env(param, t, a, peak, d, end = 0.0001) { param.cancelScheduledValues(t); param.setValueAtTime(0.0001, t); param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a); param.exponentialRampToValueAtTime(end, t + a + d); }
  buffer(key, make) { let b = this.bufs.get(key); if (!b) { b = make(); this.bufs.set(key, b); } return b; }
  /** a plucked note of the scale */
  pluck(midi, { vol = 0.3, when = 0, bright = 0.55, long = false, wet = 0.45, pan = 0, bus = null } = {}) {
    if (!this.ready) return;
    const b = this.buffer(`p${midi}${long ? 'L' : ''}${bright}`, () => pluckBuffer(this.ctx, NOTE(midi), long ? 4.5 : 2.4, { bright, decay: long ? 0.9982 : 0.9955 }));
    const src = this.ctx.createBufferSource(); src.buffer = b;
    const g = this.gain(vol, this.out(bus || this.sfxBus, wet, pan)); src.connect(g); src.start(this.now + when);
  }
  noiseSrc(loop = true) { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = loop; s.loopStart = Math.random(); return s; }

  play(name, o = {}) {
    if (!this.ready) return null;
    const gap = o.minGap ?? 0.03, t = this.last.get(name) ?? -1;
    if (this.now - t < gap) return null;
    this.last.set(name, this.now);
    const fn = SFX[name];
    if (!fn) { console.warn('[audio] unknown sfx', name); return null; }
    try { return fn(this, o) ?? null; } catch (e) { console.warn('[audio]', name, e); return null; }
  }

  /* ---------------------------------------------------- the continuous bed */
  _bed() {
    const ctx = this.ctx;
    // wings: a band of noise, fluttering
    const w = this.noiseSrc(); const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 900; wf.Q.value = 0.6;
    const wg = ctx.createGain(); wg.gain.value = 0; const flutter = ctx.createGain(); flutter.gain.value = 1;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 11.5; const lfoG = ctx.createGain(); lfoG.gain.value = 0.28; lfo.connect(lfoG); lfoG.connect(flutter.gain); lfo.start();
    const wp = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    w.connect(wf); wf.connect(flutter); flutter.connect(wg);
    if (wp) { wg.connect(wp); wp.connect(this.ambBus); } else wg.connect(this.ambBus);
    const ws = this.gain(0.25, this.verbIn); wg.connect(ws); w.start();
    // the lake: slow, low wash
    const l = this.noiseSrc(); const lf = ctx.createBiquadFilter(); lf.type = 'lowpass'; lf.frequency.value = 420;
    const lg = ctx.createGain(); lg.gain.value = 0; const lapL = ctx.createOscillator(); lapL.frequency.value = 0.17; const lapG = ctx.createGain(); lapG.gain.value = 0.05;
    lapL.connect(lapG); lapG.connect(lg.gain); lapL.start(); l.connect(lf); lf.connect(lg); lg.connect(this.ambBus); l.start();
    // crickets: two pulsed tones
    const cg = ctx.createGain(); cg.gain.value = 0; cg.connect(this.ambBus);
    for (const [f, rate, pan] of [[4350, 23, -0.5], [4720, 19, 0.55]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const am = ctx.createGain(); am.gain.value = 0; const p = ctx.createOscillator(); p.type = 'square'; p.frequency.value = rate; const pg = ctx.createGain(); pg.gain.value = 0.5;
      const slow = ctx.createOscillator(); slow.frequency.value = 0.31 + Math.random() * 0.2; const sg = ctx.createGain(); sg.gain.value = 0.5;
      p.connect(pg); pg.connect(am.gain); slow.connect(sg); sg.connect(am.gain);
      o.connect(am); am.connect(this.pan(pan, cg)); o.start(); p.start(); slow.start();
    }
    this.bed = { wg, wf, wp, lg, cg };
  }
  /** called every frame: wings 0..1, pan -1..1, speed 0..1, night 0..1, count of birds (for chatter), dt */
  scene({ wings = 0, pan = 0, speed = 0.5, night = 0, birds = 0, dt = 0.016, quiet = false }) {
    if (!this.ready || !this.bed) return;
    const b = this.bed, t = this.now;
    b.wg.gain.setTargetAtTime(quiet ? 0 : clamp(wings, 0, 1) * 0.55, t, 0.12);
    b.wf.frequency.setTargetAtTime(520 + 1500 * clamp(speed, 0, 1), t, 0.2);
    if (b.wp) b.wp.pan.setTargetAtTime(clamp(pan, -0.8, 0.8), t, 0.15);
    b.lg.gain.setTargetAtTime(quiet ? 0.03 : 0.085, t, 0.6);
    b.cg.gain.setTargetAtTime(clamp(night, 0, 1) * 0.02, t, 1.2);
    // starlings never stop talking
    if (!quiet && birds > 0) {
      this.chirpAcc += dt * Math.min(9, 0.8 + Math.sqrt(birds) * 0.12);
      while (this.chirpAcc > 1) { this.chirpAcc -= 1 + Math.random(); this.play('chirp', { pan: clamp(pan + rnd(-0.6, 0.6), -1, 1), vol: 0.5 + wings * 0.7, minGap: 0 }); }
    }
  }

  /* -------------------------------------------------------------- the raga */
  startMusic() {
    if (this.music.on || !this.ctx) return;
    const m = this.music; m.on = true; m.nextString = this.now + 0.2; m.string = 0; m.nextFlute = this.now + 5; m.level = 1;
    this.musicBus.gain.cancelScheduledValues(this.now); this.musicBus.gain.setTargetAtTime(this.vol.music, this.now, 0.25);   // (a fade-out from the last evening may still be running)
    const tick = () => {
      if (!m.on || !this.ready) return;
      const t = this.now;
      // the tanpura: Pa, Sa, Sa, low Sa, round and round
      while (m.nextString < t + 0.3) {
        const notes = [SA + 7, SA + 12, SA + 12, SA], vols = [0.5, 0.62, 0.55, 0.7], k = m.string % 4;
        const b = this.buffer(`tan${k}`, () => pluckBuffer(this.ctx, NOTE(notes[k]), 6.5, { bright: 0.62, decay: 0.9992, buzz: 0.55 }));
        const src = this.ctx.createBufferSource(); src.buffer = b; src.detune.value = rnd(-4, 4);
        const g = this.gain(vols[k] * 0.4 * m.level, this.out(this.musicBus, 0.5, k === 0 ? -0.25 : k === 3 ? 0.25 : 0));
        src.connect(g); src.start(m.nextString);
        m.string++; m.nextString += 1.18 + (k === 3 ? 0.35 : 0) + rnd(-0.02, 0.02);
      }
      // the flute: a phrase, then a long breath
      if (t > m.nextFlute) m.nextFlute = t + this._flute() + rnd(5, 10) - m.mood * 2.5;
    };
    m.timer = setInterval(tick, 120); tick();
  }
  stopMusic(fade = 3) {
    const m = this.music; if (!m.on) return;
    m.on = false; clearInterval(m.timer);
    if (this.musicBus) { const t = this.now; this.musicBus.gain.setTargetAtTime(0.0001, t, fade / 3); setTimeout(() => { if (!m.on && this.musicBus) this.musicBus.gain.setTargetAtTime(this.vol.music, this.now, 0.05); }, fade * 1000 + 400); }
  }
  /** 0 = wide golden calm, 1 = the last light: the flute speaks more often */
  mood(k) { this.music.mood = clamp(k, 0, 1); }
  _flute() {
    const PHRASES = [
      [[2, 1], [4, 1], [5, 3]], [[5, 1], [4, 1], [2, 1], [1, 1], [0, 3]], [[0, 1], [1, 1], [2, 2], [4, 3]],
      [[7, 2], [5, 1], [4, 1], [2, 3]], [[4, 1], [5, 1], [7, 3]], [[2, 1], [1, 1], [0, 1], [-1, 1], [0, 3]],
      [[4, 2], [2, 1], [4, 1], [5, 1], [4, 3]], [[5, 2], [7, 1], [9, 2], [7, 3]],
    ];
    const ph = PHRASES[(Math.random() * PHRASES.length) | 0], beat = rnd(0.5, 0.64), ctx = this.ctx, t0 = this.now + 0.05;
    const total = ph.reduce((s, n) => s + n[1], 0) * beat;
    const o = ctx.createOscillator(); o.type = 'sine'; const o2 = ctx.createOscillator(); o2.type = 'triangle';
    const g = ctx.createGain(); g.gain.value = 0; const g2 = this.gain(0.16, g);
    const vib = ctx.createOscillator(); vib.frequency.value = 5.1; const vg = ctx.createGain(); vg.gain.value = 0; vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
    const br = this.noiseSrc(); const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.Q.value = 1.4; const bg = this.gain(0.05, g); br.connect(bf); bf.connect(bg);
    o.connect(g); o2.connect(g2); g.connect(this.out(this.musicBus, 0.7, rnd(-0.3, 0.3)));
    let t = t0;
    for (let i = 0; i < ph.length; i++) {
      const f = NOTE(deg(ph[i][0]) + 12);
      if (i === 0) { o.frequency.setValueAtTime(f * 0.97, t); o2.frequency.setValueAtTime(f * 1.94, t); bf.frequency.setValueAtTime(f * 2, t); }
      o.frequency.setTargetAtTime(f, t, 0.05); o2.frequency.setTargetAtTime(f * 2, t, 0.05); bf.frequency.setTargetAtTime(f * 2, t, 0.05);   // meend: glide into the note
      t += ph[i][1] * beat;
    }
    const level = 0.11 * this.music.level;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(level, t0 + 0.16); g.gain.setValueAtTime(level, t0 + total - 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t0 + total + 0.5);
    vg.gain.setValueAtTime(0, t0); vg.gain.linearRampToValueAtTime(2.2, t0 + 0.7);
    for (const n of [o, o2, vib, br]) { n.start(t0); n.stop(t0 + total + 0.7); }
    return total;
  }
  /** rms of what is playing now (tests: is there sound at all?) */
  level() {
    if (!this.ctx) return 0;
    if (!this.an) { this.an = this.ctx.createAnalyser(); this.an.fftSize = 1024; this.limiter.connect(this.an); this.anBuf = new Float32Array(1024); }
    this.an.getFloatTimeDomainData(this.anBuf); let s = 0; for (const v of this.anBuf) s += v * v;
    return Math.sqrt(s / this.anBuf.length);
  }
}

/* ============================================================== one-shot cues */
SFX.chirp = (a, o) => {
  const ctx = a.ctx, t = a.now, f = rnd(2500, 4300), dur = rnd(0.035, 0.08);
  const osc = ctx.createOscillator(); osc.type = 'sine';
  osc.frequency.setValueAtTime(f, t); osc.frequency.exponentialRampToValueAtTime(f * rnd(0.62, 1.45), t + dur);
  const g = a.gain(0, a.out(a.ambBus, 0.5, o.pan ?? 0)); a.env(g.gain, t, 0.006, 0.022 * (o.vol ?? 1), dur);
  osc.connect(g); osc.start(t); osc.stop(t + dur + 0.03);
};
/** a run of notes up the scale: more birds, a longer run */
SFX.gather = (a, o) => {
  const n = clamp(Math.round(2 + Math.log2(Math.max(1, (o.n ?? 40) / 25))), 2, 7), base = (Math.random() * 4) | 0;
  for (let i = 0; i < n; i++) a.pluck(deg(base + i) + 12, { vol: 0.3, when: i * 0.075, bright: 0.6, pan: o.pan ?? 0 });
  const ctx = a.ctx, t = a.now, s = a.noiseSrc(false), f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3200;
  const g = a.gain(0, a.out(a.sfxBus, 0.5)); a.env(g.gain, t, 0.12, 0.07, 0.5); s.connect(f); f.connect(g); s.start(t); s.stop(t + 0.8);
};
SFX.flare = (a) => {
  const ctx = a.ctx, t = a.now, s = a.noiseSrc(false), f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9;
  f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(3200, t + 0.35);
  const g = a.gain(0, a.out(a.sfxBus, 0.4)); a.env(g.gain, t, 0.03, 0.42, 0.55); s.connect(f); f.connect(g); s.start(t); s.stop(t + 0.75);
  a.pluck(deg(0) + 12, { vol: 0.2, bright: 0.7 }); a.pluck(deg(3) + 12, { vol: 0.2, when: 0.02, bright: 0.7 }); a.pluck(deg(5) + 12, { vol: 0.18, when: 0.04, bright: 0.7 });
};
SFX.falcon = (a, o) => {
  const ctx = a.ctx, t0 = a.now, out = a.out(a.sfxBus, 0.6, o.pan ?? 0);
  for (let i = 0; i < 5; i++) {
    const t = t0 + i * 0.17, osc = ctx.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(2550 - i * 40, t); osc.frequency.exponentialRampToValueAtTime(1850, t + 0.13);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 3.5;
    const g = a.gain(0, out); a.env(g.gain, t, 0.012, 0.17, 0.12);
    osc.connect(f); f.connect(g); osc.start(t); osc.stop(t + 0.18);
  }
};
SFX.lock = (a) => {
  for (const [dt, f] of [[0, 1760], [0.11, 2217]]) {
    const o = a.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const g = a.gain(0, a.out(a.sfxBus, 0.3)); a.env(g.gain, a.now + dt, 0.004, 0.11, 0.07); o.connect(g); o.start(a.now + dt); o.stop(a.now + dt + 0.12);
  }
};
SFX.stoop = (a, o) => {
  const ctx = a.ctx, t = a.now, s = a.noiseSrc(false), f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.2;
  f.frequency.setValueAtTime(380, t); f.frequency.exponentialRampToValueAtTime(3000, t + 1.3);
  const g = a.gain(0, a.out(a.sfxBus, 0.3, o.pan ?? 0));
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
  s.connect(f); f.connect(g); s.start(t); s.stop(t + 1.8);
};
SFX.hit = (a) => {
  const ctx = a.ctx, t = a.now;
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.3);
  const g = a.gain(0, a.sfxBus); a.env(g.gain, t, 0.004, 0.8, 0.4); o.connect(g); o.start(t); o.stop(t + 0.5);
  const s = a.noiseSrc(false), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200;
  const am = ctx.createGain(); am.gain.value = 0.5; const l = ctx.createOscillator(); l.frequency.value = 24; const lg = ctx.createGain(); lg.gain.value = 0.5; l.connect(lg); lg.connect(am.gain);
  const g2 = a.gain(0, a.out(a.sfxBus, 0.5)); a.env(g2.gain, t, 0.01, 0.55, 0.9);
  s.connect(f); f.connect(am); am.connect(g2); s.start(t); s.stop(t + 1.1); l.start(t); l.stop(t + 1.1);
};
SFX.dodge = (a) => { a.pluck(deg(7) + 12, { vol: 0.26, bright: 0.75 }); a.pluck(deg(9) + 12, { vol: 0.24, when: 0.09, bright: 0.75 }); a.pluck(deg(10) + 12, { vol: 0.2, when: 0.18, bright: 0.75 }); };
/** the temple bell at dusk: three strokes */
SFX.bell = (a) => {
  const ctx = a.ctx, f0 = NOTE(SA + 12), parts = [[1, 1, 5.0], [2.02, 0.55, 3.8], [2.74, 0.42, 2.8], [3.76, 0.28, 2.0], [4.92, 0.18, 1.3], [6.2, 0.1, 0.9]];
  for (let k = 0; k < 3; k++) {
    const t = a.now + k * 1.55, out = a.out(a.sfxBus, 0.8, -0.2);
    for (const [r, v, d] of parts) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f0 * r * (1 + rnd(-0.001, 0.001));
      const g = a.gain(0, out); a.env(g.gain, t, 0.004, 0.2 * v * (k === 0 ? 1 : 0.8), d); o.connect(g); o.start(t); o.stop(t + d + 0.1);
    }
  }
};
SFX.perch = (a, o) => a.pluck(deg(10 + ((Math.random() * 6) | 0)) + 12, { vol: rnd(0.045, 0.085), bright: 0.5, wet: 0.7, pan: o.pan ?? rnd(-0.5, 0.5) });
SFX.ui = (a) => a.pluck(deg(5) + 12, { vol: 0.2, bright: 0.6 });
SFX.start = (a) => { [0, 2, 3, 5].forEach((d, i) => a.pluck(deg(d) + 12, { vol: 0.3, when: i * 0.16, bright: 0.6, long: true })); };
SFX.end = (a) => { [9, 8, 7, 6, 5].forEach((d, i) => a.pluck(deg(d), { vol: 0.34, when: i * 0.55, bright: 0.5, long: true, wet: 0.8 })); a.pluck(deg(0), { vol: 0.4, when: 3.1, bright: 0.45, long: true, wet: 0.9 }); };
