// ---------------------------------------------------------------------------
// The lake's edges, built once from code: three ranges of far hills (dipping
// where the sun sets), the bank and its tree line, a temple island with a ghat,
// the banyan the flock roosts in, reeds, lily pads and a moored boat.
// Everything solid is one flat-shaded material lit by the sky's uniforms, so the
// whole land turns from gold to silhouette as the sun goes down.
// ---------------------------------------------------------------------------
import * as THREE from '../../vendor/three.module.js';
import { SKY, SUN_H } from './sky.js';
import { FOG } from './glsl.js';
import { mulberry32, noise1, lerp, smoothstep, TAU, DEG } from '../engine/util.js';

/** the roost islet and the temple island (world positions of their centres at the waterline) */
export const TREE = new THREE.Vector3(70, 0, -40);
export const TEMPLE = new THREE.Vector3(-150, 0, -150);
export const CANOPY = { y: 21, r: 24, h: 9 };                 // the banyan's crown: centre height, radius, half height

/** distance from the lake's centre to its bank along a bearing (0 = north, the far side) */
export const bankRadius = (az) => 337 + 92 * Math.cos(az) + 28 * noise1(az * 2.1 + 5.3) * (0.5 + 0.5 * Math.cos(az));
const fbm1 = (x) => noise1(x) * 0.6 + noise1(x * 2.3 + 9.1) * 0.3 + noise1(x * 5.1 + 3.7) * 0.15;

const LAND_VERT = /* glsl */`
attribute vec3 color;
varying vec3 vColor, vWorld;
void main() {
  vColor = color;
  vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const LAND_FRAG = /* glsl */`
uniform vec3 uSunDir, uSunColor, uAmbient;
uniform float uSunLit;
varying vec3 vColor, vWorld;
${FOG}
void main() {
  vec3 toCam = cameraPosition - vWorld; float dist = length(toCam); vec3 V = toCam / dist;
  vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));      // flat facets, no normals to keep
  if (dot(N, V) < 0.0) N = -N;
  float nl = dot(N, uSunDir);
  vec3 col = vColor * (uAmbient * 1.25 + uSunColor * (max(nl, 0.0) * 1.7 + (nl * 0.5 + 0.5) * 0.22) * uSunLit);
  // light leaking round an edge when the lens looks into the sun
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * max(dot(-V, uSunDir), 0.0);
  col += uSunColor * rim * 0.4 * uSunLit * (vColor + 0.04);
  gl_FragColor = vec4(applyFog(col, dist), 1.0);
}`;

const REED_VERT = /* glsl */`
attribute float aH;
uniform float uTime;
varying float vH; varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vec3 root = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float len = length((instanceMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  float ph = root.x * 0.37 + root.z * 0.23;
  float sway = (sin(uTime * 1.25 + ph) * 0.6 + sin(uTime * 2.7 + ph * 1.7) * 0.25) * aH * aH * len * 0.16;
  w.x += sway; w.z += sway * 0.4;
  vH = aH; vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const REED_FRAG = /* glsl */`
uniform vec3 uSunDir, uSunColor, uAmbient;
uniform float uSunLit;
varying float vH; varying vec3 vWorld;
${FOG}
void main() {
  vec3 toCam = cameraPosition - vWorld; float dist = length(toCam); vec3 V = toCam / dist;
  vec3 base = mix(vec3(0.035, 0.05, 0.03), vec3(0.11, 0.13, 0.05), vH);
  vec3 col = base * (uAmbient * 1.2 + uSunColor * 0.5 * uSunLit);
  col += uSunColor * pow(max(dot(-V, uSunDir), 0.0), 3.0) * 0.16 * uSunLit * vH;   // back-lit tips
  gl_FragColor = vec4(applyFog(col, dist), 1.0);
}`;

const ICO = [0, 1].map((d) => new THREE.IcosahedronGeometry(1, d).getAttribute('position').array);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();

/** Collects coloured triangles. Shapes are given in a local frame (origin, right, front) so a whole building can be turned. */
class Builder {
  constructor(rng) { this.p = []; this.c = []; this.rng = rng; this.frame(); }
  frame(origin = new THREE.Vector3(), yaw = 0) {
    this.o = origin.clone(); this.rx = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)); this.fz = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    return this;
  }
  P(x, y, z, out = new THREE.Vector3()) { return out.set(this.o.x + this.rx.x * x + this.fz.x * z, this.o.y + y, this.o.z + this.rx.z * x + this.fz.z * z); }
  tri(a, b, c, col, vary = 0.07) {
    const k = 1 + (this.rng() * 2 - 1) * vary;
    this.p.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let i = 0; i < 3; i++) this.c.push(col.r * k, col.g * k, col.b * k);
  }
  quad(a, b, c, d, col, vary) { this.tri(a, b, c, col, vary); this.tri(a, c, d, col, vary); }
  /** a tapered tube between two local points */
  tube(p0, p1, r0, r1, n, col, vary) {
    const A = this.P(p0[0], p0[1], p0[2]), B = this.P(p1[0], p1[1], p1[2]);
    const ax = B.clone().sub(A).normalize();
    const u = new THREE.Vector3(1, 0, 0); if (Math.abs(ax.x) > 0.9) u.set(0, 0, 1);
    u.cross(ax).normalize(); const w = ax.clone().cross(u);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
      const d0 = u.clone().multiplyScalar(Math.cos(a0)).addScaledVector(w, Math.sin(a0)), d1 = u.clone().multiplyScalar(Math.cos(a1)).addScaledVector(w, Math.sin(a1));
      this.quad(A.clone().addScaledVector(d0, r0), A.clone().addScaledVector(d1, r0), B.clone().addScaledVector(d1, r1), B.clone().addScaledVector(d0, r1), col, vary);
    }
  }
  /** a lumpy ball (a jittered icosphere): canopies, bushes, domes */
  blob(c, rx, ry, rz, col, jit = 0.2, detail = 1, vary = 0.1) {
    const src = ICO[detail], v = [_a, _b, _c];
    for (let i = 0; i < src.length; i += 9) {
      for (let k = 0; k < 3; k++) {
        const x = src[i + k * 3], y = src[i + k * 3 + 1], z = src[i + k * 3 + 2];
        const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + c[0] * 0.13 + c[2] * 0.07) * 43758.5453;
        const s = 1 + jit * ((h - Math.floor(h)) * 2 - 1);
        this.P(c[0] + x * rx * s, c[1] + y * ry * s, c[2] + z * rz * s, v[k]);
      }
      this.tri(_a, _b, _c, col, vary);
    }
  }
  /** a box standing on (cx, cy, cz) */
  box(c, sx, sy, sz, col, vary) {
    const x0 = c[0] - sx / 2, x1 = c[0] + sx / 2, y0 = c[1], y1 = c[1] + sy, z0 = c[2] - sz / 2, z1 = c[2] + sz / 2;
    const q = (a, b, cc, d) => this.quad(this.P(...a), this.P(...b), this.P(...cc), this.P(...d), col, vary);
    q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]); q([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
    q([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]); q([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    q([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);
  }
  /** a profile [[r, y], ...] spun round the vertical through (cx, cy, cz) */
  lathe(c, profile, n, col, spin = 0, vary) {
    for (let j = 0; j < profile.length - 1; j++) {
      const [r0, y0] = profile[j], [r1, y1] = profile[j + 1];
      for (let i = 0; i < n; i++) {
        const a0 = spin + (i / n) * TAU, a1 = spin + ((i + 1) / n) * TAU;
        const A = this.P(c[0] + Math.cos(a0) * r0, c[1] + y0, c[2] + Math.sin(a0) * r0), B = this.P(c[0] + Math.cos(a1) * r0, c[1] + y0, c[2] + Math.sin(a1) * r0);
        const C2 = this.P(c[0] + Math.cos(a1) * r1, c[1] + y1, c[2] + Math.sin(a1) * r1), D = this.P(c[0] + Math.cos(a0) * r1, c[1] + y1, c[2] + Math.sin(a0) * r1);
        if (r1 < 1e-3) this.tri(A, B, C2, col, vary); else if (r0 < 1e-3) this.tri(A, C2, D, col, vary); else this.quad(A, B, C2, D, col, vary);
      }
    }
  }
  mesh(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    const m = new THREE.Mesh(g, material); m.frustumCulled = false; m.matrixAutoUpdate = false;
    return m;
  }
}

const col = (hex) => new THREE.Color(hex);

export class Land {
  constructor(seed = 7) {
    const rng = (this.rng = mulberry32(seed));
    this.group = new THREE.Group();
    this.lamps = [];           // world positions of the temple's lamps (drawn as glows by the world)
    this.canopy = [];          // the banyan's crown: { x, y, z, rx, ry, rz } blobs, where the birds perch
    this.reedSpots = [];
    const shared = { uSunDir: SKY.uSunDir, uSunColor: SKY.uSunColor, uAmbient: SKY.uAmbient, uSunLit: SKY.uSunLit, uFogColor: SKY.uFogColor, uFogDensity: SKY.uFogDensity };
    this.material = new THREE.ShaderMaterial({ vertexShader: LAND_VERT, fragmentShader: LAND_FRAG, uniforms: shared, side: THREE.DoubleSide });
    const b = new Builder(rng);
    this.hills(b); this.bank(b); this.treeLine(b); this.temple(b); this.banyan(b); this.pads(b);
    this.group.add(b.mesh(this.material));
    this.boat = this.makeBoat();
    this.group.add(this.boat);
    this.reeds(shared);
  }

  hills(b) {
    const rings = [
      { R: 560, H: 44, f: 3.1, s: 1.3, c: col('#3b4a33') },
      { R: 780, H: 82, f: 2.3, s: 7.7, c: col('#46564a') },
      { R: 1080, H: 150, f: 1.6, s: 13.1, c: col('#55626a') },
    ];
    const N = 240, span = 135 * DEG;
    for (const r of rings) {
      let prev = null;
      for (let i = 0; i <= N; i++) {
        const az = lerp(-span, span, i / N);
        const dx = Math.sin(az), dz = -Math.cos(az);
        // the range dips where the sun goes down, so the disc reaches the bank
        const off = Math.acos(Math.min(1, dx * SUN_H.x + dz * SUN_H.z));
        const notch = lerp(0.16, 1, smoothstep(9 * DEG, 40 * DEG, off));
        const h = r.H * (0.3 + 0.7 * Math.abs(fbm1(az * r.f + r.s))) * notch;
        const cur = { x: dx * r.R, z: dz * r.R, h };
        if (prev) b.quad(_a.set(prev.x, -2, prev.z), _b.set(cur.x, -2, cur.z), _c.set(cur.x, cur.h, cur.z), _d.set(prev.x, prev.h, prev.z), r.c, 0.05);
        prev = cur;
      }
    }
  }

  bank(b) {
    const N = 200, top = col('#3d4c2c'), lip = col('#4b4030');
    let prev = null;
    for (let i = 0; i <= N; i++) {
      const az = (i / N) * TAU, R = bankRadius(az), dx = Math.sin(az), dz = -Math.cos(az);
      const cur = { dx, dz, R };
      if (prev) {
        b.quad(_a.set(prev.dx * (prev.R - 7), -0.6, prev.dz * (prev.R - 7)), _b.set(cur.dx * (cur.R - 7), -0.6, cur.dz * (cur.R - 7)), _c.set(cur.dx * cur.R, 1.7, cur.dz * cur.R), _d.set(prev.dx * prev.R, 1.7, prev.dz * prev.R), lip);
        b.quad(_a.set(prev.dx * prev.R, 1.7, prev.dz * prev.R), _b.set(cur.dx * cur.R, 1.7, cur.dz * cur.R), _c.set(cur.dx * 1500, 1.7, cur.dz * 1500), _d.set(prev.dx * 1500, 1.7, prev.dz * 1500), top, 0.04);
      }
      prev = cur;
    }
  }

  /** one of three silhouettes: a round-crowned tree, a palm, a slim cone */
  tree(b, x, z, y, s, kind) {
    const rng = this.rng;
    b.frame(new THREE.Vector3(x, y, z), rng() * TAU);
    if (kind === 0) {
      b.tube([0, 0, 0], [0.3 * s, 5.5 * s, 0], 0.55 * s, 0.35 * s, 5, col('#2b2118'));
      const g = col(rng() < 0.5 ? '#24361f' : '#2b3d22'), n = 2 + ((rng() * 2) | 0);
      for (let i = 0; i < n; i++) b.blob([(rng() - 0.5) * 4 * s, (7 + rng() * 3.5) * s, (rng() - 0.5) * 4 * s], (3.6 + rng() * 2) * s, (2.8 + rng() * 1.4) * s, (3.6 + rng() * 2) * s, g, 0.22, 0);
    } else if (kind === 1) {
      const h = (13 + rng() * 6) * s, lean = (rng() - 0.5) * 5;
      let p = [0, 0, 0];
      for (let i = 1; i <= 4; i++) { const k = i / 4, q = [lean * k * k, h * k, 0]; b.tube(p, q, lerp(0.42, 0.24, k - 0.25) * s, lerp(0.42, 0.24, k) * s, 5, col('#2c2219')); p = q; }
      const g = col('#27391f');
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU + rng() * 0.4, L = (4.2 + rng() * 1.6) * s, cx = Math.cos(a), cz = Math.sin(a);
        const w = 0.55 * s, sx = -cz * w, sz = cx * w;
        const m = [p[0] + cx * L * 0.5, p[1] + 0.9 * s, p[2] + cz * L * 0.5], t = [p[0] + cx * L, p[1] - (1.2 + rng() * 1.6) * s, p[2] + cz * L];
        b.quad(b.P(p[0], p[1], p[2]), b.P(m[0] + sx, m[1], m[2] + sz), b.P(t[0], t[1], t[2]), b.P(m[0] - sx, m[1], m[2] - sz), g, 0.12);
      }
    } else {
      b.tube([0, 0, 0], [0, 2.5 * s, 0], 0.35 * s, 0.3 * s, 5, col('#2b2118'));
      b.lathe([0, 2 * s, 0], [[2.3 * s, 0], [1.9 * s, 5 * s], [1.0 * s, 10 * s], [0, 13 * s]], 6, col('#1f3220'), rng() * TAU, 0.12);
    }
    b.frame();
  }

  treeLine(b) {
    const rng = this.rng;
    for (let i = 0; i < 300; i++) {
      const az = lerp(-118, 118, rng()) * DEG, R = bankRadius(az) + 6 + rng() * rng() * 95;
      const u = rng(), kind = u < 0.55 ? 0 : u < 0.86 ? 1 : 2;
      this.tree(b, Math.sin(az) * R, -Math.cos(az) * R, 1.7, 0.85 + rng() * 0.75, kind);
    }
  }

  temple(b) {
    const rng = this.rng, T = TEMPLE;
    const yaw = Math.atan2(150, 365);                       // the ghat faces the south bank, where the lens stands
    const stone = col('#8b7459'), stone2 = col('#7a654d'), dark = col('#5d4c3b'), grass = col('#46512f');
    b.frame(T, yaw);
    b.lathe([0, 0, 0], [[58, -0.6], [52, 1.2], [40, 1.6], [0, 1.6]], 26, grass);
    b.box([0, 1.6, -4], 36, 1.4, 30, stone2);                                  // the plinth
    for (let i = 0; i < 8; i++) b.box([0, -0.6, 11.85 + i * 1.7], 30, 3.17 - i * 0.43, 1.7, i % 2 ? stone : stone2);   // the ghat going down into the water
    b.box([0, 3.0, -10], 13, 6.2, 13, stone);                                  // the sanctum
    b.lathe([0, 9.2, -10], [[6.6, 0], [6.3, 3], [5.5, 7], [4.4, 11.5], [3.1, 15.5], [2.0, 18.5], [1.15, 20.3]], 8, stone, TAU / 16);
    b.lathe([0, 9.2, -10], [[2.3, 20.3], [2.7, 21], [2.3, 21.7], [0.95, 21.9], [0.5, 22.6], [0.8, 23.2], [0.22, 24.4], [0, 25.3]], 8, dark, TAU / 16);
    b.tube([0, 34, -10], [0, 40, -10], 0.13, 0.1, 4, dark);
    b.tri(b.P(0, 39.7, -10), b.P(0, 38.1, -10), b.P(3.0, 38.9, -10.4), col('#ff8a3a'), 0);
    b.box([0, 3.0, 2.2], 11.5, 5.2, 9.5, stone2);                              // the hall in front
    b.lathe([0, 8.2, 2.2], [[8.6, 0], [5.8, 1.6], [2.8, 3.2], [0.7, 4.3], [0, 5.0]], 4, stone, TAU / 8);
    for (const x of [-4.9, -2.3, 2.3, 4.9]) b.tube([x, 3, 7.6], [x, 8.2, 7.6], 0.48, 0.42, 6, stone);
    for (const sx of [-1, 1]) {                                                 // a pavilion at each end of the steps
      const cx = sx * 14.2, cz = 7.4;
      for (const [px, pz] of [[-1.5, -1.5], [1.5, -1.5], [1.5, 1.5], [-1.5, 1.5]]) b.tube([cx + px, 3, cz + pz], [cx + px, 6.5, cz + pz], 0.26, 0.24, 5, stone);
      b.box([cx, 6.5, cz], 4.4, 0.4, 4.4, stone2);
      b.blob([cx, 6.9, cz], 2.3, 1.9, 2.3, stone, 0.03, 1, 0.05);
      b.tube([cx, 8.7, cz], [cx, 9.9, cz], 0.14, 0.03, 4, dark);
    }
    // lamps: along the third step, on the plinth's corners, under the pavilions
    for (const x of [-12.9, -8.6, -4.3, 0, 4.3, 8.6, 12.9]) this.lamps.push(b.P(x, 2.15, 15.6));
    for (const [x, z] of [[-17, 10.2], [17, 10.2], [-14.2, 7.4], [14.2, 7.4], [0, 4.4]]) this.lamps.push(b.P(x, z === 7.4 ? 5.6 : z === 4.4 ? 7.2 : 3.6, z));
    b.frame();
    for (let i = 0; i < 7; i++) {
      const a = (0.62 + i * 0.33 + rng() * 0.12) * Math.PI, r = 30 + rng() * 14;
      this.tree(b, T.x + Math.cos(a + yaw) * r, T.z + Math.sin(a + yaw) * r, 1.5, 0.9 + rng() * 0.6, rng() < 0.6 ? 0 : 1);
    }
    for (let i = 0; i < 7; i++) { const a = rng() * TAU; this.reedSpots.push({ x: T.x + Math.cos(a) * 57, z: T.z + Math.sin(a) * 57, r: 4, n: 26 }); }
  }

  banyan(b) {
    const rng = this.rng, bark = col('#372a1d'), bark2 = col('#2c2118');
    b.frame(TREE, 0);
    b.lathe([0, 0, 0], [[36, -0.6], [31, 0.9], [22, 1.7], [0, 2.1]], 24, col('#414d2c'));
    b.tube([0, 1.6, 0], [0.8, 11.5, 0.4], 3.7, 2.6, 9, bark);
    for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + rng(); b.tube([Math.cos(a) * 2.6, 3.2, Math.sin(a) * 2.6], [Math.cos(a) * 6.2, 1.5, Math.sin(a) * 6.2], 1.1, 0.5, 5, bark2); }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + rng() * 0.5, r = 10 + rng() * 7, y = 15 + rng() * 5;
      b.tube([0.8, 10.6, 0.4], [Math.cos(a) * r, y, Math.sin(a) * r], 1.35, 0.55, 6, bark);
    }
    const greens = [col('#1f3826'), col('#264228'), col('#1b3023'), col('#2d4a2a')];
    for (let i = 0; i < 22; i++) {
      const a = i * 2.39996, rad = 4 + 17.5 * Math.sqrt((i + 0.5) / 22);
      const y = CANOPY.y - 2 + 7 * (1 - (rad / 22) ** 2) + (rng() - 0.5) * 2.4;
      const blob = { x: Math.cos(a) * rad, y, z: Math.sin(a) * rad, rx: 6.8 + rng() * 3, ry: 4.6 + rng() * 1.8, rz: 6.8 + rng() * 3 };
      b.blob([blob.x, blob.y, blob.z], blob.rx, blob.ry, blob.rz, greens[i % 4], 0.2, 1, 0.14);
      this.canopy.push({ x: TREE.x + blob.x, y: blob.y, z: TREE.z + blob.z, rx: blob.rx, ry: blob.ry, rz: blob.rz });
    }
    for (let i = 0; i < 18; i++) {                                              // the banyan's hanging roots
      const a = rng() * TAU, r = 7 + rng() * 11;
      b.tube([Math.cos(a) * r, 15.5 + rng() * 2, Math.sin(a) * r], [Math.cos(a) * (r + 0.4), 1.4, Math.sin(a) * (r + 0.4)], 0.2, 0.26, 4, bark2);
    }
    b.frame();
    for (let i = 0; i < 12; i++) { const a = rng() * TAU; this.reedSpots.push({ x: TREE.x + Math.cos(a) * 33, z: TREE.z + Math.sin(a) * 33, r: 4.5, n: 30 }); }
  }

  /** lily pads and a few lotus buds on the near water */
  pads(b) {
    const rng = this.rng, pad = col('#2f4f30'), bud = col('#f0a6c4');
    for (let i = 0; i < 90; i++) {
      const x = lerp(-95, 45, rng()), z = lerp(150, 204, Math.sqrt(rng())), r = 0.45 + rng() * 0.7, a0 = rng() * TAU;
      const n = 9;
      for (let k = 1; k < n; k++) {                                              // a disc with a notch
        const a = a0 + (k / n) * TAU, a1 = a0 + ((k + 1) / n) * TAU;
        if (k === n - 1) break;
        b.tri(_a.set(x, 0.05, z), _b.set(x + Math.cos(a) * r, 0.05, z + Math.sin(a) * r), _c.set(x + Math.cos(a1) * r, 0.05, z + Math.sin(a1) * r), pad, 0.2);
      }
      if (rng() < 0.16) { b.frame(new THREE.Vector3(x + 0.3, 0, z + 0.2), 0); b.lathe([0, 0.05, 0], [[0.06, 0], [0.28, 0.25], [0.2, 0.55], [0, 0.8]], 5, bud, rng() * TAU, 0.1); b.frame(); }
    }
  }

  makeBoat() {
    const b = new Builder(this.rng), wood = col('#33241a'), wood2 = col('#281b13');
    const st = [[-2.9, 0.05, 0.7], [-1.7, 0.6, 0.5], [0, 0.82, 0.42], [1.7, 0.6, 0.5], [2.9, 0.05, 0.7]];      // x, half width, gunwale height
    for (let i = 0; i < st.length - 1; i++) {
      const [x0, w0, h0] = st[i], [x1, w1, h1] = st[i + 1];
      for (const s of [-1, 1]) b.quad(_a.set(x0, h0, s * w0), _b.set(x1, h1, s * w1), _c.set(x1, -0.12, 0), _d.set(x0, -0.12, 0), s > 0 ? wood : wood2);
    }
    b.box([0.2, 0.25, 0], 0.35, 0.08, 1.3, wood2);
    b.tube([1.2, 0.2, 0.3], [2.1, 3.6, 0.9], 0.045, 0.035, 4, wood2);
    const m = b.mesh(this.material); m.matrixAutoUpdate = true;
    m.position.set(-15, 0, 197); m.rotation.y = 0.5;
    return m;
  }

  reeds(shared) {
    const rng = this.rng, spots = this.reedSpots;
    // along the south bank, a little way in front of the path the lens drifts along (never on it)
    for (let x = -86; x <= 34; x += 8.5) {
      if (rng() < 0.28) continue;
      const k = (x + 86) / 120;
      spots.push({ x: x + (rng() - 0.5) * 5, z: lerp(194, 203, k) + (rng() - 0.5) * 5, r: 2.4 + rng() * 2.4, n: 44 + ((rng() * 50) | 0), tall: 1 });
    }
    for (let i = 0; i < 9; i++) spots.push({ x: lerp(-230, 230, rng()), z: lerp(-110, 110, rng()), r: 4 + rng() * 4, n: 34 });
    const total = spots.reduce((s, c) => s + c.n, 0);
    // one blade: a tapering strip with a kink
    const seg = 4, pos = [], hh = [];
    for (let i = 0; i < seg; i++) {
      const y0 = i / seg, y1 = (i + 1) / seg, w0 = 0.055 * (1 - y0 * 0.85), w1 = 0.055 * (1 - y1 * 0.85), b0 = y0 * y0 * 0.18, b1 = y1 * y1 * 0.18;
      pos.push(-w0, y0, b0, w0, y0, b0, w1, y1, b1, -w0, y0, b0, w1, y1, b1, -w1, y1, b1);
      hh.push(y0, y0, y1, y0, y1, y1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aH', new THREE.Float32BufferAttribute(hh, 1));
    const mat = new THREE.ShaderMaterial({ vertexShader: REED_VERT, fragmentShader: REED_FRAG, side: THREE.DoubleSide, uniforms: { ...shared, uTime: SKY.uTime } });
    const mesh = new THREE.InstancedMesh(g, mat, total); mesh.frustumCulled = false;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let n = 0;
    for (const c of spots) for (let i = 0; i < c.n; i++) {
      const a = rng() * TAU, r = c.r * Math.sqrt(rng()), h = (c.tall ? 1.7 : 1.2) + rng() * (c.tall ? 1.9 : 1.5);
      p.set(c.x + Math.cos(a) * r, -0.05, c.z + Math.sin(a) * r);
      e.set((rng() - 0.5) * 0.3, rng() * TAU, (rng() - 0.5) * 0.3); q.setFromEuler(e);
      s.set(1 + rng() * 0.8, h, 1);
      mesh.setMatrixAt(n++, m.compose(p, q, s));
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
  }

  update(time) {
    this.boat.position.y = Math.sin(time * 0.8) * 0.035; this.boat.rotation.z = Math.sin(time * 0.6 + 1) * 0.02;
  }
}
