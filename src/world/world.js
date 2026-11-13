// ---------------------------------------------------------------------------
// The world: one scene (sky, lake, land, flock, falcon, lure and the small
// lights), one clock (the time of day) and the reflection pass.
// ---------------------------------------------------------------------------
import * as THREE from '../../vendor/three.module.js';
import { Sky, SKY } from './sky.js';
import { Water } from './water.js';
import { Land, TREE, CANOPY } from './land.js';
import { Flock } from './flock.js';
import { Falcon } from './falcon.js';
import { Lure } from './lure.js';
import { Glows } from './motes.js';
import { clamp, smoothstep, DEG } from '../engine/util.js';

const BEACON_VERT = /* glsl */`
uniform vec3 uBase; uniform float uW, uH;
varying vec2 vUv;
void main() {
  vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), cameraPosition - uBase));
  vec3 p = uBase + side * position.x * uW + vec3(0.0, position.y * uH, 0.0);
  vUv = position.xy;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const BEACON_FRAG = /* glsl */`
uniform float uK, uTime; uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float x = 1.0 - abs(vUv.x);
  float a = x * x * x * x * pow(1.0 - vUv.y, 2.2) * (0.85 + 0.15 * sin(uTime * 2.0 + vUv.y * 9.0));
  gl_FragColor = vec4(uColor, a * uK);
}`;

const _c = new THREE.Color(), _v = new THREE.Vector3(), _f = new THREE.Vector3();

export class World {
  constructor({ birds = 5000, seed = 7 } = {}) {
    this.scene = new THREE.Scene();
    this.sky = new Sky(); this.water = new Water(); this.land = new Land(seed);
    this.flock = new Flock(birds); this.flock.tree.x = TREE.x; this.flock.tree.z = TREE.z;
    this.falcon = new Falcon(this.land.material);
    this.lure = new Lure();
    this.tod = 0; this.time = 0; this.lampK = 0; this.fireK = 0; this.beaconK = 0;
    this.stray = new THREE.Color();

    // the temple's lamps
    const L = this.land.lamps;
    this.lamps = new Glows(L.length, { pow: 2.6, minPx: 2.6, flicker: 0.3 });
    // fireflies: in the banyan, over its reeds, along the near bank
    this.fire = new Glows(170, { pow: 2.0, minPx: 2.2 });
    this.fireBase = [];
    for (let i = 0; i < 170; i++) {
      const a = Math.random() * 6.2832;
      if (i < 110) { const r = 6 + Math.random() * 30; this.fireBase.push([TREE.x + Math.cos(a) * r, 1.5 + Math.random() * (r < 26 ? 24 : 5), TREE.z + Math.sin(a) * r, Math.random()]); }
      else this.fireBase.push([-90 + Math.random() * 125, 0.8 + Math.random() * 3.5, 188 + Math.random() * 18, Math.random()]);
    }
    // dust and midges in the last sun: an endless field wrapped round the lens
    this.dust = new Glows(220, { pow: 1.8, minPx: 1.6 });
    this.dustBase = Array.from({ length: 220 }, () => [Math.random() * 110, Math.random() * 30, Math.random() * 90, Math.random()]);
    // feathers a strike knocks loose
    this.feather = new Glows(48, { pow: 1.6, minPx: 1.8 }); this.feathers = [];
    // the light that rises from the tree when it is time to come home
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
    this.bu = { uBase: { value: new THREE.Vector3(TREE.x, CANOPY.y + 2, TREE.z) }, uW: { value: 8 }, uH: { value: 170 }, uK: { value: 0 }, uTime: SKY.uTime, uColor: { value: new THREE.Color(2.6, 1.9, 1.0) } };
    this.beacon = new THREE.Mesh(bg, new THREE.ShaderMaterial({ vertexShader: BEACON_VERT, fragmentShader: BEACON_FRAG, uniforms: this.bu, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.beacon.frustumCulled = false; this.beacon.renderOrder = 7;

    this.scene.add(this.sky.mesh, this.water.mesh, this.land.group, this.flock.mesh, this.falcon.mesh, this.falcon.line,
      this.lamps.mesh, this.fire.mesh, this.dust.mesh, this.feather.mesh, this.beacon, this.lure.trail.mesh, this.lure.mesh);
    this.setTod(0);
  }

  setSize(w, h) { this.water.setSize(w, h); this.bufH = h; }
  setTod(t) { this.tod = clamp(t, 0, 1); this.sky.set(this.tod); }

  /** a place for a bird to land: somewhere on the crown of the banyan */
  nextPerch() {
    const C = this.land.canopy, b = C[(Math.random() * C.length) | 0];
    const a = Math.random() * 6.2832, e = Math.asin(Math.random() * 1.15 - 0.15), k = 0.93 + Math.random() * 0.1;
    return [b.x + Math.cos(a) * Math.cos(e) * b.rx * k, b.y + Math.sin(e) * b.ry * k, b.z + Math.sin(a) * Math.cos(e) * b.rz * k];
  }

  /** feathers where the falcon went through */
  burst(at, dir, n = 28) {
    for (let i = 0; i < n && this.feathers.length < 48; i++) {
      this.feathers.push({ x: at.x, y: at.y, z: at.z, vx: dir.x * 14 + (Math.random() - 0.5) * 26, vy: (Math.random() - 0.2) * 16, vz: dir.z * 14 + (Math.random() - 0.5) * 26, t: 0, life: 1.6 + Math.random() * 1.4 });
    }
  }

  update(dt, ui, camera) {
    this.time += dt;
    this.sky.update(dt);
    SKY.uPx.value = (this.bufH || 800) / (2 * Math.tan(camera.fov * DEG / 2));
    this.land.update(this.time);
    this.lure.update(ui);
    // a stray is rosy and catches the sky's light, so it reads against the flock's dark
    this.stray.copy(SKY.uAmbient.value).multiplyScalar(1.7).add(_c.copy(SKY.uSunColor.value).multiplyScalar(0.5 * SKY.uSunLit.value));
    this.stray.r *= 1.0; this.stray.g *= 0.62; this.stray.b *= 0.6;
    this.flock.update(dt, this.stray);

    // lamps come on one by one
    const L = this.land.lamps;
    for (let i = 0; i < L.length; i++) {
      const k = clamp(this.lampK * (L.length + 3) - i * 0.9, 0, 1);
      this.lamps.set(i, L[i].x, L[i].y, L[i].z, 7.5 * k, 3.6 * k, 1.1 * k, 1.5, i * 0.37);
    }
    this.lamps.commit();
    // fireflies
    const fk = this.fireK, t = this.time;
    for (let i = 0; i < this.fireBase.length; i++) {
      const b = this.fireBase[i], ph = b[3] * 50;
      const blink = Math.pow(Math.max(0, Math.sin(t * (0.9 + b[3] * 1.1) + ph)), 5) * fk;
      this.fire.set(i, b[0] + Math.sin(t * 0.31 + ph) * 2.4, b[1] + Math.sin(t * 0.47 + ph * 1.3) * 1.2, b[2] + Math.cos(t * 0.27 + ph * 0.7) * 2.4, 2.6 * blink, 3.6 * blink, 0.7 * blink, 0.34, b[3]);
    }
    this.fire.commit();
    // dust: wrap a fixed random field into a box ahead of the lens
    camera.getWorldDirection(_f);
    const cx = camera.position.x + _f.x * 42 - 55, cz = camera.position.z + _f.z * 42 - 45;
    const sun = SKY.uSunColor.value, sk = 0.55 * SKY.uSunLit.value + 0.04;
    for (let i = 0; i < this.dustBase.length; i++) {
      const b = this.dustBase[i], ph = b[3] * 60;
      const x = cx + ((((b[0] + t * 0.5 - cx) % 110) + 110) % 110), z = cz + ((((b[2] - cz) % 90) + 90) % 90);
      const y = 0.6 + ((b[1] + Math.sin(t * 0.2 + ph) * 1.5 + 30) % 30);
      const tw = 0.5 + 0.5 * Math.sin(t * (1.2 + b[3] * 2) + ph);
      this.dust.set(i, x, y, z, sun.r * sk * tw, sun.g * sk * tw, sun.b * sk * tw, 0.07 + b[3] * 0.08, b[3]);
    }
    this.dust.commit();
    // feathers
    for (let i = this.feathers.length - 1; i >= 0; i--) {
      const f = this.feathers[i]; f.t += dt;
      if (f.t > f.life) { this.feathers.splice(i, 1); continue; }
      f.vx *= 1 - dt * 1.6; f.vz *= 1 - dt * 1.6; f.vy += (-3.2 - f.vy) * dt * 1.4;
      f.x += f.vx * dt + Math.sin(f.t * 5 + i) * dt * 2; f.y += f.vy * dt; f.z += f.vz * dt;
    }
    for (let i = 0; i < 48; i++) {
      const f = this.feathers[i];
      if (f) { const k = (1 - f.t / f.life) * 1.3; this.feather.set(i, f.x, f.y, f.z, 1.5 * k, 1.1 * k, 1.0 * k, 0.32, i); } else this.feather.set(i, 0, -50, 0, 0, 0, 0, 0.01, 0);
    }
    this.feather.commit();
    this.bu.uK.value = this.beaconK * 0.36;
    this.beacon.visible = this.beaconK > 0.002;
  }

  /** the mirrored pass for the lake */
  prerender(renderer, camera) { this.water.render(renderer, this.scene, camera); }
}
