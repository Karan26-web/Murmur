// ---------------------------------------------------------------------------
// Lines drawn in the air: the sides of a sighting's triangle, its angle arc, the
// plumb line, the ticks. One instanced draw of camera-facing ribbons with a
// constant width on screen, a bright core inside a dark rim (so they read on a
// golden sky and on a violet one), optional dashes, and a `draw` amount so a
// line can be drawn in from its first end.
//   const l = lines.add({ a, b, color, width, dash });   // returns the handle
//   tween l.draw 0 → 1, l.alpha → 0; lines.clear() removes all.
// ---------------------------------------------------------------------------
import * as THREE from '../../vendor/three.module.js';
import { SKY } from './sky.js';

const VERT = /* glsl */`
attribute vec3 iA, iB;
attribute vec4 iCol, iParm;           // rgb + alpha · width px, dash length m (0 = solid), draw 0..1, length m
uniform float uPx;
varying vec2 vUv; varying vec4 vCol; varying vec3 vParm;
void main() {
  vec3 p = mix(iA, iB, position.x);
  vec3 side = normalize(cross(normalize(iB - iA + vec3(1e-5)), normalize(cameraPosition - p)));
  p += side * position.y * iParm.x * length(cameraPosition - p) / uPx * 0.5;
  vUv = position.xy; vCol = iCol; vParm = iParm.yzw;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const FRAG = /* glsl */`
varying vec2 vUv; varying vec4 vCol; varying vec3 vParm;
void main() {
  if (vUv.x > vParm.y) discard;
  float e = abs(vUv.y);
  float core = 1.0 - smoothstep(0.4, 0.56, e), rim = 1.0 - smoothstep(0.84, 1.0, e);
  float a = mix(0.55 * rim, 1.0, core);
  if (vParm.x > 0.0) a *= step(fract(vUv.x * vParm.z / vParm.x), 0.56);
  gl_FragColor = vec4(mix(vec3(0.05, 0.03, 0.09), vCol.rgb, core), vCol.a * a);
}`;

export const INK = { line: [1.75, 1.65, 1.4], ask: [2.7, 1.15, 0.12], bad: [2.7, 0.42, 0.3], good: [0.9, 2.3, 0.8], faint: [1.25, 1.2, 1.1] };

export class Lines {
  constructor(max = 96) {
    this.max = max; this.list = [];
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, -1, 0, 1, 1, 0, 0, 1, 0], 3));
    const dyn = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aA = dyn(3); this.aB = dyn(3); this.aCol = dyn(4); this.aParm = dyn(4);
    g.setAttribute('iA', this.aA); g.setAttribute('iB', this.aB); g.setAttribute('iCol', this.aCol); g.setAttribute('iParm', this.aParm);
    g.instanceCount = 0;
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uPx: SKY.uPx }, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 10;
  }
  /** a: Vector3, b: Vector3 (copied) */
  add({ a, b, color = INK.line, width = 6.5, dash = 0, alpha = 1, draw = 1 }) {
    const l = { a: a.clone(), b: b.clone(), color, width, dash, alpha, draw };
    if (this.list.length < this.max) this.list.push(l);
    return l;
  }
  /** a circular arc in a plane: centre, two unit axes, radius, from/to angles (radians); returns its segments */
  arc(c, ux, uy, r, a0, a1, opts = {}, n = 12) {
    const out = [], p = (a) => c.clone().addScaledVector(ux, Math.cos(a) * r).addScaledVector(uy, Math.sin(a) * r);
    for (let i = 0; i < n; i++) out.push(this.add({ a: p(a0 + (a1 - a0) * (i / n)), b: p(a0 + (a1 - a0) * ((i + 1) / n)), ...opts }));
    return out;
  }
  remove(l) { const i = this.list.indexOf(l); if (i >= 0) this.list.splice(i, 1); }
  clear() { this.list.length = 0; }
  update() {
    const A = this.aA.array, B = this.aB.array, C = this.aCol.array, P = this.aParm.array, n = this.list.length;
    for (let i = 0; i < n; i++) {
      const l = this.list[i], k = i * 3, m = i * 4;
      A[k] = l.a.x; A[k + 1] = l.a.y; A[k + 2] = l.a.z; B[k] = l.b.x; B[k + 1] = l.b.y; B[k + 2] = l.b.z;
      C[m] = l.color[0]; C[m + 1] = l.color[1]; C[m + 2] = l.color[2]; C[m + 3] = l.alpha;
      P[m] = l.width; P[m + 1] = l.dash; P[m + 2] = l.draw; P[m + 3] = l.a.distanceTo(l.b);
    }
    this.mesh.geometry.instanceCount = n;
    if (n) this.aA.needsUpdate = this.aB.needsUpdate = this.aCol.needsUpdate = this.aParm.needsUpdate = true;
  }
}
