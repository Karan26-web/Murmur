// ---------------------------------------------------------------------------
// The flock. No bird leads; each one obeys three rules about the handful of
// birds nearest to it:
//     1. keep apart      (separation)
//     2. fly the same way (alignment)
//     3. stay close       (cohesion)
// and the game adds a fourth: the pull of a place (the player's light, a wisp's
// wandering path, the tree at dusk). Everything else on screen (the ribbons, the
// vortex, the hole that opens round a falcon) is what those rules do by
// themselves when a few thousand birds follow them at once.
//
// Simulation: plain typed arrays on the CPU, neighbours found through a hashed
// grid (cells as wide as a bird's sight), a capped handful of neighbours per bird
// like real starlings. Rendering: one instanced draw; the vertex shader builds
// each bird from its velocity, banks it into its turn and flaps it, and the
// light that sweeps through a turning flock is just each bird's back catching
// the low sun.
// ---------------------------------------------------------------------------
import * as THREE from '../../vendor/three.module.js';
import { SKY } from './sky.js';
import { FOG } from './glsl.js';
import { clamp } from '../engine/util.js';

export const FLY = 0, DESCEND = 1, PERCHED = 2;

const CELL = 6, INV = 1 / CELL, HASH = 1 << 14, MASK = HASH - 1;
const RN2 = CELL * CELL, RS = 3.4, RS2 = RS * RS;
const K_NEIGH = 8;                    // a starling tracks about seven neighbours, however dense the flock
export const TUNE = {
  sep: 30, ali: 2.5, coh: 0.6, goal: 0.72, tether: 1.5, wander: 2.2, gust: 5.5,
  vMin: 12, vMax: 27, vPanic: 38, floor: 4.5, ceil: 165, threatR: 28, threatK: 170, flareK: 95,
};

// own cell first, then faces, edges, corners
const OFFS = [];
for (let r = 0; r <= 3; r++) for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (Math.abs(x) + Math.abs(y) + Math.abs(z) === r) OFFS.push(x, y, z);

const VERT = /* glsl */`
attribute vec3 iPos, iVel;
attribute vec4 iData;                 // phase, bank, tint (+2 when the wings are folded), alpha
attribute float aWing;
uniform float uTime, uSize, uPx, uMinPx;
uniform vec3 uSunDir;
varying float vShade, vBelly, vAlpha, vTint, vDist, vHome;
void main() {
  vec3 f = normalize(iVel);
  vec3 r = cross(f, vec3(0.0, 1.0, 0.0)); float rl = length(r); r = rl > 1e-4 ? r / rl : vec3(1.0, 0.0, 0.0);
  vec3 u = cross(r, f);
  float cb = cos(iData.y), sb = sin(iData.y);
  vec3 u2 = u * cb + r * sb, r2 = r * cb - u * sb;               // banked into the turn
  float fold = step(1.5, iData.z); vTint = iData.z - 2.0 * fold;
  vHome = fold * (0.55 + 0.45 * sin(uTime * (1.2 + fract(iData.x * 3.7) * 2.6) + iData.x * 50.0));
  vec3 lp = position;
  if (aWing != 0.0) {
    float a = sin(uTime * (8.5 + fract(iData.x * 7.31) * 3.5) + iData.x * 6.2831) * (1.0 - fold) * 0.95 + 0.12;
    float L = abs(lp.z);
    lp.y = L * sin(a); lp.z = sign(lp.z) * L * cos(a) * mix(1.0, 0.3, fold);
  }
  vDist = length(cameraPosition - iPos);
  float size = uSize * (1.0 + fold * 0.35); size *= max(1.0, uMinPx * vDist / (size * uPx));   // never thinner than a couple of pixels
  vec3 wp = iPos + (f * lp.x + u2 * lp.y + r2 * lp.z) * size;
  float top = dot(u2, uSunDir);
  vShade = pow(max(top, 0.0), 2.4); vBelly = max(-top, 0.0);
  vAlpha = iData.w;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const FRAG = /* glsl */`
uniform vec3 uBird, uStray, uSunColor, uGlow;
uniform float uSunLit, uShimmer, uHome;
varying float vShade, vBelly, vAlpha, vTint, vDist, vHome;
${FOG}
void main() {
  vec3 light = uSunColor * uSunLit + uGlow * 0.3;
  vec3 col = mix(uBird, uStray, vTint) + light * (vShade * uShimmer + vBelly * 0.05);
  col = mix(uFogColor, col, exp(-vDist * uFogDensity * 0.7));
  col += vec3(1.9, 1.25, 0.55) * vHome * uHome;       // a bird that has come home is a small ember in the tree
  gl_FragColor = vec4(col, vAlpha);
}`;

export class Flock {
  constructor(max) {
    this.max = max;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.perch = new Float32Array(max * 3);
    this.grp = new Int8Array(max).fill(-1); this.state = new Uint8Array(max);
    this.phase = new Float32Array(max); this.bank = new Float32Array(max); this.cruise = new Float32Array(max);
    this.alpha = new Float32Array(max); this.tint = new Float32Array(max); this.acc = new Float32Array(max * 3); this.frame = 0;
    this.free = []; for (let i = max - 1; i >= 0; i--) this.free.push(i);
    this.head = new Int32Array(HASH); this.next = new Int32Array(max);
    this.groups = [];
    this.player = this.newGroup('player', 0);
    this.threat = { on: false, x: 0, y: 0, z: 0 };
    this.flare = 0; this.flareAt = new THREE.Vector3();
    this.tree = { x: 0, z: 0 };
    this.home = 0; this.arrived = 0; this.active = 0; this.time = 0;
    for (let i = 0; i < max; i++) { this.phase[i] = Math.random(); this.cruise[i] = 17 + Math.random() * 3.5; }
    this._mesh();
  }

  _mesh() {
    const max = this.max, g = new THREE.InstancedBufferGeometry();
    // x forward, z along the wings: a slim body and two pointed wings whose tips the shader flaps
    const P = [0.36, 0, 0, 0, 0, 0.11, -0.38, 0, 0, 0.36, 0, 0, -0.38, 0, 0, 0, 0, -0.11,
      0.2, 0, 0.05, -0.04, 0, 0.5, -0.2, 0, 0.05, 0.2, 0, -0.05, -0.2, 0, -0.05, -0.04, 0, -0.5];
    const W = [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1];
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('aWing', new THREE.Float32BufferAttribute(W, 1));
    const dyn = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aPos = dyn(3); this.aVel = dyn(3); this.aData = dyn(4);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iVel', this.aVel); g.setAttribute('iData', this.aData);
    g.instanceCount = 0;
    this.uStray = { value: new THREE.Color() };
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, transparent: true, depthWrite: false,
      uniforms: {
        uTime: SKY.uTime, uSize: { value: 1.5 }, uPx: SKY.uPx, uMinPx: { value: 2.8 }, uSunDir: SKY.uSunDir,
        uBird: SKY.uBird, uStray: this.uStray, uSunColor: SKY.uSunColor, uGlow: SKY.uGlow, uSunLit: SKY.uSunLit, uShimmer: { value: 0.5 }, uHome: { value: 1 },
        uFogColor: SKY.uFogColor, uFogDensity: SKY.uFogDensity,
      },
    });
    this.mesh = new THREE.Mesh(g, this.material); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
  }

  /* ----------------------------------------------------------------- groups */
  newGroup(kind, tint) {
    let id = this.groups.findIndex((g, i) => i > 0 && g && !g.active);
    if (id < 0) id = this.groups.length;
    if (id > 120) return null;
    const g = { id, kind, tint, active: true, leaving: false, target: new THREE.Vector3(), n: 0, fly: 0, cx: 0, cy: 0, cz: 0, vx: 0, vy: 0, vz: 0, r: 10, rc: 12, goal: kind === 'player' ? 1 : 1.25, speed: 1, data: null };
    this.groups[id] = g;
    return g;
  }
  /** add n birds to a group, scattered round a point, already flying */
  spawn(g, n, at, spread = 12, heading = null) {
    let made = 0;
    for (; made < n && this.free.length; made++) {
      const i = this.free.pop(), j = i * 3;
      const a = Math.random() * 6.2832, e = (Math.random() - 0.5) * 1.6, r = spread * Math.cbrt(Math.random());
      this.pos[j] = at.x + Math.cos(a) * Math.cos(e) * r; this.pos[j + 1] = Math.max(TUNE.floor + 1, at.y + Math.sin(e) * r * 0.6); this.pos[j + 2] = at.z + Math.sin(a) * Math.cos(e) * r;
      const h = heading ? Math.atan2(heading.z, heading.x) + (Math.random() - 0.5) * 0.9 : Math.random() * 6.2832;
      this.vel[j] = Math.cos(h) * 17; this.vel[j + 1] = (Math.random() - 0.5) * 3; this.vel[j + 2] = Math.sin(h) * 17;
      this.grp[i] = g.id; this.state[i] = FLY; this.alpha[i] = 0; this.tint[i] = g.tint; this.bank[i] = 0;
    }
    return made;
  }
  /** every bird of one group joins another */
  merge(from, to) {
    let n = 0;
    for (let i = 0; i < this.max; i++) if (this.grp[i] === from.id) { this.grp[i] = to.id; n++; }
    from.active = false; from.n = 0; from.fly = 0;
    return n;
  }
  /** the group flies off and fades (an ungathered wisp leaving the sky) */
  release(g) { g.leaving = true; }
  /** birds of a group inside a ball break away as a new group */
  split(from, x, y, z, radius, kind = 'scatter') {
    const r2 = radius * radius, g = this.newGroup(kind, 1);
    if (!g) return null;
    let n = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.grp[i] !== from.id || this.state[i] !== FLY) continue;
      const j = i * 3, dx = this.pos[j] - x, dy = this.pos[j + 1] - y, dz = this.pos[j + 2] - z;
      if (dx * dx + dy * dy + dz * dz < r2) { this.grp[i] = g.id; n++; }
    }
    if (!n) { g.active = false; return null; }
    g.n = g.fly = n; g.cx = x; g.cy = y; g.cz = z;
    return g;
  }
  /** how many flying birds of a group are inside a ball */
  countNear(g, x, y, z, radius) {
    const r2 = radius * radius; let n = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.grp[i] !== g.id || this.state[i] !== FLY) continue;
      const j = i * 3, dx = this.pos[j] - x, dy = this.pos[j + 1] - y, dz = this.pos[j + 2] - z;
      if (dx * dx + dy * dy + dz * dz < r2) n++;
    }
    return n;
  }
  /** send up to `quota` of the player's birds near the tree down to perches; returns how many went */
  roost(quota, cx, cy, cz, radius, perches) {
    const r2 = radius * radius, id = this.player.id; let n = 0;
    const start = (Math.random() * this.max) | 0;
    for (let k = 0; k < this.max && n < quota; k++) {
      const i = (start + k) % this.max;
      if (this.grp[i] !== id || this.state[i] !== FLY) continue;
      const j = i * 3, dx = this.pos[j] - cx, dy = this.pos[j + 1] - cy, dz = this.pos[j + 2] - cz;
      if (dx * dx + dy * dy * 0.5 + dz * dz > r2) continue;
      const p = perches.next(); if (!p) break;
      this.perch[j] = p[0]; this.perch[j + 1] = p[1]; this.perch[j + 2] = p[2];
      this.state[i] = DESCEND; n++;
    }
    return n;
  }
  reset() {
    this.grp.fill(-1); this.state.fill(0); this.alpha.fill(0);
    this.free.length = 0; for (let i = this.max - 1; i >= 0; i--) this.free.push(i);
    this.groups.length = 1; const p = this.player; p.n = p.fly = 0; p.active = true; p.leaving = false;
    this.home = 0; this.arrived = 0; this.flare = 0; this.threat.on = false;
  }

  /* ------------------------------------------------------------------- step */
  update(dt, strayColor) {
    if (dt <= 0) { this._write(0); return; }
    dt = Math.min(dt, 1 / 30);
    this.time += dt;
    const { pos, vel, grp, state, head, next, max, phase, bank, cruise, groups, time, acc } = this;
    const frame = ++this.frame;
    const T = TUNE;
    this.uStray.value.copy(strayColor);

    // pass 1: the grid, and each group's centre and drift
    head.fill(-1);
    for (const g of groups) if (g) { g.sx = g.sy = g.sz = g.svx = g.svy = g.svz = g.sr = 0; g.n = 0; g.fly = 0; }
    for (let i = 0; i < max; i++) {
      const gi = grp[i]; if (gi < 0) continue;
      const g = groups[gi]; g.n++;
      if (state[i] !== FLY) continue;
      const j = i * 3, x = pos[j], y = pos[j + 1], z = pos[j + 2];
      g.sx += x; g.sy += y; g.sz += z; g.svx += vel[j]; g.svy += vel[j + 1]; g.svz += vel[j + 2]; g.fly++;
      const h = (Math.imul(Math.floor(x * INV), 73856093) ^ Math.imul(Math.floor(y * INV), 19349663) ^ Math.imul(Math.floor(z * INV), 83492791)) & MASK;
      next[i] = head[h]; head[h] = i;
    }
    for (const g of groups) {
      if (!g || !g.fly) continue;
      const k = 1 / g.fly;
      g.cx = g.sx * k; g.cy = g.sy * k; g.cz = g.sz * k; g.vx = g.svx * k; g.vy = g.svy * k; g.vz = g.svz * k;
      g.rc = 4 + 3.1 * Math.cbrt(g.fly);         // the radius a flock of this size is comfortable inside
    }

    // pass 2: steer and move
    const th = this.threat, TR = T.threatR, TR2 = TR * TR;
    const flareK = this.flare > 0 ? T.flareK * Math.min(1, this.flare / 0.25) : 0, fa = this.flareAt;
    if (this.flare > 0) this.flare -= dt;
    const tree = this.tree, turn = Math.min(1, dt * 5), fadeIn = dt * 1.6, fadeOut = dt * 0.55;
    let active = 0;
    for (let i = 0; i < max; i++) {
      const gi = grp[i]; if (gi < 0) continue;
      const g = groups[gi], j = i * 3, st = state[i];
      active++;
      // fade in on arrival, out when a wisp leaves
      if (g.leaving) {
        this.alpha[i] -= fadeOut;
        if (this.alpha[i] <= 0) { grp[i] = -1; this.free.push(i); continue; }
      } else if (this.alpha[i] < 1) this.alpha[i] = Math.min(1, this.alpha[i] + fadeIn);
      if (this.tint[i] !== g.tint) this.tint[i] += clamp(g.tint - this.tint[i], -dt * 2.2, dt * 2.2);
      if (st === PERCHED) continue;

      let x = pos[j], y = pos[j + 1], z = pos[j + 2], vx = vel[j], vy = vel[j + 1], vz = vel[j + 2];

      if (st === DESCEND) {                         // spiralling down into the tree
        const tx = this.perch[j] - x, ty = this.perch[j + 1] - y, tz = this.perch[j + 2] - z;
        const d = Math.sqrt(tx * tx + ty * ty + tz * tz);
        if (d < 1.2) {
          pos[j] = this.perch[j]; pos[j + 1] = this.perch[j + 1]; pos[j + 2] = this.perch[j + 2];
          const a = phase[i] * 6.2832; vel[j] = Math.cos(a); vel[j + 1] = 0.25; vel[j + 2] = Math.sin(a);
          state[i] = PERCHED; bank[i] = 0; this.home++; this.arrived++;
          continue;
        }
        const sp = clamp(d * 1.5, 5, 19), ox = x - tree.x, oz = z - tree.z, ol = Math.sqrt(ox * ox + oz * oz) + 1e-3, sw = Math.min(1, d / 14) * 7;
        const k = Math.min(1, dt * 3.4);
        vx += (tx / d * sp - oz / ol * sw - vx) * k; vy += (ty / d * sp - vy) * k; vz += (tz / d * sp + ox / ol * sw - vz) * k;
        pos[j] = x + vx * dt; pos[j + 1] = y + vy * dt; pos[j + 2] = z + vz * dt;
        vel[j] = vx; vel[j + 1] = vy; vel[j + 2] = vz;
        bank[i] += (0.5 - bank[i]) * turn;
        continue;
      }

      // the three rules, over the nearest handful. A bird looks round on every other frame (half the flock each
      // frame); in between it keeps doing what it last decided.
      let ax, ay, az;
      if (((i + frame) & 1) === 0) {
        ax = 0; ay = 0; az = 0;
        let n = 0, avx = 0, avy = 0, avz = 0, apx = 0, apy = 0, apz = 0;
        const c0 = Math.floor(x * INV), c1 = Math.floor(y * INV), c2 = Math.floor(z * INV);
        for (let c = 0; c < 81; c += 3) {
          const h = (Math.imul(c0 + OFFS[c], 73856093) ^ Math.imul(c1 + OFFS[c + 1], 19349663) ^ Math.imul(c2 + OFFS[c + 2], 83492791)) & MASK;
          for (let k = head[h]; k >= 0; k = next[k]) {
            if (k === i) continue;
            const kk = k * 3, dx = x - pos[kk], dy = y - pos[kk + 1], dz = z - pos[kk + 2], d2 = dx * dx + dy * dy + dz * dz;
            if (d2 > RN2 || d2 < 1e-6) continue;
            if (d2 < RS2) { const d = Math.sqrt(d2), f = (1 - d / RS) / d * T.sep; ax += dx * f; ay += dy * f; az += dz * f; }       // 1. keep apart
            if (n < K_NEIGH && grp[k] === gi) { n++; avx += vel[kk]; avy += vel[kk + 1]; avz += vel[kk + 2]; apx += pos[kk]; apy += pos[kk + 1]; apz += pos[kk + 2]; }
          }
          if (n >= K_NEIGH && c >= 18) break;
        }
        if (n > 0) {
          const k = 1 / n;
          ax += (avx * k - vx) * T.ali; ay += (avy * k - vy) * T.ali; az += (avz * k - vz) * T.ali;                                // 2. fly the same way
          ax += (apx * k - x) * T.coh; ay += (apy * k - y) * T.coh; az += (apz * k - z) * T.coh;                                   // 3. stay close
        }
        acc[j] = ax; acc[j + 1] = ay; acc[j + 2] = az;
      } else { ax = acc[j]; ay = acc[j + 1]; az = acc[j + 2]; }

      // the fourth: the pull of a place. Birds far from it hurry; near it they overshoot and wheel.
      // (each bird steers for the place as seen from a point between itself and the flock's centre, so the flock
      // travels as one body instead of every bird diving at the same spot)
      let tx = g.target.x - (x * 0.4 + g.cx * 0.6), ty = g.target.y - (y * 0.4 + g.cy * 0.6), tz = g.target.z - (z * 0.4 + g.cz * 0.6);
      const d = Math.sqrt(tx * tx + ty * ty + tz * tz) + 1e-3;
      const far = d > g.rc ? Math.min((d - g.rc) * 0.011, 0.9) : 0;
      const sp = cruise[i] * (1 + far * 0.8) * g.speed, kg = T.goal * g.goal * (1 + far * 1.3);
      ax += (tx / d * sp - vx) * kg; ay += (ty / d * sp - vy) * kg; az += (tz / d * sp - vz) * kg;
      // a tether to the flock's own centre, so a stretched flock stays one body
      tx = g.cx - x; ty = g.cy - y; tz = g.cz - z;
      const dc = Math.sqrt(tx * tx + ty * ty + tz * tz);
      g.sr += dc;
      if (dc > g.rc) { const f = (dc - g.rc) / dc * T.tether; ax += tx * f; ay += ty * f; az += tz * f; }
      ay += ty * 0.4;                                // a flock is wider than it is tall: a lens, not a ball
      // restlessness: each bird's own, and slow gusts that push whole parts of the flock the same way (the billows)
      const ph = phase[i] * 40;
      ax += Math.sin(time * 0.83 + ph) * T.wander; ay += Math.sin(time * 1.07 + ph * 1.7) * T.wander * 0.5; az += Math.cos(time * 0.71 + ph * 2.3) * T.wander;
      ax += Math.sin(z * 0.043 + y * 0.031 + time * 0.52) * T.gust; ay += Math.sin(x * 0.037 - z * 0.029 + time * 0.61) * T.gust * 0.45; az += Math.sin(x * 0.047 + y * 0.027 - time * 0.44) * T.gust;
      // the water below, the thin air above
      if (y < T.floor + 7) ay += (T.floor + 7 - y) * 5; else if (y > T.ceil) ay -= (y - T.ceil) * 2;

      let panic = false;
      if (th.on) {                                   // the falcon: get out of its way
        const dx = x - th.x, dy = y - th.y, dz = z - th.z, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < TR2) { const dd = Math.sqrt(d2) + 1e-3, f = (1 - dd / TR) / dd * T.threatK; ax += dx * f; ay += dy * f * 0.6; az += dz * f; panic = true; }
      }
      if (flareK > 0 && gi === 0) {                  // the flare: burst out from the heart of the flock
        const dx = x - fa.x, dy = y - fa.y, dz = z - fa.z, dd = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.5, f = flareK / dd;
        ax += dx * f; ay += dy * f * 0.7; az += dz * f; panic = true;
      }

      vx += ax * dt; vy += ay * dt; vz += az * dt;
      // birds fly mostly level: a steep climb or dive bleeds off
      const hs = Math.sqrt(vx * vx + vz * vz), vmaxY = hs * 0.75 + 2;
      if (vy > vmaxY) vy = vmaxY; else if (vy < -vmaxY) vy = -vmaxY;
      let s = Math.sqrt(vx * vx + vy * vy + vz * vz);
      const lim = panic ? T.vPanic : T.vMax * (1 + far * 0.5);
      if (s > lim) { const k = lim / s; vx *= k; vy *= k; vz *= k; }
      else if (s < T.vMin) { if (s < 1e-3) { vx = T.vMin; s = T.vMin; } const k = T.vMin / s; vx *= k; vy *= k; vz *= k; }
      x += vx * dt; y += vy * dt; z += vz * dt;
      if (y < T.floor) { y = T.floor; if (vy < 0) vy = -vy * 0.3; }
      pos[j] = x; pos[j + 1] = y; pos[j + 2] = z; vel[j] = vx; vel[j + 1] = vy; vel[j + 2] = vz;
      // bank into the turn: the sideways part of what it just asked of its wings
      const lat = hs > 1e-3 ? (ax * -vz + az * vx) / hs : 0;
      bank[i] += (clamp(lat * 0.05, -1.2, 1.2) - bank[i]) * turn;
    }
    for (const g of groups) {
      if (!g) continue;
      if (g.fly) g.r = g.sr / g.fly;
      if (g.id > 0 && g.active && g.n === 0) g.active = false;
    }
    this.active = active;
    this._write(dt);
  }

  /** pack the live birds into the instance buffers */
  _write() {
    const { pos, vel, grp, state, max } = this, P = this.aPos.array, V = this.aVel.array, D = this.aData.array;
    let n = 0;
    for (let i = 0; i < max; i++) {
      if (grp[i] < 0) continue;
      const j = i * 3, k = n * 3, m = n * 4;
      P[k] = pos[j]; P[k + 1] = pos[j + 1]; P[k + 2] = pos[j + 2];
      V[k] = vel[j]; V[k + 1] = vel[j + 1]; V[k + 2] = vel[j + 2];
      D[m] = this.phase[i]; D[m + 1] = this.bank[i]; D[m + 2] = this.tint[i] + (state[i] === PERCHED ? 2 : 0); D[m + 3] = this.alpha[i];
      n++;
    }
    const range = { start: 0, count: n };
    this.aPos.clearUpdateRanges(); this.aVel.clearUpdateRanges(); this.aData.clearUpdateRanges();
    this.aPos.addUpdateRange(0, n * 3); this.aVel.addUpdateRange(0, n * 3); this.aData.addUpdateRange(0, n * 4);
    this.aPos.needsUpdate = this.aVel.needsUpdate = this.aData.needsUpdate = true;
    this.mesh.geometry.instanceCount = n;
    return range;
  }
}
