// ---------------------------------------------------------------------------
// The lure: a mote of the last sunlight under the player's finger. The flock
// follows it. Its ring shows the flare charging back; a pulse leaves it when the
// flare is used.
// ---------------------------------------------------------------------------
import * as THREE from '../../vendor/three.module.js';
import { clamp } from '../engine/util.js';
import { Glows } from './motes.js';

const VERT = /* glsl */`
uniform float uSize;
varying vec2 vUv;
void main() {
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float size = clamp(-mv.z * 0.032, 2.2, 9.0) * uSize;      // about the same size on screen wherever it flies
  mv.xy += position.xy * size;
  vUv = position.xy;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */`
uniform float uCool, uPulse, uAlpha, uAlert;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float d = length(vUv);
  float core = exp(-d * d * 60.0) * 7.0 + exp(-d * 7.0) * 0.5;
  float ang = atan(vUv.x, vUv.y) / 6.2831853 + 0.5;
  float ring = smoothstep(0.045, 0.0, abs(d - 0.56)) * (step(ang, uCool) * 0.75 + 0.12);
  float pulse = smoothstep(0.09, 0.0, abs(d - uPulse)) * (1.0 - uPulse) * 2.2 * step(0.001, uPulse);
  vec3 col = uColor * (core + pulse) + mix(vec3(1.0, 0.9, 0.7), vec3(1.6, 0.35, 0.2), uAlert) * ring * (1.0 + uAlert * 2.0);
  gl_FragColor = vec4(col, uAlpha * step(d, 1.0));
}`;

export class Lure {
  constructor() {
    this.pos = new THREE.Vector3(0, 50, 0); this.target = this.pos.clone(); this.vel = new THREE.Vector3();
    this.cool = 1; this.pulse = 0; this.alpha = 0; this.wantAlpha = 0; this.alert = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    this.u = { uSize: { value: 1 }, uCool: { value: 1 }, uPulse: { value: 0 }, uAlpha: { value: 0 }, uAlert: { value: 0 }, uColor: { value: new THREE.Color(1.0, 0.82, 0.55) } };
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.u, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 12;
    this.trail = new Glows(22, { pow: 2.4, minPx: 1.5, order: 11 });
    this.hist = Array.from({ length: 22 }, () => new THREE.Vector3(0, 50, 0)); this.histT = 0;
  }
  jump(p) { this.pos.copy(p); this.target.copy(p); for (const h of this.hist) h.copy(p); }
  flarePulse() { this.pulse = 0.02; }
  update(dt) {
    // chase the finger's point: quick, but a light has a little weight
    const k = 1 - Math.exp(-9 * dt), d = this.pos.distanceTo(this.target), step = Math.min(d * k, 190 * dt);
    if (d > 1e-4) this.pos.addScaledVector(this.vel.subVectors(this.target, this.pos).normalize(), step);
    this.mesh.position.copy(this.pos);
    this.alpha += (this.wantAlpha - this.alpha) * Math.min(1, dt * 4);
    if (this.pulse > 0) { this.pulse += dt * 2.4; if (this.pulse >= 1) this.pulse = 0; }
    this.u.uCool.value = this.cool; this.u.uPulse.value = this.pulse; this.u.uAlpha.value = this.alpha;
    this.u.uAlert.value += (this.alert - this.u.uAlert.value) * Math.min(1, dt * 8);
    this.histT += dt;
    if (this.histT > 0.035) { this.histT = 0; const h = this.hist.pop(); h.copy(this.pos); this.hist.unshift(h); }
    const n = this.hist.length, cs = clamp(this.pos.distanceTo(this.hist[n - 1]) / 20, 0, 1) * this.alpha;
    for (let i = 0; i < n; i++) {
      const h = this.hist[i], f = (1 - i / n) * cs;
      this.trail.set(i, h.x, h.y, h.z, 1.6 * f, 1.1 * f, 0.6 * f, 1.3 * (1 - i / n) + 0.3, i);
    }
    this.trail.commit(n);
  }
}
