// ---------------------------------------------------------------------------
// The falcon. It circles above the flock (and cries), hangs for a breath while a
// line of light shows where it means to go, then folds its wings and stoops.
// The flock's own rules open a hole round it. If the flock is bursting apart (the
// player's flare) as it arrives, it goes through the hole and takes nothing;
// otherwise, if enough birds were still in its path, it splits the flock.
// States: away → circle → lock → stoop → leave → away.
// ---------------------------------------------------------------------------
import * as THREE from '../../vendor/three.module.js';
import { SKY } from './sky.js';
import { clamp } from '../engine/util.js';

const RIB_VERT = /* glsl */`
uniform vec3 uA, uB; uniform float uWidth;
varying vec2 vUv;
void main() {
  vec3 p = mix(uA, uB, position.x);
  vec3 side = normalize(cross(normalize(uB - uA), normalize(cameraPosition - p)));
  p += side * position.y * uWidth * (0.35 + length(cameraPosition - p) * 0.005);
  vUv = position.xy;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const RIB_FRAG = /* glsl */`
uniform float uAlpha, uTime; uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float a = 1.0 - abs(vUv.y);
  float dash = 0.5 + 0.5 * step(0.5, fract(vUv.x * 16.0 - uTime * 4.0));
  gl_FragColor = vec4(uColor, a * a * dash * uAlpha * smoothstep(0.0, 0.12, vUv.x));
}`;

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Falcon {
  constructor(landMaterial) {
    // forward +Z, wings along X, one unit of span: a dark body, long swept wings, a short fan of tail
    const P = [0, 0, 0.42, 0.07, 0, 0.05, -0.07, 0, 0.05, 0.07, 0, 0.05, 0, 0, -0.34, -0.07, 0, 0.05,
      0.06, 0, 0.17, 0.5, 0.02, -0.17, 0.06, 0, -0.1, -0.06, 0, 0.17, -0.06, 0, -0.1, -0.5, 0.02, -0.17,
      0, 0, -0.26, 0.11, 0, -0.5, -0.11, 0, -0.5];
    const col = new THREE.Color('#2a2630'), C = [];
    for (let i = 0; i < P.length / 3; i++) C.push(col.r, col.g, col.b);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    this.mesh = new THREE.Mesh(g, landMaterial); this.mesh.frustumCulled = false; this.mesh.visible = false;
    this.span = 9;

    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, -1, 0, 1, 1, 0, 0, 1, 0], 3));
    this.ru = { uA: { value: new THREE.Vector3() }, uB: { value: new THREE.Vector3() }, uWidth: { value: 0.5 }, uAlpha: { value: 0 }, uTime: SKY.uTime, uColor: { value: new THREE.Color(3.2, 0.7, 0.35) } };
    this.line = new THREE.Mesh(rg, new THREE.ShaderMaterial({ vertexShader: RIB_VERT, fragmentShader: RIB_FRAG, uniforms: this.ru, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.line.frustumCulled = false; this.line.renderOrder = 9; this.line.visible = false;

    this.pos = new THREE.Vector3(); this.dir = new THREE.Vector3(0, 0, -1); this.aim = new THREE.Vector3(); this.ctr = new THREE.Vector3();
    this.strike = new THREE.Vector3();
    this.state = 'away'; this.t = 0; this.speed = 0; this.ang = 0; this.maxNear = 0;
    this.circleDur = 4.2; this.lockDur = 0.9;
  }
  get busy() { return this.state !== 'away'; }

  /** come in over the flock, from the side the lens can see */
  attack(flock, camera) {
    const p = flock.player;
    camera.getWorldDirection(_v); _v.y = 0; _v.normalize();
    _w.set(-_v.z, 0, _v.x);                                   // the lens's right
    this.ang = Math.atan2(_w.z, _w.x) + (Math.random() < 0.5 ? 0 : Math.PI);
    this.ctr.set(p.cx, p.cy + 46, p.cz);
    this.pos.set(this.ctr.x + Math.cos(this.ang) * 150, this.ctr.y + 40, this.ctr.z + Math.sin(this.ang) * 150);
    this.state = 'circle'; this.t = 0; this.speed = 36; this.maxNear = 0; this.near = false; this.passed = false; this.flared = false;
    this.mesh.visible = true;
  }
  cancel() { this.state = 'away'; this.mesh.visible = false; this.line.visible = false; }
  /** hang in the air at a point, looking along a direction (a problem to be read, not yet a threat) */
  hold(at, look) { this.state = 'hold'; this.t = 0; this.home = at.clone(); this.pos.copy(at); this.dir.copy(look).normalize(); this.look = this.dir.clone(); this.mesh.visible = true; this.line.visible = false; }
  /** fold and go down the straight line to a point; cb.through() as it passes */
  dive(to) { this.state = 'dive'; this.t = 0; this.speed = 30; this.aim.copy(to); this.dir.subVectors(to, this.pos).normalize(); this.passed = false; this.tPass = 0; this.near = false; }

  update(dt, flock, cb) {
    const p = flock.player, th = flock.threat;
    th.on = false;
    if (this.state === 'away') return;
    this.t += dt;
    let tuck = 1;
    if (this.state === 'hold') {                      // wind-hovering: it barely moves
      this.pos.set(this.home.x + Math.sin(this.t * 1.7) * 0.5, this.home.y + Math.sin(this.t * 2.3) * 0.35, this.home.z);
      this.dir.copy(this.look);
    } else if (this.state === 'dive') {
      tuck = 0.42;
      this.speed = Math.min(78, this.speed + 80 * dt);
      this.pos.addScaledVector(this.dir, this.speed * dt);
      th.on = true; th.x = this.pos.x; th.y = this.pos.y; th.z = this.pos.z;
      if (!this.near && this.pos.distanceTo(this.aim) < 55) { this.near = true; cb.near && cb.near(); }
      if (!this.passed && _w.subVectors(this.aim, this.pos).dot(this.dir) < 0) { this.passed = true; cb.through && cb.through(); }
      if (this.passed) { this.tPass += dt; if (this.tPass > 0.3) { this.state = 'leave'; this.t = 0; } }
    } else if (this.state === 'circle') {
      this.ang += dt * 1.0;
      this.ctr.lerp(_v.set(p.cx, p.cy + 46, p.cz), Math.min(1, dt * 1.6));
      _v.set(this.ctr.x + Math.cos(this.ang) * 50, this.ctr.y + Math.sin(this.t * 1.3) * 4, this.ctr.z + Math.sin(this.ang) * 50);
      _w.subVectors(_v, this.pos); const d = _w.length();
      if (d > 1e-3) { this.dir.lerp(_w.divideScalar(d), Math.min(1, dt * 3)).normalize(); this.pos.addScaledVector(this.dir, Math.min(d, 46 * dt)); }
      if (this.t > this.circleDur && p.fly > 0) { this.state = 'lock'; this.t = 0; this.aim.set(p.cx + p.vx * 0.7, p.cy + p.vy * 0.7, p.cz + p.vz * 0.7); cb.lock && cb.lock(); }
    } else if (this.state === 'lock') {
      this.aim.lerp(_v.set(p.cx + p.vx * 0.6, p.cy + p.vy * 0.6, p.cz + p.vz * 0.6), Math.min(1, dt * 3));
      this.dir.lerp(_w.subVectors(this.aim, this.pos).normalize(), Math.min(1, dt * 6)).normalize();
      this.pos.addScaledVector(this.dir, 6 * dt);
      tuck = 1 - 0.5 * clamp(this.t / this.lockDur, 0, 1);
      this.line.visible = true; this.ru.uA.value.copy(this.pos); this.ru.uB.value.copy(this.aim); this.ru.uAlpha.value = clamp(this.t / this.lockDur, 0, 1) * 0.9;
      if (this.t > this.lockDur) { this.state = 'stoop'; this.t = 0; this.speed = 34; this.maxNear = 0; this.near = false; this.passed = false; this.flared = false; this.tPass = 0; cb.stoop && cb.stoop(); }
    } else if (this.state === 'stoop') {
      tuck = 0.42;
      this.speed = Math.min(86, this.speed + 95 * dt);
      if (!this.passed) {
        this.aim.lerp(_v.set(p.cx + p.vx * 0.25, p.cy + p.vy * 0.25, p.cz + p.vz * 0.25), Math.min(1, dt * 1.1));
        _w.subVectors(this.aim, this.pos);
        if (_w.dot(this.dir) < 0) { this.passed = true; this.flared = flock.flare > 0; }      // it arrives: was the flock open?
        else this.dir.lerp(_w.normalize(), Math.min(1, dt * 2.4)).normalize();
      } else this.tPass += dt;
      this.pos.addScaledVector(this.dir, this.speed * dt);
      th.on = true; th.x = this.pos.x; th.y = this.pos.y; th.z = this.pos.z;
      if (!this.near && this.pos.distanceTo(this.aim) < 62) { this.near = true; cb.near && cb.near(); }
      const n = flock.countNear(p, this.pos.x, this.pos.y, this.pos.z, 11);
      if (n > this.maxNear) { this.maxNear = n; this.strike.copy(this.pos); }
      this.ru.uA.value.copy(this.pos); this.ru.uAlpha.value *= Math.max(0, 1 - dt * 5);
      if (this.tPass > 0.32 || this.t > 3.4 || this.pos.y < 3) {
        if (!this.passed) this.flared = flock.flare > 0;
        const need = Math.max(16, p.fly * 0.035), hit = !this.flared && this.maxNear >= need;
        if (!this.maxNear) this.strike.copy(this.pos);
        this.state = 'leave'; this.t = 0; this.line.visible = false;
        cb.strike && cb.strike(hit, this.strike, this.dir, this.flared);
      }
    } else if (this.state === 'leave') {
      this.dir.y += (0.6 - this.dir.y) * Math.min(1, dt * 1.8); this.dir.normalize();
      this.speed = Math.max(42, this.speed - 30 * dt);
      this.pos.addScaledVector(this.dir, this.speed * dt);
      if (this.t < 0.7) { th.on = true; th.x = this.pos.x; th.y = this.pos.y; th.z = this.pos.z; }
      if (this.t > 3.4) this.cancel();
    }
    this.mesh.position.copy(this.pos);
    this.mesh.lookAt(_v.copy(this.pos).add(this.dir));
    // seen from the bank a bird flying across the view is a line: roll it so its wings face the lens
    if (this.state === 'hold' || this.state === 'dive') this.mesh.rotateZ(1.2);
    this.mesh.scale.set(this.span * tuck, this.span, this.span);
  }
}
