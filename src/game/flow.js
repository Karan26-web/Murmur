// ---------------------------------------------------------------------------
// One evening, start to finish: ten questions of heights and distances.
//
//   title    the flock wheels by itself over the lake
//   transit  the next lamp lights; the player leads the flock to it by hand,
//            sweeping up fledglings on the way
//   sight    a wisp of strays circles above the water. The triangle draws itself
//            (plumb line, the water with a diya every 10 m, the line of sight, the
//            angle). The player chooses the missing side or angle and scouts fly
//            exactly that answer: perfect, too low, too high, too short, too far.
//            A miss sends a third of the wisp away and climbs the hint ladder:
//            the missing idea → the set-up → the whole working, flown for them.
//   falcon   a timed angle-of-depression question: where will its dive meet the
//            water? The flock opens at the place the player chose.
//   tree     the banyan at dusk: two angles of elevation 40 m apart
//   roost    the flock pours into the tree; finale; how many came home
//
// The score is the number of birds that came home, so it measures accuracy and
// nothing else. Nobody is ever stopped: three misses and the answer is shown.
// ---------------------------------------------------------------------------
import * as THREE from '../../vendor/three.module.js';
import { ScriptRunner, clock } from '../engine/clock.js';
import { tweens, uiTweens } from '../engine/tween.js';
import { pose } from '../engine/camera.js';
import { Ease, clamp, lerp, DEG, store, param } from '../engine/util.js';
import { input } from '../engine/input.js';
import { t } from '../engine/i18n.js';
import { TREE, CANOPY, LAMP_Y } from '../world/land.js';
import { TOD_SUNSET } from '../world/sky.js';
import { INK } from '../world/lines.js';
import { buildPlan, endpoint, outcome } from './problems.js';

export const START_BIRDS = 300;
const STAGE = 170;                          // metres from the lens to the plane the triangles stand on
const SHARE = [1, 0.66, 0.33, 0.15];        // of a wisp that joins after 0, 1, 2 misses, and once the working has been shown
const FALCON_TIME = 35, FALCON_TAKES = 0.12, TREE_MISS = 0.08, SCOUTS = 70;
const TOD_DUSK = 0.82;
// where the lens stands: the south bank at golden hour, drifting west by sunset, then out on the water near the tree
const VANTAGE = [
  { pos: new THREE.Vector3(0, 3.0, 215), az: 2 * DEG },
  { pos: new THREE.Vector3(-56, 2.7, 208), az: 15 * DEG },
  { pos: new THREE.Vector3(6.6, 3.2, 84.8), az: 27 * DEG },
];
const CROWN = new THREE.Vector3(TREE.x, CANOPY.y, TREE.z);
const UP = new THREE.Vector3(0, 1, 0), NOCB = {};
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _ray = new THREE.Vector3(), _p = new THREE.Vector3();
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const V3 = (v) => v.clone();

export class Flow {
  constructor(G) {
    this.G = G; this.world = G.world; this.flock = G.world.flock; this.falcon = G.world.falcon; this.lure = G.world.lure;
    this.runner = new ScriptRunner();
    this.phase = 'boot'; this.phaseT = 0; this.kA = 0; this.roostK = 0; this.tilt = 0; this.tod = 0.05; this.todWant = 0.05;
    this.plane = null; this.view = null; this.goal = null; this.station = new THREE.Vector3(); this.follow = 'lure'; this.lead = false;
    this.plan = []; this.qi = 0; this.L = null; this.wisp = null; this.scouts = null; this.scoutsHome = false; this.fledges = []; this.answerLine = null;
    this.total = START_BIRDS; this.asked = 0; this.firstTry = 0; this.evenings = 0; this.roostAcc = 0; this.paused = false; this.fcb = NOCB;
    this.best = +store.get('mm_best', 0) || 0;
    this.seen = { lead: false, scouts: false, gap: false, dep: false };
    this.autoMiss = +param('miss', 0);
    this._va = { pos: new THREE.Vector3(), az: 0 }; this._vb = { pos: new THREE.Vector3(), az: 0 };

    input.on('pause', () => this.togglePause());
    input.on('mute', () => { G.audio.toggleMute(); G.hud.soundLabel(); });
    input.on('confirm', () => { if (this.phase === 'title') this.begin(); else if (this.phase === 'results') this.again(); });
    const click = (id, fn) => document.getElementById(id).addEventListener('click', (e) => { e.stopPropagation(); G.audio.unlock(); G.audio.play('ui'); fn(); });
    click('btnPlay', () => this.begin()); click('btnPause', () => this.togglePause()); click('btnResume', () => this.togglePause(false));
    click('btnRestart', () => { this.togglePause(false); this.again(); }); click('btnAgain', () => this.again());
    click('btnSound', () => { G.audio.toggleMute(); G.hud.soundLabel(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.togglePause(true); });
  }
  get playing() { return ['transit', 'sight', 'falcon', 'tree', 'roost'].includes(this.phase); }

  /* ----------------------------------------------------------- the stage */
  /** blend of the three vantages for the current moment */
  vantage(out) {
    const V = VANTAGE;
    out.pos.lerpVectors(V[0].pos, V[1].pos, this.kA).lerp(V[2].pos, this.roostK);
    out.az = lerp(lerp(V[0].az, V[1].az, this.kA), V[2].az, this.roostK);
    return out;
  }
  /** stand the plane the next triangle is drawn on: square to the lens, STAGE metres out */
  makePlane() {
    const v = this.vantage(this._va), dx = Math.sin(v.az), dz = -Math.cos(v.az);
    this.plane = { o: new THREE.Vector3(v.pos.x + dx * STAGE, 0, v.pos.z + dz * STAGE), r: new THREE.Vector3(-dz, 0, dx), n: new THREE.Vector3(dx, 0, dz) };
  }
  /** a point on the plane: s metres along the water (to the lens's right), y metres up */
  P(s, y, out = new THREE.Vector3()) { const pl = this.plane; return out.set(pl.o.x + pl.r.x * s, y, pl.o.z + pl.r.z * s); }
  /** where the finger's ray meets the plane. A finger has no depth, so near a thing worth reaching the light takes that thing's distance. */
  pointer(nx, ny, out) {
    const cam = this.G.camera, pl = this.plane;
    _ray.set(nx, ny, 0.5).unproject(cam).sub(cam.position).normalize();
    const den = _ray.dot(pl.n);
    let along = den > 0.05 ? _w.subVectors(pl.o, cam.position).dot(pl.n) / den : STAGE;
    let bestK = 0, bestS = 0;
    const pull = (x, y, z, r0, r1) => {
      _w.set(x - cam.position.x, y - cam.position.y, z - cam.position.z);
      const s = _w.dot(_ray); if (s < 20) return;
      const off = Math.sqrt(Math.max(0, _w.lengthSq() - s * s)), k = off < r0 ? 1 : off > r1 ? 0 : 1 - (off - r0) / (r1 - r0);
      if (k > bestK) { bestK = k; bestS = s; }
    };
    for (const g of this.fledges) if (g.active && !g.leaving && g.fly) pull(g.cx, g.cy, g.cz, 12, 30);
    if (this.goal) pull(this.goal.x, this.goal.y, this.goal.z, 26, 56);
    if (bestK > 0) along = lerp(along, bestS, bestK);
    out.copy(cam.position).addScaledVector(_ray, along);
    out.y = clamp(out.y, 9, 150);
    return out;
  }
  /** the camera between questions: stands at the vantage and keeps the flock and where it is going in the frame */
  playPose(want) {
    const v = this.vantage(this._vb), p = this.flock.player, G = this.G;
    want.pos.copy(v.pos); want.pos.y += Math.sin(clock.realTime * 0.7) * 0.07;
    let az = v.az, pitch = 13 * DEG;
    if (p.fly > 0) {
      let fx = p.cx, fy = p.cy, fz = p.cz;
      if (this.goal) { fx = (fx + this.goal.x) / 2; fy = (fy + this.goal.y) / 2; fz = (fz + this.goal.z) / 2; }
      const dx = fx - v.pos.x, dz = fz - v.pos.z;
      az += clamp(wrap(Math.atan2(dx, -dz) - v.az), -32 * DEG, 32 * DEG) * 0.6;
      pitch += clamp(Math.atan2(fy - v.pos.y, Math.hypot(dx, dz)) - 13 * DEG, -8 * DEG, 11 * DEG) * 0.5;
    }
    const c = Math.cos(pitch);
    want.target.set(v.pos.x + Math.sin(az) * c * 160, v.pos.y + Math.sin(pitch) * 160, v.pos.z - Math.cos(az) * c * 160);
    want.fov = (G.camera.aspect < 0.9 ? 66 : G.camera.aspect < 1.4 ? 55 : 49) + clamp((p.r - 20) / 60, 0, 1) * 6;
    want.roll = this.tilt;
  }
  /** the camera on a question: a long lens from the bank, sized so the triangle fills the screen beside the dock */
  sightPose(want) {
    const G = this.G, v = this.vantage(this._vb), V = this.view, asp = G.camera.aspect, tall = asp < 0.9;
    this.P(V.cs, LAMP_Y, _v);
    const D = Math.hypot(_v.x - v.pos.x, _v.z - v.pos.z);
    const fov = clamp(2 * Math.atan(Math.max(V.h / (tall ? 0.42 : 0.62), V.w / ((tall ? 0.92 : 0.6) * asp)) / (2 * D)) / DEG, 11, 62);
    const fh = 2 * D * Math.tan(fov * DEG / 2), fw = fh * asp;
    this.P(V.cs + (tall ? 0 : 0.155 * fw), LAMP_Y + (tall ? 0.06 : 0.29) * fh, want.target);
    want.pos.copy(v.pos); want.pos.y += 9.5 + Math.sin(clock.realTime * 0.7) * 0.05;     // up above the reeds: the water lies open, like a page
    want.fov = fov; want.roll = this.tilt;
  }
  camPose(want) { if (this.view) this.sightPose(want); else this.playPose(want); }
  near(pt, r) { const p = this.flock.player; return p.fly > 0 && Math.hypot(p.cx - pt.x, p.cy - pt.y, p.cz - pt.z) < r; }

  /* ---------------------------------------------------------------- title */
  title() { this.runner.stop(); this.enterTitle(); }
  /** set the title scene up (without touching whichever script is running: `again` calls this from inside one) */
  enterTitle() {
    const G = this.G, f = this.flock, w = this.world;
    this.phase = 'title'; this.kA = 0; this.roostK = 0; this.lead = false; this.view = null; this.goal = null; this.follow = 'lure'; this.tilt = 0;
    clock.scale = 1;
    for (const tag of ['slow', 'tilt', 'world', 'diagram']) { uiTweens.cancelTag(tag); tweens.cancelTag(tag); }   // nothing of the last evening may reach into this one
    Object.assign(G.post.fx, { ca: 0, flash: 0, zoomBlur: 0, blurMix: 0, fade: 0 });
    f.reset(); this.falcon.cancel(); this.fcb = NOCB; w.resetEvening(); G.labels.clear(); G.dock.hide();
    this.wisp = null; this.scouts = null; this.scoutsHome = false; this.fledges = []; this.answerLine = null;
    this.tod = this.todWant = 0.05; w.setTod(0.05); w.lampK = 0; w.fireK = 0; w.beaconK = 0;
    this.makePlane();
    this.P(-10, 50, _v).addScaledVector(this.plane.n, -35); this.lure.jump(_v); this.lure.wantAlpha = 0; this.lure.alert = 0; this.lure.cool = 1;
    f.player.target.copy(_v); f.spawn(f.player, START_BIRDS, _v, 26, _w.set(1, 0, 0));
    for (let i = 0; i < f.max; i++) if (f.grp[i] === 0) f.alpha[i] = 1;
    this.total = START_BIRDS; this.asked = 0; this.firstTry = 0; this.roostAcc = 0;
    G.director.handheld(0.35);
    const fov = G.camera.aspect < 0.9 ? 62 : 44;
    G.director.cut(pose(new THREE.Vector3(-20, 1.7, 207), new THREE.Vector3(12, 34, 40), fov));
    G.director.follow((want) => {
      const a = clock.realTime * 0.035;
      want.pos.set(-20 + Math.sin(a) * 9, 1.7 + Math.sin(a * 1.7) * 0.25, 207);
      want.target.set(12 + (f.player.cx - 12) * 0.3, 34 + (f.player.cy - 34) * 0.3, 40);
      want.fov = fov; want.roll = 0;
    }, 1.2);
    G.hud.hud(false); G.hud.hideResults(); G.hud.hint(null); G.hud.mark(false); G.hud.marks([]); G.hud.title(true);
  }
  begin() {
    if (this.phase !== 'title') return;
    const G = this.G;
    this.phase = 'intro';
    G.audio.unlock(); G.audio.play('start'); G.audio.startMusic();
    G.hud.title(false);
    this.plan = buildPlan(G.seed + this.evenings++ * 7919, clamp((this.flock.max - 400) / 3400, 0.5, 1.35));
    const skip = clamp(+param('q', 0) | 0, 0, this.plan.length - 1);          // ?q=N: start the evening at its Nth question (QA)
    if (skip) { this.plan = this.plan.slice(skip); const f = this.flock, n = f.spawn(f.player, 260 * skip, this.lure.pos, 40); this.total += n; }
    this.runner.start('evening', (s) => this.evening(s));
  }
  again() {
    const G = this.G;
    G.hud.hideResults(); G.audio.stopMusic(0.8);
    this.runner.start('again', async (s) => {
      await s.run(uiTweens.to(G.post.fx, { fade: 1 }, { duration: 0.5 }).promise);
      this.enterTitle();
      document.getElementById('title').hidden = true; G.post.fx.fade = 1;
      await s.run(uiTweens.to(G.post.fx, { fade: 0 }, { duration: 0.6 }).promise);
      this.begin();
    });
  }

  /* ---------------------------------------------------------- the evening */
  async evening(s) {
    const G = this.G, n = this.plan.length;
    // the first lamp lights while the lens cranes up out of the reeds
    this.qi = 0;
    await this.transit(s, this.plan[0], true);
    G.director.handheld(0.14);
    const want = pose(new THREE.Vector3(), new THREE.Vector3(), 50); this.playPose(want);
    await s.run(G.director.path({ points: [new THREE.Vector3(-12, 9, 222), want.pos.clone()], target: () => want.target, fov: want.fov, dur: 3.0, roll: 'bank', bank: 0.5, ease: Ease.inOutCubic }));
    G.director.follow((w) => this.camPose(w), 1.7, { lambdaTarget: 1.5, lambdaFov: 1.6 });
    G.hud.hud(true); G.hud.pips(n); G.hud.home(0, false);
    for (this.qi = 0; this.qi < n; this.qi++) {
      const q = this.plan[this.qi];
      G.hud.pip(this.qi, 'now');
      this.todWant = lerp(0.05, TOD_SUNSET - 0.02, this.qi / (n - 1));
      uiTweens.to(this, { kA: clamp(this.qi / (n - 2), 0, 1) }, { duration: 9, ease: Ease.inOutSine, tag: 'world' });   // the lens drifts west with the sun
      let misses;
      if (q.kind === 'sight') { if (this.qi > 0) await this.transit(s, q, false); misses = await this.sighting(s, q); }
      else if (q.kind === 'falcon') misses = await this.falconDive(s, q);
      else misses = await this.treeSight(s, q);
      this.asked++; if (misses === 0) this.firstTry++;
      G.hud.pip(this.qi, misses === 0 ? 'gold' : q.kind === 'falcon' ? 'lost' : 'ok');
    }
    await this.roost(s);
    await this.finale(s);
  }

  /** Where a sighting stands on the stage: the lamp A, the foot B, the strays C, and where the flock waits (M). */
  layout(q, sigma) {
    this.makePlane();
    const xL = -18 - sigma * q.nd / 2;
    return { q, sigma, xL, A: this.P(xL, LAMP_Y), B: this.P(xL + sigma * q.nd, LAMP_Y), C: this.P(xL + sigma * q.nd, LAMP_Y + q.nh),
      M: this.P(xL - sigma * 48, 34), ux: this.plane.r.clone().multiplyScalar(sigma) };
  }

  /** the next lamp lights; the player leads the flock to it, sweeping up fledglings on the way */
  async transit(s, q, first) {
    const G = this.G, f = this.flock, w = this.world;
    const L = (this.L = this.layout(q, this.qi % 2 ? -1 : 1));
    this.view = null;
    for (const old of w.posts) uiTweens.to(old, { k: 0 }, { duration: 0.8, tag: 'world' });      // (an old lamp on the water would read as a distance marker)
    const post = w.addPost(L.A.x, L.A.z);
    uiTweens.to(post, { k: 1 }, { duration: 1.4, delay: 0.5, tag: 'world' });
    if (first) { this.station.copy(L.M); this.follow = 'station'; this.lure.wantAlpha = 0; return; }
    G.audio.play('ask');
    this.phase = 'transit'; this.phaseT = 0; this.goal = L.M; this.follow = 'lure'; this.lead = true; input.leading = false; input.moved = 0;
    this.lure.jump(_v.set(f.player.cx, f.player.cy, f.player.cz)); this.lure.wantAlpha = 1;
    w.setGoal(L.A.x, L.A.z); uiTweens.to(w, { goalK: 1 }, { duration: 1, tag: 'world' });        // a beam over the lamp to lead them to
    this.spawnFledges(L);
    if (!this.seen.lead && !G.auto) G.hud.hint(input.mouse ? 'hint.lead.mouse' : 'hint.lead');
    await s.until(() => this.near(L.M, 30) || this.phaseT > 14);
    this.lead = false; this.lure.target.copy(L.M); G.hud.hint(null);
    if (input.leading) this.seen.lead = true;
    await s.until(() => this.near(L.M, 36) || this.phaseT > 20);
    this.goal = null; this.station.copy(L.M); this.follow = 'station'; this.lure.wantAlpha = 0;
    uiTweens.to(w, { goalK: 0 }, { duration: 0.8, tag: 'world' }); w.setDiyas([]);
    for (const g of this.fledges) if (g.active && !g.leaving) f.release(g);          // the ones nobody fetched go their own way
  }
  /** three knots of fledglings off the straight road to the lamp */
  spawnFledges(L) {
    const f = this.flock, p = f.player, n = Math.max(8, Math.round(14 * f.max / 5000));
    this.fledges = [];
    for (let i = 0; i < 3; i++) {
      const k = 0.28 + i * 0.25, at = new THREE.Vector3(lerp(p.cx, L.M.x, k), clamp(lerp(p.cy, L.M.y, k) + (i % 2 ? -1 : 1) * (16 + Math.random() * 10), 14, 95), lerp(p.cz, L.M.z, k));
      const g = f.newGroup('fledge', 1); if (!g) break;
      g.goal = 2.2; g.rcK = 0.5; g.data = { c: at, a: Math.random() * 6.28 }; g.target.copy(at);
      const made = f.spawn(g, n, at, 4);
      if (!made) { g.active = false; break; }
      this.total += made; this.fledges.push(g);
    }
    // a mote of light in each knot, so they can be seen from the bank
    this.world.setDiyas(this.fledges.map((g) => ({ x: g.data.c.x, y: g.data.c.y, z: g.data.c.z, k: 1, size: 1.5, g })));
  }

  /* ------------------------------------------------------------- sighting */
  async sighting(s, q) {
    const G = this.G, f = this.flock, L = this.L;
    this.phase = 'sight'; this.phaseT = 0;
    // the strays come in from beyond the far end and circle their place
    const g = (this.wisp = f.newGroup('wisp', 1)); g.goal = 2.3; g.rcK = 0.5; g.speed = 1.2;
    const from = this.P(L.xL + L.sigma * (q.nd + 55), LAMP_Y + q.nh + 34);
    q.birds = f.spawn(g, q.birds, from, 8 + Math.cbrt(q.birds) * 1.5, _v.subVectors(L.C, from));
    g.data = { c: L.C.clone(), a: 0 }; g.target.copy(L.C);
    this.total += q.birds;
    this.view = { cs: L.xL + L.sigma * (q.nd / 2 + 5), w: q.nd + 66, h: q.nh + 30 };      // (room on the far side for the height's label)
    await s.wait(2.4);
    await this.reveal(s, q, L, this.qi === 0);
    const hint = !this.seen.scouts && !G.auto ? t('hint.scouts') : null; this.seen.scouts = true;
    const misses = await this.answerLoop(s, q, hint, {
      fly: (opt, out) => this.flySight(s, q, L, opt, out),
      lose: (m) => {                                         // a third of the strays give up and go
        const n = Math.round(q.birds * (SHARE[m - 1] - SHARE[m])), far = this.P(L.xL + L.sigma * (q.nd + 260), LAMP_Y + q.nh + 90);
        const gone = f.takeNearest(g, far.x, far.y, far.z, n, 'gone', 1);
        if (gone) { gone.target.copy(far); gone.speed = 1.4; f.release(gone); G.audio.play('depart', { pan: L.sigma * 0.5 }); }
      },
    });
    await this.clearDiagram(s);
    this.wisp = null;
    return misses;
  }

  /** The diagram, part by part and in the order it is read: the vertical, the water, the line of sight, the angle. */
  async reveal(s, q, L, words) {
    const G = this.G, lines = this.world.lines, lab = G.labels, { A, B, C, ux } = L;
    const u = clamp(this.view.w / 100, 0.75, 1.5), th = q.theta * DEG, ask = q.unknown;
    const at = (p, a, b) => V3(p).addScaledVector(ux, a).addScaledVector(UP, b);
    const put = (id, text, pos, cls) => { if (text) lab.set(id, text, pos, cls); };
    const draw = (l, dur = 0.55, f0 = 500) => { l.draw = 0; uiTweens.to(l, { draw: 1 }, { duration: dur, ease: Ease.inOutSine, tag: 'diagram' }); G.audio.play('draw', { f: f0, minGap: 0 }); return s.waitReal(dur + 0.15); };
    // the plumb line from the strays down to the water, and the right angle it makes there
    await draw(lines.add({ a: C, b: B, dash: 3.4 * u, color: ask === 'h' ? INK.ask : INK.line }));
    const sq = 3.2 * u;
    lines.add({ a: at(B, 0, sq), b: at(B, -sq, sq), width: 4.6 }); lines.add({ a: at(B, -sq, 0), b: at(B, -sq, sq), width: 4.6 });
    if (q.ticks) for (let y = 10; y < q.nh - 1; y += 10) lines.add({ a: at(B, -1.5 * u, y), b: at(B, 1.5 * u, y), width: 4.6 });
    put('h', q.show.h || (ask === 'h' ? '?' : ''), at(B, 9 * u, q.nh / 2), ask === 'h' ? 'ask' : 'val');
    // the water from the lamp to the foot, with a diya every ten metres when the distance is given
    await draw(lines.add({ a: A, b: B, color: ask === 'd' ? INK.ask : INK.line }), 0.55, 440);
    if (words) lab.set('w1', t('word.horizontal'), at(A, q.nd / 2, -10.5 * u), 'word');
    if (q.diyas) {
      const list = []; for (let k = 1; k <= Math.round(q.nd / 10); k++) { const p = at(A, 10 * k, 0); list.push({ x: p.x, z: p.z, k: 0 }); }
      this.world.setDiyas(list);
      for (let i = 0; i < list.length; i++) { uiTweens.to(list[i], { k: 1 }, { duration: 0.3, tag: 'diagram' }); G.audio.play('diya', { i, minGap: 0 }); await s.waitReal(0.1); }
    }
    put('d', q.show.d || (ask === 'd' ? '?' : ''), at(A, q.nd / 2, -5.2 * u), ask === 'd' ? 'ask' : 'val');
    // the line of sight, and the angle it makes with the water
    await draw(lines.add({ a: A, b: C, color: ask === 'L' ? INK.ask : INK.line }), 0.7, 560);
    const nx = -Math.sin(th), ny = Math.cos(th);              // the outward side of the line of sight
    put('L', q.show.L || (ask === 'L' ? '?' : ''), at(A, q.nd / 2 + nx * 8 * u, q.nh / 2 + ny * 8 * u), ask === 'L' ? 'ask' : 'val');
    if (words) lab.set('w2', t('word.sight'), at(A, q.nd / 2 + nx * 7 * u, q.nh / 2 + ny * 7 * u), 'word');
    const r = clamp(q.nd * 0.24, 9, 17) * Math.min(1, u);
    lines.arc(A, ux, UP, r, 0, th, { width: 5, color: ask === 'theta' ? INK.ask : INK.line });
    G.audio.play('draw', { f: 660, minGap: 0 });
    lab.set('t', q.show.theta || '?', at(A, Math.cos(th / 2) * (r + 7.5 * u), Math.sin(th / 2) * (r + 7.5 * u)), ask === 'theta' ? 'ask' : 'val');
    if (words) { lab.set('w3', t('word.elev'), at(A, r + 21 * u, 3.6 * u), 'word'); await s.waitReal(1.6); }
    await s.waitReal(0.35);
  }

  /** Ask, fly the answer, and on a miss climb the ladder: the idea → the set-up → the working, flown for them. */
  async answerLoop(s, q, hint, { fly, lose }) {
    const G = this.G, dock = G.dock;
    G.audio.play('ask');
    dock.ask(t(q.q), q.options, { hint });
    let misses = 0;
    for (;;) {
      const opt = await this.takeAnswer(s, q, misses);
      dock.lock(true);
      const out = outcome(q, opt);
      await fly(opt, out);
      if (out === 'perfect') break;
      misses++; lose(misses);
      if (misses >= 3) {
        dock.feedback(t(`out.${out}`), t('hint.working')); dock.reveal();
        await dock.working(q.work, s);
        await fly(q.options.find((o) => o.code === null), 'perfect');
        break;
      }
      dock.feedback(t(`out.${out}`), misses === 1 ? t(`m.${opt.code}`) : `${q.setup.replace('\n', '<br>')}<br>${t('hint.finish')}`);
      dock.reshuffle();
    }
    dock.hide();
    return misses;
  }
  /** the player's choice (or, with ?auto=1, the autopilot's: wrong `?miss=N` times, then right) */
  takeAnswer(s, q, misses, extra = null) {
    const G = this.G, pr = G.dock.choose();
    if (G.auto) {
      uiTweens.add({ duration: 0.9, tag: 'diagram', onComplete: () => {
        const o = misses < this.autoMiss ? q.options.find((x) => x.code !== null) : q.options.find((x) => x.code === null);
        G.dock.pick(q.options.indexOf(o));
      } });
    }
    return s.run(extra ? Promise.race([pr, extra]) : pr);
  }
  /** a tight handful of the flock that carries the light along the answer */
  sendScouts(from) {
    const f = this.flock, g = f.takeNearest(f.player, from.x, from.y, from.z, Math.min(SCOUTS, Math.max(0, f.player.fly - 30)), 'scout', 0);
    if (g) { g.goal = 3.2; g.rcK = 0.4; g.speed = 1.7; }
    this.scouts = g; this.scoutsHome = false;
    return g;
  }
  async scoutsBack(s) {
    const f = this.flock, g = this.scouts;
    this.scoutsHome = true; this.lure.wantAlpha = 0;
    if (g && g.active) { await s.until(() => !g.fly || Math.hypot(g.cx - this.station.x, g.cy - this.station.y, g.cz - this.station.z) < 34, 5); f.merge(g, f.player); }
    this.scouts = null;
  }
  /** the light travels from a to b in `dur` game seconds, a line drawing behind it */
  go(s, a, b, dur, line) {
    this.lure.target.copy(a);
    tweens.value(0, 1, dur, (k) => { this.lure.target.lerpVectors(a, b, k); if (line) line.draw = k; }, { ease: Ease.inOutSine, tag: 'diagram' });
    return s.wait(dur);
  }
  async flySight(s, q, L, opt, out) {
    const G = this.G, f = this.flock, lines = this.world.lines, e = endpoint(q, opt.val);
    const E = this.P(L.xL + L.sigma * Math.min(e.s, 230), LAMP_Y + Math.min(e.y, 170));
    const start = V3(L.A).addScaledVector(UP, 3.5);
    if (this.answerLine) lines.remove(this.answerLine);
    const line = (this.answerLine = lines.add({ a: L.A, b: E, color: INK.ask, width: 6.5, draw: 0 }));
    const sc = this.sendScouts(start);
    this.lure.jump(start); this.lure.wantAlpha = 1;
    G.audio.play('draw', { f: 380 });
    await this.go(s, start, E, clamp(start.distanceTo(E) / 38, 1.3, 3.6), line);
    if (sc) await s.until(() => Math.hypot(sc.cx - E.x, sc.cy - E.y, sc.cz - E.z) < 13, 2.4);
    if (out === 'perfect') {
      line.color = INK.good;
      const g = this.wisp, n = g ? g.n : 0;
      G.hud.stamp('out.perfect', 'good'); G.audio.play('gather', { n }); G.director.punch(2 + Math.min(3, n / 160));
      if (g && g.active) f.merge(g, sc && sc.active ? sc : f.player);        // the strays fall in behind the scouts
      this.slowmo(0.5, 0.12); await s.waitReal(0.6); this.slowmo(1, 0.4);
      await s.wait(0.5);
      await this.scoutsBack(s);
    } else {
      line.color = INK.bad;
      G.hud.stamp(`out.${out}`, 'bad'); G.audio.play('wrong'); G.director.shake(0.2);
      G.labels.set('yours', opt.text, V3(E).addScaledVector(L.ux, 9).addScaledVector(UP, 2), 'bad');
      await s.wait(1.3);
      await this.go(s, E, start, 1.3, null);
      await this.scoutsBack(s);
      uiTweens.to(line, { alpha: 0.32 }, { duration: 0.6, tag: 'diagram' });          // what was tried stays, faintly, to compare against
    }
  }
  async clearDiagram(s) {
    const lines = this.world.lines;
    for (const l of lines.list) uiTweens.to(l, { alpha: 0 }, { duration: 0.5, tag: 'diagram' });
    for (const d of this.world.diyas) uiTweens.to(d, { k: 0 }, { duration: 0.5, tag: 'diagram' });
    this.G.labels.clear();
    await s.waitReal(0.55);
    this.world.clearSighting(); this.answerLine = null;
  }

  /* --------------------------------------------------------------- falcon */
  async falconDive(s, q) {
    const G = this.G, f = this.flock, p = f.player, w = this.world, fa = this.falcon, lines = w.lines, lab = G.labels, dock = G.dock;
    this.phase = 'falcon'; this.phaseT = 0; this.makePlane(); this.goal = null; G.hud.hint(null);
    for (const old of w.posts) uiTweens.to(old, { k: 0 }, { duration: 0.8, tag: 'world' });
    const sigma = this.qi % 2 ? 1 : -1, th = q.theta * DEG, laneY = 11;
    const span = Math.max(...q.options.map((o) => o.val)) + 16, xF = -18 - sigma * span / 2;
    const ux = this.plane.r.clone().multiplyScalar(sigma), at = (s0, y) => this.P(xF + sigma * s0, y);
    const F = at(0, LAMP_Y), top = at(0, LAMP_Y + q.nh), S = at(q.nd, LAMP_Y), u = clamp((span + 42) / 100, 0.75, 1.5);
    // the flock strings itself out low over the water, the falcon hangs above the lane's end
    const a = at(10, laneY), b = at(span, laneY);
    p.line = { ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z }; this.follow = 'line'; this.station.copy(at(span / 2, laneY + 14));
    this.view = { cs: xF + sigma * (span / 2 - 7), w: span + 60, h: q.nh + 32 };
    this.lure.wantAlpha = 0;
    const dir = ux.clone().multiplyScalar(Math.cos(th)).addScaledVector(UP, -Math.sin(th));
    fa.hold(top, dir); G.audio.play('falcon', { pan: -sigma * 0.5 });
    await s.wait(2.0);
    const draw = (l, dur = 0.5, f0 = 500) => { l.draw = 0; uiTweens.to(l, { draw: 1 }, { duration: dur, ease: Ease.inOutSine, tag: 'diagram' }); G.audio.play('draw', { f: f0, minGap: 0 }); return s.waitReal(dur + 0.12); };
    // its height above the water
    await draw(lines.add({ a: top, b: F, dash: 3.4 * u }));
    const sq = 3.2 * u; lines.add({ a: at(0, LAMP_Y + sq), b: at(sq, LAMP_Y + sq), width: 4.6 }); lines.add({ a: at(sq, LAMP_Y), b: at(sq, LAMP_Y + sq), width: 4.6 });
    if (q.ticks) for (let y = 10; y < q.nh - 1; y += 10) lines.add({ a: at(-1.5 * u, LAMP_Y + y), b: at(1.5 * u, LAMP_Y + y), width: 4.6 });
    lab.set('h', q.show.h, at(-10 * u, LAMP_Y + q.nh / 2), 'val');
    // the horizontal through its eye, and the first of its line of sight: the angle of depression lies between them
    await draw(lines.add({ a: top, b: V3(top).addScaledVector(ux, 36 * u), dash: 2.4 * u, width: 5, color: INK.faint }), 0.45, 600);
    await draw(lines.add({ a: top, b: V3(top).addScaledVector(dir, 30 * u), width: 6.5 }), 0.45, 540);
    const r = 15 * u; lines.arc(top, ux, UP, r, 0, -th, { width: 5 });
    lab.set('t', q.show.theta, V3(top).addScaledVector(ux, Math.cos(th / 2) * (r + 8 * u)).addScaledVector(UP, -Math.sin(th / 2) * (r + 8 * u)), 'val');
    if (!this.seen.dep) { this.seen.dep = true; lab.set('w3', t('word.dep'), V3(top).addScaledVector(ux, 24 * u).addScaledVector(UP, 6 * u), 'word'); await s.waitReal(1.2); }
    // the water it will come down to
    await draw(lines.add({ a: F, b: at(span, LAMP_Y), color: INK.ask }), 0.5, 440);
    lab.set('d', '?', at(span * 0.42, LAMP_Y - 5.4 * u), 'ask');
    // the question, against the clock
    const hint = !this.seen.gap && !G.auto ? t('hint.gap') : null; this.seen.gap = true;
    G.audio.play('ask'); dock.ask(t(q.q), q.options, { hint });
    let late = null; const timeUp = new Promise((res) => { late = res; });
    dock.timer(FALCON_TIME, () => late(null));
    const opt = await this.takeAnswer(s, q, 0, timeUp);
    dock.stopTimer(); dock.lock(true);
    const hit = !opt || opt.code !== null;
    if (opt) {                                             // the flock opens where the player said
      const gp = at(opt.val, laneY); Object.assign(f.gap, { on: true, x: gp.x, y: gp.y, z: gp.z });
      lab.remove('d'); lab.set('yours', opt.text, at(opt.val, LAMP_Y - 5.4 * u), 'val');
      for (const e of [-f.gap.r, f.gap.r]) lines.add({ a: at(opt.val + e, LAMP_Y - 2), b: at(opt.val + e, laneY + 16), width: 4.6, dash: 2.2 * u, color: INK.faint });      // the gate they open
      G.audio.play('flare'); await s.wait(1.3);
    }
    // the dive, down its line of sight
    const path = lines.add({ a: top, b: S, color: INK.bad, width: 5, draw: 0 });
    let through = false;
    this.fcb = { near: () => { this.slowmo(0.3, 0.12); G.director.punch(-4); uiTweens.to(this, { tilt: -sigma * 0.07 }, { duration: 0.5, tag: 'tilt' }); }, through: () => { through = true; } };
    G.audio.play('stoop', { pan: -sigma * 0.5 }); uiTweens.to(path, { draw: 1 }, { duration: 1.3, ease: Ease.inQuad, tag: 'diagram' });
    fa.dive(at(q.nd, laneY - 3));
    await s.until(() => through, 9);
    this.slowmo(1, 0.5); uiTweens.cancelTag('tilt'); uiTweens.to(this, { tilt: 0 }, { duration: 0.9, tag: 'tilt' });
    lab.remove('d'); lab.set('truth', q.answer, at(q.nd, LAMP_Y - (opt && hit ? 10.5 : 5.4) * u), hit ? 'bad' : 'good');
    if (hit) {
      const n = Math.round((p.n - f.home) * FALCON_TAKES), lost = f.takeNearest(p, S.x, laneY, S.z, n, 'gone', 1);
      if (lost) { lost.target.copy(at(q.nd + 240, 120)); lost.speed = 1.5; f.release(lost); }
      w.burst(at(q.nd, laneY), dir); G.audio.play('hit'); G.director.shake(0.62);
      G.post.fx.ca = 0.014; uiTweens.to(G.post.fx, { ca: 0 }, { duration: 0.8 }); G.post.fx.flash = 0.16; uiTweens.to(G.post.fx, { flash: 0 }, { duration: 0.45 });
      G.hud.stamp(opt ? 'out.hit' : 'out.late', 'bad');
      await s.wait(1.3);
      dock.feedback(t(opt ? `out.${outcome(q, opt)}` : 'out.late'), t('hint.working')); dock.reveal();
      await dock.working(q.work, s, 1.0); await s.waitReal(1.8);
    } else { G.hud.stamp('out.clear', 'good'); G.audio.play('dodge'); G.director.punch(2.5); await s.wait(1.6); }
    f.gap.on = false; p.line = null; this.follow = 'station'; this.fcb = NOCB;
    dock.hide(); await this.clearDiagram(s);
    return hit ? 1 : 0;
  }
  slowmo(scale, dur) { uiTweens.cancelTag('slow'); uiTweens.to(clock, { scale }, { duration: dur, ease: Ease.outQuad, tag: 'slow' }); }
  screenX(v) { return clamp(_p.copy(v).project(this.G.camera).x, -1, 1); }

  /* ------------------------------------------------------- the banyan, home */
  async treeSight(s, q) {
    const G = this.G, f = this.flock, w = this.world, lines = w.lines, lab = G.labels;
    this.phase = 'tree'; this.phaseT = 0; this.view = null; this.goal = null; G.hud.hint(null);
    // the call home: the bell, the lamps, the light over the tree, and the lens goes out onto the water
    this.station.set(CROWN.x, LAMP_Y + 78, CROWN.z); this.follow = 'station'; this.lure.wantAlpha = 0;
    G.audio.play('bell'); G.hud.caption('roost.call'); this.todWant = TOD_SUNSET;
    uiTweens.to(w, { lampK: 1 }, { duration: 5, ease: Ease.linear, tag: 'world' }); uiTweens.to(w, { beaconK: 1 }, { duration: 2.5, tag: 'world' }); uiTweens.to(w, { fireK: 1 }, { duration: 8, ease: Ease.linear, tag: 'world' });
    this.slowmo(0.4, 0.5); G.director.handheld(0.05);
    // a whip to the tree, then the vertigo shot: the lens travels to it while it zooms out, so the tree holds its size
    // and the whole sky behind it stretches
    const cam = G.director.current().pos, dir = _v.subVectors(cam, CROWN).normalize().clone(), from = cam.distanceTo(CROWN), size = 84;
    await s.run(G.director.whip(pose(cam, CROWN, 2 * Math.atan(size / (2 * from)) / DEG), 0.7));
    await s.run(G.director.dolly({ subject: CROWN, dir, size, from, to: 140, dur: 3.4, ease: Ease.inOutSine }));
    uiTweens.cancelTag('world'); this.roostK = 1; this.kA = 1;
    uiTweens.to(w, { lampK: 1, beaconK: 1, fireK: 1 }, { duration: 4, tag: 'world' });
    // the plane through the trunk, square to the lens; two lamps on the water, 60 m and 20 m from it
    const az = VANTAGE[2].az, dx = Math.sin(az), dz = -Math.cos(az);
    this.plane = { o: new THREE.Vector3(TREE.x, 0, TREE.z), r: new THREE.Vector3(-dz, 0, dx), n: new THREE.Vector3(dx, 0, dz) };
    const ux = this.plane.r.clone(), far = q.nd + q.gap;
    const at = (s0, y) => this.P(s0, y);
    const L1 = at(-far, LAMP_Y), L2 = at(-q.nd, LAMP_Y), B = at(0, LAMP_Y), T = at(0, LAMP_Y + q.nh);
    for (const old of w.posts) uiTweens.to(old, { k: 0.5 }, { duration: 3, tag: 'world' });        // every lamp of the evening glows again, a path across the lake
    for (const l of [L1, L2]) uiTweens.to(w.addPost(l.x, l.z), { k: 1 }, { duration: 1.2, tag: 'world' });
    this.view = { cs: -far / 2 + 4, w: far + 50, h: q.nh + 46 };
    G.director.handheld(0.14);
    G.director.follow((wn) => this.camPose(wn), 1.5, { lambdaTarget: 1.3, lambdaFov: 1.2 });
    this.slowmo(1, 0.8);
    await s.wait(1.6);
    const draw = (l, dur = 0.6, f0 = 500) => { l.draw = 0; uiTweens.to(l, { draw: 1 }, { duration: dur, ease: Ease.inOutSine, tag: 'diagram' }); G.audio.play('draw', { f: f0, minGap: 0 }); return s.waitReal(dur + 0.15); };
    await draw(lines.add({ a: T, b: B, dash: 3.4, color: INK.ask }));
    lines.add({ a: at(0, LAMP_Y + 3.2), b: at(-3.2, LAMP_Y + 3.2), width: 4.6 }); lines.add({ a: at(-3.2, LAMP_Y), b: at(-3.2, LAMP_Y + 3.2), width: 4.6 });
    lab.set('h', '?', at(9, LAMP_Y + q.nh / 2), 'ask');
    await draw(lines.add({ a: L1, b: B }), 0.6, 440);
    lab.set('g', `${q.gap} m`, at(-q.nd - q.gap / 2, LAMP_Y - 5.4), 'val');
    lines.add({ a: at(-far, LAMP_Y - 2.2), b: at(-far, LAMP_Y - 6.5), width: 4.4 }); lines.add({ a: at(-q.nd, LAMP_Y - 2.2), b: at(-q.nd, LAMP_Y - 6.5), width: 4.4 });
    for (const [L, deg, r] of [[L1, q.theta2, 15], [L2, q.theta, 9]]) {
      const a = deg * DEG;
      await draw(lines.add({ a: L, b: T }), 0.6, 520 + deg);
      lines.arc(L, ux, UP, r, 0, a, { width: 5 });
      lab.set(`t${deg}`, `${deg}°`, V3(L).addScaledVector(ux, Math.cos(a / 2) * (r + 7)).addScaledVector(UP, Math.sin(a / 2) * (r + 7)), 'val');
    }
    await s.waitReal(0.4);
    const top = V3(this.station);
    return this.answerLoop(s, q, null, {
      // scouts come straight down from the flock to the height the player said
      fly: async (opt, out) => {
        const E = at(0, LAMP_Y + Math.min(opt.val, 74));
        if (this.answerLine) lines.remove(this.answerLine);
        const mark = (this.answerLine = lines.add({ a: at(-13, E.y), b: at(13, E.y), color: INK.ask, width: 6.5 }));
        const sc = this.sendScouts(top);
        this.lure.jump(top); this.lure.wantAlpha = 1; G.audio.play('draw', { f: 380 });
        await this.go(s, top, E, clamp(top.distanceTo(E) / 30, 1.3, 3), null);
        if (sc) await s.until(() => Math.hypot(sc.cx - E.x, sc.cy - E.y, sc.cz - E.z) < 13, 2.4);
        if (out === 'perfect') { mark.color = INK.good; G.hud.stamp('out.perfect', 'good'); G.audio.play('gather', { n: 300 }); G.director.punch(3); await s.wait(0.9); }
        else {
          mark.color = INK.bad; G.hud.stamp(`out.${out}`, 'bad'); G.audio.play('wrong'); G.director.shake(out === 'low' ? 0.4 : 0.2);
          if (out === 'low') w.burst(T, _w.set(0, 1, 0), 18);                 // into the boughs
          lab.set('yours', opt.text, at(22, E.y), 'bad');
          await s.wait(1.3);
          await this.go(s, E, top, 1.3, null);
          uiTweens.to(mark, { alpha: 0.32 }, { duration: 0.6, tag: 'diagram' });
        }
        await this.scoutsBack(s);
      },
      lose: () => {                                          // some of the tired flock drift off into the dusk
        const n = Math.round((f.player.n - f.home) * TREE_MISS), gone = f.takeNearest(f.player, CROWN.x - 200, 120, CROWN.z, n, 'gone', 1);
        if (gone) { gone.target.set(CROWN.x - 320, 150, CROWN.z - 200); gone.speed = 1.4; f.release(gone); G.audio.play('depart', { pan: -0.5 }); }
      },
    });
  }
  async roost(s) {
    const G = this.G, f = this.flock;
    await this.clearDiagram(s);
    this.phase = 'roost'; this.phaseT = 0; this.view = null; this.goal = CROWN; this.todWant = TOD_DUSK;
    this.follow = 'lure'; this.lead = true; input.leading = false; input.moved = 0;
    this.lure.jump(this.station); this.lure.target.set(CROWN.x, CROWN.y + 17, CROWN.z); this.lure.wantAlpha = 1;
    G.hud.home(0, true);
    await s.until(() => f.player.n - f.home <= 0 || this.phaseT > 36);
  }
  async finale(s) {
    const G = this.G, f = this.flock, w = this.world;
    this.phase = 'finale'; this.lead = false; this.goal = null; this.lure.wantAlpha = 0;
    // whoever is still in the air is lost to the dark
    const lost = f.split(f.player, 0, 0, 0, 1e5, 'gone');
    if (lost) { lost.target.set(CROWN.x - 300, 160, CROWN.z - 500); f.release(lost); }
    G.audio.mood(0); G.audio.play('end');
    uiTweens.value(w.tod, 0.93, 12, (v) => { this.tod = this.todWant = v; w.setTod(v); }, { ease: Ease.inOutSine, tag: 'world' });
    const cam = G.director.current().pos, a0 = Math.atan2(cam.x - CROWN.x, cam.z - CROWN.z) / DEG;
    G.director.handheld(0.1);
    // the tree sits low in the frame, its lights under a sky of stars (and room above it for the count)
    G.director.orbit({ center: CROWN, radius: [cam.distanceTo(CROWN), 100], height: [cam.y - CROWN.y, -13], from: a0, to: a0 - 62, fov: [G.director.base.fov, 40], lookOffset: new THREE.Vector3(0, 27, 0), dur: 15, ease: Ease.inOutSine, blendIn: 0.3 });
    await s.waitReal(5.2);
    const home = f.home, share = home / Math.max(1, this.total);
    const rank = share >= 0.85 ? 3 : share >= 0.6 ? 2 : share >= 0.25 ? 1 : 0;
    const isBest = home > this.best;
    if (isBest) { this.best = home; store.set('mm_best', home); }
    this.result = { home, total: this.total, rank, share, first: this.firstTry, asked: this.asked };
    G.hud.hud(false);
    uiTweens.to(G.post.fx, { blurMix: 0.16 }, { duration: 1.2, tag: 'world' }); uiTweens.to(w, { beaconK: 0.25 }, { duration: 3, tag: 'world' });
    this.phase = 'results';
    G.hud.results({ home, rank, best: this.best, isBest, first: this.firstTry, asked: this.asked });
    await s.waitReal(8); G.audio.stopMusic(6);
  }

  togglePause(force) {
    const on = force ?? !this.paused;
    if (on === this.paused || !this.playing) return;
    const G = this.G;
    this.paused = on; clock.paused = on; G.audio.pause(on); G.hud.pause(on);
    G.post.fx.blurMix = on ? 0.7 : 0;
  }

  /* --------------------------------------------------------------- frame */
  update(dt, ui) {
    const G = this.G, w = this.world, f = this.flock, p = f.player, ph = this.phase;
    input.update(ui); this.phaseT += dt;

    // the light: under the finger, going where it should by itself, or wandering on the title
    if (ph === 'title' || ph === 'intro') {
      const a = clock.time * 0.33;
      this.P(Math.sin(a) * 75, 48 + Math.sin(a * 2.1) * 24, this.lure.target).addScaledVector(this.plane.n, -35 + Math.cos(a * 0.8) * 30);
    } else if (this.lead) {
      if (!G.auto && input.leading) this.pointer(input.x, input.y, this.lure.target);
      // nobody leading: at the tree the light finds its own way; on the road it waits a few seconds first
      else if (this.goal && (G.auto || ph === 'roost' || this.phaseT > 5)) this.lure.target.set(this.goal.x, this.goal.y + (ph === 'roost' ? 17 : 0), this.goal.z);
    }
    // the flock: after the light, or waiting at its station
    if (!p.line) p.target.copy(this.follow === 'lure' ? this.lure.pos : this.station);
    const sc = this.scouts; if (sc && sc.active) sc.target.copy(this.scoutsHome ? this.station : this.lure.pos);
    const g = this.wisp;
    if (g && g.active && g.data) { const d = g.data; d.a += dt * 0.9; g.target.copy(d.c).addScaledVector(this.plane.r, Math.cos(d.a) * 5).addScaledVector(UP, Math.sin(d.a * 1.3) * 2.5); }
    for (let i = this.fledges.length - 1; i >= 0; i--) {
      const k = this.fledges[i], d = k.data;
      if (!k.active || (k.leaving && !k.n)) { this.fledges.splice(i, 1); continue; }
      d.a += dt * 1.1; k.target.set(d.c.x + Math.cos(d.a) * 4, d.c.y + Math.sin(d.a * 1.4) * 2, d.c.z + Math.sin(d.a) * 4);
      if (k.leaving || !k.fly || ph !== 'transit') continue;
      if (f.countNear(p, k.cx, k.cy, k.cz, 13) >= 6) {       // the flock brushes them: they are with us
        const n = f.merge(k, p); this.fledges.splice(i, 1);
        for (const d of w.diyas) if (d.g === k) uiTweens.to(d, { k: 0 }, { duration: 0.3, tag: 'world' });
        G.audio.play('gather', { n, pan: this.screenX(_v.set(k.cx, k.cy, k.cz)) * 0.7 }); this.lure.flarePulse();
      }
    }
    this.falcon.update(dt, f, this.fcb);
    if (ph === 'roost' && p.fly > 0 && this.lure.pos.distanceTo(CROWN) < 62) {     // over the tree, the flock pours in
      const near = f.countNear(p, CROWN.x, CROWN.y + 8, CROWN.z, 48);
      this.roostAcc += (near > 0 ? Math.min(260, 70 + near * 0.07) : 0) * dt;
      const q = Math.floor(this.roostAcc);
      if (q > 0) { this.roostAcc -= q; f.roost(q, CROWN.x, CROWN.y + 8, CROWN.z, 48, { next: () => w.nextPerch() }); }
    }
    if (this.playing) {
      this.tod += (this.todWant - this.tod) * Math.min(1, dt * 0.16); w.setTod(this.tod);
      G.audio.mood(clamp(this.qi / 9, 0, 1));
      G.hud.count(p.n + (sc && sc.active ? sc.n : 0) - f.home);
    }
    if (f.arrived) {                                    // birds touching down: a patter of high notes, and the count
      const n = f.arrived; f.arrived = 0;
      for (let i = 0; i < Math.min(n, 2); i++) G.audio.play('perch', { minGap: 0.045 });
      G.hud.home(f.home, true);
    }
    G.dock.update();
    G.post.fx.exposure = w.sky.exposure;
    // the bed of sound: how much wing noise, from where
    const dist = Math.hypot(p.cx - G.camera.position.x, p.cy - G.camera.position.y, p.cz - G.camera.position.z) + 1;
    const loud = p.fly ? clamp(Math.sqrt(p.fly) / 70, 0, 1) * clamp(90 / dist, 0.25, 1.6) : 0;
    G.audio.scene({ wings: loud, pan: p.fly ? this.screenX(_v.set(p.cx, p.cy, p.cz)) * 0.7 : 0, speed: clamp((Math.hypot(p.vx, p.vy, p.vz) - 8) / 16, 0, 1),
      night: clamp((w.tod - 0.6) / 0.3, 0, 1), birds: f.active - f.home, dt: ui, quiet: ph === 'boot' });
  }
}
