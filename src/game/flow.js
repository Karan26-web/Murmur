// ---------------------------------------------------------------------------
// One evening, start to finish.
//   title   the flock wheels by itself over the lake
//   play    165 s of golden hour → sunset: lead the flock, sweep up the wisps of
//           strays that cross the sky, out-fly the falcon
//   call    the sun touches the bank: the temple bell, the lamps, a vertigo push
//           in on the banyan
//   roost   55 s of blue hour: hold the flock over the tree and it pours in
//   finale  night falls round the tree; the count of birds that came home
// The time of day is the only timer and the sun is its only display.
// ---------------------------------------------------------------------------
import * as THREE from '../../vendor/three.module.js';
import { ScriptRunner, clock } from '../engine/clock.js';
import { tweens, uiTweens } from '../engine/tween.js';
import { pose } from '../engine/camera.js';
import { Ease, clamp, lerp, smoothstep, mulberry32, DEG, store, param } from '../engine/util.js';
import { input } from '../engine/input.js';
import { TREE, CANOPY } from '../world/land.js';
import { TOD_SUNSET } from '../world/sky.js';

export const PLAY_TIME = 165, ROOST_TIME = 55, START_BIRDS = 300;
const TOD_DUSK = 0.82;
// where the lens stands: the south bank at golden hour, drifting west by sunset, then out on the water near the tree
const VANTAGE = [
  { pos: new THREE.Vector3(0, 3.0, 215), az: 2 * DEG },
  { pos: new THREE.Vector3(-56, 2.7, 208), az: 15 * DEG },
  { pos: new THREE.Vector3(6.6, 3.2, 84.8), az: 27 * DEG },
];
const CROWN = new THREE.Vector3(TREE.x, CANOPY.y, TREE.z);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _ray = new THREE.Vector3(), _fwd = new THREE.Vector3(), _p = new THREE.Vector3();
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class Flow {
  constructor(G) {
    this.G = G; this.world = G.world; this.flock = G.world.flock; this.falcon = G.world.falcon; this.lure = G.world.lure;
    this.runner = new ScriptRunner();
    this.phase = 'boot'; this.t = 0; this.far = 145; this.roostK = 0; this.lead = false;
    this.wisps = []; this.schedule = []; this.total = START_BIRDS; this.gathered = 0;
    this.best = +store.get('mm_best', 0) || 0;
    this.seen = { lead: false, gather: false, flare: store.get('mm_seen_flare', '0') === '1' };
    this.roostAcc = 0; this.nextFalcon = 1e9; this.slow = false; this.paused = false; this.tilt = 0;
    this.autoT = 0; this.stats = { hits: 0, dodges: 0, missed: 0 };

    input.on('flare', () => this.flare());
    input.on('pause', () => this.togglePause());
    input.on('mute', () => { G.audio.toggleMute(); G.hud.soundLabel(); });
    input.on('confirm', () => { if (this.phase === 'title') this.begin(); else if (this.phase === 'results') this.again(); });
    const click = (id, fn) => document.getElementById(id).addEventListener('click', (e) => { e.stopPropagation(); G.audio.unlock(); G.audio.play('ui'); fn(); });
    click('btnPlay', () => this.begin()); click('btnPause', () => this.togglePause()); click('btnResume', () => this.togglePause(false));
    click('btnRestart', () => { this.togglePause(false); this.again(); }); click('btnAgain', () => this.again());
    click('btnSound', () => { G.audio.toggleMute(); G.hud.soundLabel(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && (this.phase === 'play' || this.phase === 'roost')) this.togglePause(true); });
  }

  /* ----------------------------------------------------------- the stage */
  /** blend of the three vantages for the current moment */
  vantage(out) {
    const kA = smoothstep(0, PLAY_TIME, this.t), kR = this.roostK, V = VANTAGE;
    out.pos.lerpVectors(V[0].pos, V[1].pos, kA).lerp(V[2].pos, kR);
    out.az = lerp(lerp(V[0].az, V[1].az, kA), V[2].az, kR);
    return out;
  }
  /** a point in stage coordinates (metres to the right, up, and away from the lens's base position) */
  stage(side, up, depth, out = new THREE.Vector3()) {
    const v = this.vantage(this._vt || (this._vt = { pos: new THREE.Vector3(), az: 0 }));
    const dx = Math.sin(v.az), dz = -Math.cos(v.az);
    return out.set(v.pos.x + dx * depth - dz * side, up, v.pos.z + dz * depth + dx * side);
  }
  /** where the finger's ray meets the stage: a far wall of sky, and the water sloping back toward the lens */
  pointer(nx, ny, out) {
    const cam = this.G.camera;
    _ray.set(nx, ny, 0.5).unproject(cam).sub(cam.position).normalize();
    cam.getWorldDirection(_fwd);
    const far = this.far + 24 * Math.sin(nx * 1.9 + this.t * 0.07);
    const depth = _ray.y > 0.02 ? far : lerp(far, 52, clamp((0.02 - _ray.y) / 0.22, 0, 1));
    let along = depth / Math.max(0.25, _ray.dot(_fwd));
    // A finger has no depth. When its ray passes close to a wisp (or, at dusk, the tree) the light goes to that
    // thing's own distance, so pointing at something sends the flock to it and not past it.
    let bestK = 0, bestS = 0;
    const pull = (x, y, z, r0, r1) => {
      _w.set(x - cam.position.x, y - cam.position.y, z - cam.position.z);
      const s = _w.dot(_ray); if (s < 20) return;
      const k = 1 - smoothstep(r0, r1, Math.sqrt(Math.max(0, _w.lengthSq() - s * s)));
      if (k > bestK) { bestK = k; bestS = s; }
    };
    for (const g of this.wisps) if (!g.leaving && g.fly) pull(g.cx, g.cy, g.cz, 14, 36);
    if (this.phase === 'roost') pull(CROWN.x, CROWN.y + 10, CROWN.z, 30, 60);
    if (bestK > 0) along = lerp(along, bestS, bestK);
    out.copy(cam.position).addScaledVector(_ray, along);
    out.y = clamp(out.y, 9, 150);
    return out;
  }
  /** the play camera: stands at the vantage, pans a little way after the flock, widens as it grows */
  playPose(want) {
    const v = this.vantage(this._vp || (this._vp = { pos: new THREE.Vector3(), az: 0 })), p = this.flock.player, G = this.G;
    want.pos.copy(v.pos); want.pos.y += Math.sin(clock.realTime * 0.7) * 0.07;
    let az = v.az, pitch = 13 * DEG;
    if (p.fly > 0) {
      const dx = p.cx - v.pos.x, dz = p.cz - v.pos.z, hd = Math.hypot(dx, dz);
      az += clamp(wrap(Math.atan2(dx, -dz) - v.az), -30 * DEG, 30 * DEG) * 0.55;
      pitch += clamp(Math.atan2(p.cy - v.pos.y, hd) - 13 * DEG, -7 * DEG, 11 * DEG) * 0.45;
    }
    const c = Math.cos(pitch);
    want.target.set(v.pos.x + Math.sin(az) * c * 160, v.pos.y + Math.sin(pitch) * 160, v.pos.z - Math.cos(az) * c * 160);
    want.fov = (G.camera.aspect < 0.9 ? 66 : G.camera.aspect < 1.4 ? 55 : 49) + clamp((p.r - 20) / 60, 0, 1) * 7;
    want.roll = this.tilt;                             // the horizon tips while the falcon is coming down
  }

  /* ---------------------------------------------------------------- title */
  title() { this.runner.stop(); this.enterTitle(); }
  /** set the title scene up (without touching whichever script is running: `again` calls this from inside one) */
  enterTitle() {
    const G = this.G, f = this.flock;
    this.phase = 'title'; this.t = 0; this.roostK = 0; this.far = 145; this.lead = false;
    clock.scale = 1; this.slow = false; this.tilt = 0;
    for (const tag of ['slow', 'slow2', 'tilt', 'world']) uiTweens.cancelTag(tag);          // nothing of the last evening may reach into this one
    Object.assign(G.post.fx, { ca: 0, flash: 0, zoomBlur: 0, blurMix: 0 }); G.hud.marks([]); G.hud.mark(false);
    this.resetWorld();
    G.director.handheld(0.35);
    G.director.cut(pose(new THREE.Vector3(-20, 1.7, 207), new THREE.Vector3(12, 34, 40), G.camera.aspect < 0.9 ? 62 : 44));
    this.titleCam = G.director.follow((want) => {
      const a = clock.realTime * 0.035;
      want.pos.set(-20 + Math.sin(a) * 9, 1.7 + Math.sin(a * 1.7) * 0.25, 207);
      want.target.set(12 + (f.player.cx - 12) * 0.3, 34 + (f.player.cy - 34) * 0.3, 40);
      want.fov = G.camera.aspect < 0.9 ? 62 : 44; want.roll = 0;
    }, 1.2);
    G.hud.hud(false); G.hud.hideResults(); G.hud.hint(null); G.hud.title(true);
    G.post.fx.blurMix = 0; G.post.fx.fade = 0;
  }
  resetWorld() {
    const w = this.world, f = this.flock;
    f.reset(); this.falcon.cancel(); this.wisps.length = 0;
    w.setTod(0.05); w.lampK = 0; w.fireK = 0; w.beaconK = 0;
    this.stage(-10, 50, 135, _v); this.lure.jump(_v); this.lure.wantAlpha = 0; this.lure.cool = 1; this.lure.alert = 0;
    f.player.target.copy(_v);
    f.spawn(f.player, START_BIRDS, _v, 26, _w.set(1, 0, 0));
    for (let i = 0; i < f.max; i++) if (f.grp[i] === 0) f.alpha[i] = 1;
    this.gathered = 0; this.roostAcc = 0; this.stats = { hits: 0, dodges: 0, missed: 0 };
  }

  /* ---------------------------------------------------------------- begin */
  begin() {
    if (this.phase !== 'title') return;
    const G = this.G;
    this.phase = 'intro';
    G.audio.unlock(); G.audio.play('start'); G.audio.startMusic();
    G.hud.title(false);
    this.buildSchedule();
    this.runner.start('intro', async (s) => {
      G.director.handheld(0.16);
      const want = pose(new THREE.Vector3(), new THREE.Vector3(), 50);
      this.t = 0; this.playPose(want);
      await s.run(G.director.path({ points: [new THREE.Vector3(-12, 9, 222), want.pos.clone()], target: () => want.target, fov: want.fov, dur: 3.2, roll: 'bank', bank: 0.5, ease: Ease.inOutCubic }));
      G.director.follow((w) => this.playPose(w), 1.5, { lambdaTarget: 1.2, lambdaFov: 1.5 });
      this.phase = 'play'; this.t = 0; this.lead = true; input.leading = false; input.moved = 0;
      this.lure.wantAlpha = 1;
      G.hud.hud(true); G.hud.home(0, false);
      this.nextFalcon = param('nofalcon') === '1' ? 1e9 : 50 + Math.random() * 6;
      if (!this.G.auto) G.hud.hint(input.mouse ? 'hint.lead.mouse' : 'hint.lead');
    });
  }
  again() {
    const G = this.G;
    G.hud.hideResults(); G.post.fx.blurMix = 0;
    G.audio.stopMusic(0.8);
    this.runner.start('again', async (s) => {
      await s.run(uiTweens.to(G.post.fx, { fade: 1 }, { duration: 0.5 }).promise);
      this.enterTitle();
      document.getElementById('title').hidden = true; G.post.fx.fade = 1;
      await s.run(uiTweens.to(G.post.fx, { fade: 0 }, { duration: 0.6 }).promise);
      this.begin();
    });
  }

  /** every wisp of strays this evening will send, decided up front (so a seed replays the same evening) */
  buildSchedule() {
    const rng = mulberry32(this.G.seed), k = this.flock.max / 5000, ev = [];
    const add = (t, n, speed, roost = false) => ev.push({ t, n: Math.round(n * k), speed, roost });
    for (let t = 6; t < 56; t += 6.5 + rng() * 2.5) add(t, 55 + rng() * 45, 13);
    for (let t = 58; t < 116; t += 7 + rng() * 3) add(t, 140 + rng() * 110, 15);
    for (let t = 118; t < 158; t += 7 + rng() * 2.5) add(t, 300 + rng() * 170, 17);
    add(PLAY_TIME + 9, 210, 17, true); add(PLAY_TIME + 21, 250, 18, true);
    this.schedule = ev; this.rng = rng;
    this.total = START_BIRDS + ev.reduce((s, e) => s + e.n, 0);
  }

  /* --------------------------------------------------------------- wisps */
  spawnWisp(e) {
    const f = this.flock, rng = this.rng, g = f.newGroup('wisp', 1);
    if (!g) return;
    const side = rng() < 0.5 ? -1 : 1, d = () => 95 + rng() * (e.roost ? 60 : 80), h = () => 20 + rng() * 72;
    const pts = [
      this.stage(side * (185 + rng() * 40), 35 + rng() * 55, 130 + rng() * 60),
      this.stage(side * (45 + rng() * 70), h(), d()),
      this.stage(-side * rng() * 90, h(), d()),
      this.stage(-side * (55 + rng() * 60), h(), d()),
      this.stage(-side * 220, 45 + rng() * 50, 140 + rng() * 50),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    g.data = { curve, u: 0, len: curve.getLength(), speed: e.speed, age: 0 };
    g.target.copy(pts[0]); g.speed = e.speed / 18;
    const made = f.spawn(g, e.n, pts[0], 10 + Math.cbrt(e.n) * 2.2, _v.subVectors(pts[1], pts[0]));
    if (!made) { g.active = false; return; }
    this.wisps.push(g);
    if (!this.seen.gather && !this.G.auto) { this.seen.gather = true; this.G.hud.hint('hint.gather', { hold: 5 }); }
  }
  updateWisps(dt) {
    const f = this.flock, p = f.player, G = this.G;
    for (let i = this.wisps.length - 1; i >= 0; i--) {
      const g = this.wisps[i], d = g.data;
      if (!g.active || (g.leaving && g.n === 0)) { g.active = false; this.wisps.splice(i, 1); continue; }
      d.age += dt;
      if (g.kind === 'scatter') {                    // knocked loose by the falcon: flee, then wander until gathered or gone
        g.target.copy(d.from).addScaledVector(d.dir, 50 + d.age * 15); g.target.y = clamp(d.from.y + Math.sin(d.age * 0.7) * 22, 16, 120);
        if (d.age > 15 && !g.leaving) { f.release(g); this.stats.missed += g.n; }
      } else if (!g.leaving) {
        d.u += d.speed * dt / d.len;
        if (d.u >= 1) { f.release(g); this.stats.missed += g.n; g.target.copy(d.curve.getPointAt(1)).addScaledVector(d.curve.getTangentAt(1), 200); }
        else d.curve.getPointAt(d.u, g.target);
      }
      if (g.leaving || !g.fly || !p.fly || (g.kind === 'scatter' && d.age < 3)) continue;
      // the flock sweeps through a wisp (or the light does): they are one flock now
      // (the flock has to touch them: a handful of its birds among theirs, or the two centres closing)
      const dist = Math.hypot(g.cx - p.cx, g.cy - p.cy, g.cz - p.cz);
      if (dist < 9 + 0.4 * (p.r + g.r) || (dist < p.r * 3 + 60 && f.countNear(p, g.cx, g.cy, g.cz, Math.max(12, g.r * 1.15)) >= 8)) {
        const n = f.merge(g, p);
        this.wisps.splice(i, 1);
        if (g.kind !== 'scatter') this.gathered += n;
        const sx = _v.set(g.cx, g.cy, g.cz).project(G.camera).x;
        G.audio.play('gather', { n, pan: clamp(sx, -1, 1) * 0.7 });
        G.director.punch(1.2 + Math.min(3, n / 120));
        this.lure.flarePulse();
        // a big wisp joining is worth a held breath
        if (n >= 180 && this.falcon.state !== 'stoop' && (this.phase === 'play' || this.phase === 'roost')) { this.slowmo(0.5, 0.12); uiTweens.add({ duration: 0.42, tag: 'slow2', onComplete: () => { if (this.falcon.state !== 'stoop' && this.phase !== 'call') this.slowmo(1, 0.45); } }); }
      }
    }
  }

  /* -------------------------------------------------------------- flare */
  flare() {
    if (this.paused || !(this.phase === 'play' || this.phase === 'roost') || this.lure.cool < 1) return;
    const G = this.G, f = this.flock, p = f.player;
    if (!p.fly) return;
    f.flare = 0.8; f.flareAt.set(p.cx, p.cy, p.cz);
    this.lure.cool = 0; this.lure.flarePulse();
    G.audio.play('flare'); G.director.punch(3);
    _v.set(p.cx, p.cy, p.cz).project(G.camera);
    G.post.fx.zoomCenter.set(clamp(_v.x * 0.5 + 0.5, 0, 1), clamp(_v.y * 0.5 + 0.5, 0, 1));
    G.post.fx.zoomBlur = 0.07; uiTweens.to(G.post.fx, { zoomBlur: 0 }, { duration: 0.5, ease: Ease.outQuad });
    if (G.hud.hintKey && G.hud.hintKey.startsWith('hint.flare')) G.hud.hint(null);
  }

  /* ------------------------------------------------------------- falcon */
  falconCb() {
    const G = this.G, f = this.flock;
    return this._fcb || (this._fcb = {
      lock: () => { G.audio.play('lock'); this.lure.alert = 1; },
      stoop: () => { G.audio.play('stoop', { pan: this.screenX(this.falcon.pos) * 0.7 }); uiTweens.cancelTag('tilt'); uiTweens.to(this, { tilt: (this.screenX(this.falcon.pos) > 0 ? -1 : 1) * 0.07 }, { duration: 0.5, tag: 'tilt' }); },
      // the dive, slowed: this is the moment to scatter (and, until the player has done it once, the moment to say so)
      near: () => { this.slowmo(0.3, 0.12); G.director.punch(-4); if (!this.seen.flare && !G.auto) G.hud.hint(input.mouse ? 'hint.flare.mouse' : 'hint.flare', { tap: true, hold: 4 }); },
      strike: (hit, at, dir, flared) => {
        if (!hit && flared && !this.seen.flare) { this.seen.flare = true; store.set('mm_seen_flare', '1'); }
        this.slowmo(1, 0.5); this.lure.alert = 0;
        uiTweens.cancelTag('tilt'); uiTweens.to(this, { tilt: 0 }, { duration: 0.9, tag: 'tilt' });
        if (hit) {
          this.stats.hits++;
          // the falcon takes a bite out of the flock, not the flock: the birds nearest its path break away
          const g = f.split(f.player, at.x, at.y, at.z, clamp(f.player.r * 0.8, 10, 21));
          if (g) { _v.set(-dir.z, 0, dir.x).multiplyScalar(Math.random() < 0.5 ? -1 : 1).addScaledVector(dir, 0.6).normalize(); g.data = { age: 0, from: at.clone(), dir: _v.clone() }; g.speed = 1.25; this.wisps.push(g); }
          this.world.burst(at, dir);
          G.audio.play('hit'); G.director.shake(0.62);
          G.post.fx.ca = 0.014; uiTweens.to(G.post.fx, { ca: 0 }, { duration: 0.8 });
          G.post.fx.flash = 0.16; uiTweens.to(G.post.fx, { flash: 0 }, { duration: 0.45 });
        } else { this.stats.dodges++; G.audio.play('dodge'); G.director.punch(2.5); }
        G.hud.hint(null);
      },
    });
  }
  updateFalcon(dt) {
    const G = this.G, fa = this.falcon, p = this.flock.player;
    if (!fa.busy && this.t > this.nextFalcon && p.fly >= 220 && (this.phase === 'roost' || this.t < PLAY_TIME - 9)) {
      fa.attack(this.flock, G.camera);
      G.audio.play('falcon', { pan: this.screenX(fa.pos) * 0.8 });
      const act3 = this.t > 115;
      this.nextFalcon = this.phase === 'roost' ? 1e9 : this.t + (act3 ? 17 + Math.random() * 6 : 24 + Math.random() * 8);
    }
    fa.update(dt, this.flock, this.falconCb());
    // a chevron at the edge of the screen while it is out of sight
    if (fa.busy && fa.state !== 'leave') {
      _v.copy(fa.pos).project(G.camera);
      const behind = _v.z > 1, off = behind || Math.abs(_v.x) > 0.94 || Math.abs(_v.y) > 0.9;
      if (off) {
        let x = _v.x * (behind ? -1 : 1), y = _v.y * (behind ? -1 : 1); const m = Math.max(Math.abs(x) / 0.9, Math.abs(y) / 0.84, 1e-3);
        x /= m; y /= m;
        G.hud.mark(true, (x * 0.5 + 0.5) * innerWidth, (-y * 0.5 + 0.5) * innerHeight, Math.atan2(x, y));
      } else G.hud.mark(false);
    } else G.hud.mark(false);
  }
  slowmo(scale, dur) { uiTweens.cancelTag('slow'); uiTweens.to(clock, { scale }, { duration: dur, ease: Ease.outQuad, tag: 'slow' }); }
  screenX(v) { return clamp(_p.copy(v).project(this.G.camera).x, -1, 1); }

  /* --------------------------------------------------------- roost, finale */
  callHome() {
    const G = this.G, w = this.world;
    this.phase = 'call'; this.lead = false;
    this.runner.start('call', async (s) => {
      G.audio.play('bell'); G.hud.caption('roost.call'); G.hud.hint(null);
      uiTweens.to(w, { lampK: 1 }, { duration: 5, ease: Ease.linear, tag: 'world' }); uiTweens.to(w, { beaconK: 1 }, { duration: 2.5, tag: 'world' }); uiTweens.to(w, { fireK: 1 }, { duration: 8, ease: Ease.linear, tag: 'world' });
      this.slowmo(0.4, 0.5);
      G.director.handheld(0.05);
      // crash in on the tree, then the vertigo shot: the lens travels to it while it zooms out, so the tree holds its
      // size and the whole sky behind it stretches
      const cam = G.director.current().pos, dir = _v.subVectors(cam, CROWN).normalize().clone(), from = cam.distanceTo(CROWN), size = 82;
      await s.run(G.director.whip(pose(cam, CROWN, 2 * Math.atan(size / (2 * from)) / DEG), 0.7));
      await s.run(G.director.dolly({ subject: CROWN, dir, size, from, to: 140, dur: 3.6, ease: Ease.inOutSine }));
      this.far = 140; this.roostK = 1;
      G.director.handheld(0.16);
      G.director.follow((wn) => this.playPose(wn), 1.3, { lambdaTarget: 1.1, lambdaFov: 1.0 });
      this.slowmo(1, 0.8);
      this.phase = 'roost'; this.lead = true; this.roostT = 0;
      this.nextFalcon = this.t + 13;
      G.hud.home(0, true);
    });
  }
  updateRoost(dt) {
    const f = this.flock, p = f.player, G = this.G;
    this.roostT += dt;
    if (p.fly > 0 && this.lure.pos.distanceTo(CROWN) < 62) {
      const near = f.countNear(p, CROWN.x, CROWN.y + 8, CROWN.z, 48);
      this.roostAcc += Math.min(260, 70 + near * 0.07) * dt * (near > 0 ? 1 : 0);
      const q = Math.floor(this.roostAcc);
      if (q > 0) { this.roostAcc -= q; f.roost(q, CROWN.x, CROWN.y + 8, CROWN.z, 48, { next: () => this.world.nextPerch() }); }
    }
    const air = p.n - f.home;                                         // still on the wing (flying or on the way down)
    const done = this.roostT > ROOST_TIME || (air === 0 && !this.wisps.some((g) => !g.leaving) && this.roostT > 3 && this.t > PLAY_TIME + 34);
    if (done) this.finale();
  }
  finale() {
    const G = this.G, f = this.flock, w = this.world;
    this.phase = 'finale'; this.lead = false; this.lure.wantAlpha = 0;
    this.falcon.cancel(); this.slowmo(1, 0.3); G.hud.mark(false); G.hud.marks([]); G.hud.hint(null);
    // whoever is still in the air is lost to the dark
    const lost = f.split(f.player, 0, 0, 0, 1e5, 'lost');
    if (lost) { lost.target.set(CROWN.x - 300, 160, CROWN.z - 500); f.release(lost); }
    for (const g of this.wisps) if (!g.leaving) f.release(g);
    this.runner.start('finale', async (s) => {
      G.audio.mood(0); G.audio.play('end');
      const tod0 = w.tod;
      uiTweens.value(tod0, 0.93, 12, (v) => w.setTod(v), { ease: Ease.inOutSine, tag: 'world' });
      const cam = G.director.current().pos, a0 = Math.atan2(cam.x - CROWN.x, cam.z - CROWN.z) / DEG;
      G.director.handheld(0.1);
      // the tree sits low in the frame, its lights under a sky of stars (and room above it for the count)
      G.director.orbit({ center: CROWN, radius: [cam.distanceTo(CROWN), 100], height: [cam.y - CROWN.y, -13], from: a0, to: a0 - 62, fov: [G.director.base.fov, 40], lookOffset: new THREE.Vector3(0, 27, 0), dur: 15, ease: Ease.inOutSine, blendIn: 0.3 });
      await s.waitReal(5.2);
      const home = f.home, share = home / Math.max(1, this.total);
      const rank = share >= 0.8 ? 3 : share >= 0.55 ? 2 : share >= 0.25 ? 1 : 0;
      const isBest = home > this.best;
      if (isBest) { this.best = home; store.set('mm_best', home); }
      this.result = { home, total: this.total, rank, share, ...this.stats };
      G.hud.hud(false);
      uiTweens.to(G.post.fx, { blurMix: 0.16 }, { duration: 1.2, tag: 'world' }); uiTweens.to(w, { beaconK: 0.25 }, { duration: 3, tag: 'world' });
      this.phase = 'results';
      G.hud.results({ home, rank, best: this.best, isBest });
      await s.waitReal(8); G.audio.stopMusic(6);
    });
  }

  togglePause(force) {
    const on = force ?? !this.paused;
    if (on === this.paused || !(this.phase === 'play' || this.phase === 'roost' || this.phase === 'call')) return;
    const G = this.G;
    this.paused = on; clock.paused = on; G.audio.pause(on); G.hud.pause(on);
    G.post.fx.blurMix = on ? 0.7 : 0;
  }

  /* --------------------------------------------------------------- frame */
  update(dt, ui) {
    const G = this.G, w = this.world, f = this.flock, p = f.player, ph = this.phase;
    input.update(ui);

    // the light: under the finger, or wandering by itself
    if (this.lead && !G.auto) {
      if (input.leading) { this.pointer(input.x, input.y, this.lure.target); if (!this.seen.lead) { this.seen.lead = true; setTimeout(() => { if (G.hud.hintKey && G.hud.hintKey.startsWith('hint.lead')) G.hud.hint(null); }, 2600); } }
    } else if (ph === 'title' || ph === 'intro') {
      const a = clock.time * 0.33;
      this.stage(Math.sin(a) * 75, 48 + Math.sin(a * 2.1) * 24, 135 + Math.cos(a * 0.8) * 30, this.lure.target);
    } else if (G.auto && this.lead) this.autopilot(dt);
    p.target.copy(this.lure.pos);
    if (this.lure.cool < 1) this.lure.cool = Math.min(1, this.lure.cool + dt / 3.2);

    if (ph === 'play' || ph === 'call' || ph === 'roost') {
      this.t += dt;
      // the sun: down to the bank by the end of play, to dusk through the roost
      const tod = this.t < PLAY_TIME ? lerp(0.05, TOD_SUNSET, this.t / PLAY_TIME) : lerp(TOD_SUNSET, TOD_DUSK, clamp((this.t - PLAY_TIME) / (ROOST_TIME + 6), 0, 1));
      w.setTod(tod);
      while (this.schedule.length && this.schedule[0].t <= this.t) this.spawnWisp(this.schedule.shift());
      this.updateWisps(dt);
      this.updateFalcon(dt);
      if (ph === 'play' && this.t >= PLAY_TIME) this.callHome();
      if (ph === 'roost') this.updateRoost(dt);
      G.audio.mood(clamp(this.t / PLAY_TIME, 0, 1));
      G.hud.count(p.n - f.home); G.hud.sun((tod - 0.05) / (TOD_SUNSET - 0.05));
      // strays out of sight: a rose dot at the edge of the screen, on the side they are
      const marks = [];
      for (const g of this.wisps) {
        if (g.leaving || !g.fly || marks.length >= 4) continue;
        _v.set(g.cx, g.cy, g.cz).project(G.camera);
        const behind = _v.z > 1; if (!behind && Math.abs(_v.x) < 0.97 && Math.abs(_v.y) < 0.95) continue;
        let x = _v.x * (behind ? -1 : 1), y = clamp(_v.y * (behind ? -1 : 1), -0.8, 0.8); x = x < 0 ? -0.965 : 0.965;
        marks.push([(x * 0.5 + 0.5) * innerWidth, (-y * 0.5 + 0.5) * innerHeight]);
      }
      G.hud.marks(marks);
    } else if (ph === 'finale' || ph === 'results') this.updateWisps(dt);

    if (f.arrived) {                                    // birds touching down: a patter of high notes, and the count
      const n = f.arrived; f.arrived = 0;
      for (let i = 0; i < Math.min(n, 2); i++) G.audio.play('perch', { minGap: 0.045 });
      G.hud.home(f.home, true);
    }
    G.post.fx.exposure = w.sky.exposure;
    // the bed of sound: how much wing noise, from where
    const dist = Math.hypot(p.cx - G.camera.position.x, p.cy - G.camera.position.y, p.cz - G.camera.position.z) + 1;
    const loud = p.fly ? clamp(Math.sqrt(p.fly) / 70, 0, 1) * clamp(90 / dist, 0.25, 1.6) : 0;
    G.audio.scene({ wings: loud, pan: p.fly ? this.screenX(_v.set(p.cx, p.cy, p.cz)) * 0.7 : 0, speed: clamp((Math.hypot(p.vx, p.vy, p.vz) - 8) / 16, 0, 1),
      night: smoothstep(0.6, 0.9, w.tod), birds: f.active - f.home, dt: ui, quiet: ph === 'boot' });
  }

  /** ?auto=1: a player made of three habits (go to the nearest wisp, flare when the falcon is close, go home at dusk) */
  autopilot(dt) {
    const f = this.flock, p = f.player, lt = this.lure.target;
    if (this.phase === 'roost') { lt.set(CROWN.x + Math.sin(this.t * 0.6) * 9, CROWN.y + 16, CROWN.z + Math.cos(this.t * 0.6) * 9); }
    else {
      let best = null, bd = 1e9;
      for (const g of this.wisps) { if (g.leaving || !g.fly) continue; const d = Math.hypot(g.cx - p.cx, g.cy - p.cy, g.cz - p.cz); if (d < bd) { bd = d; best = g; } }
      if (best) lt.set(best.cx + best.vx * 0.8, clamp(best.cy, 12, 140), best.cz + best.vz * 0.8);
      else { this.autoT += dt; this.stage(Math.sin(this.autoT * 0.4) * 70, 50 + Math.sin(this.autoT * 0.9) * 22, 135, lt); }
    }
    if (this.falcon.state === 'stoop' && this.falcon.pos.distanceTo(_v.set(p.cx, p.cy, p.cz)) < 48 && param('noflare') !== '1') this.flare();
  }
}
