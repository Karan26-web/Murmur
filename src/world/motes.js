// ---------------------------------------------------------------------------
// Small lights: one instanced draw of camera-facing glows (additive, HDR so the
// bloom finishes them). The temple's lamps, the fireflies in the banyan, the
// dust in the last sun, the feathers a falcon knocks loose, the lure's trail.
// ---------------------------------------------------------------------------
import * as THREE from '../../vendor/three.module.js';
import { SKY } from './sky.js';

const VERT = /* glsl */`
attribute vec3 iPos;
attribute vec4 iCol;                  // rgb (HDR), a = phase
attribute float iSize;
uniform float uTime, uPx, uMinPx, uFlicker;
varying vec2 vUv; varying vec3 vCol;
void main() {
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  float size = iSize * max(1.0, uMinPx * -mv.z / (max(iSize, 1e-3) * uPx));
  mv.xy += position.xy * size;
  vUv = position.xy;
  vCol = iCol.rgb * (1.0 - uFlicker * (0.5 + 0.5 * sin(uTime * (3.0 + fract(iCol.a) * 6.0) + iCol.a * 40.0)));
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */`
uniform float uPow;
varying vec2 vUv; varying vec3 vCol;
void main() {
  float a = pow(max(1.0 - length(vUv), 0.0), uPow);
  gl_FragColor = vec4(vCol, a);
}`;

export class Glows {
  constructor(max, { pow = 2.2, minPx = 2, flicker = 0, order = 8 } = {}) {
    this.max = max; this.count = 0;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    const dyn = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aPos = dyn(3); this.aCol = dyn(4); this.aSize = dyn(1);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iCol', this.aCol); g.setAttribute('iSize', this.aSize);
    g.instanceCount = 0;
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: SKY.uTime, uPx: SKY.uPx, uMinPx: { value: minPx }, uFlicker: { value: flicker }, uPow: { value: pow } },
    }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = order;
  }
  set(i, x, y, z, r, g, b, size, phase = 0) {
    const P = this.aPos.array, C = this.aCol.array;
    P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
    C[i * 4] = r; C[i * 4 + 1] = g; C[i * 4 + 2] = b; C[i * 4 + 3] = phase;
    this.aSize.array[i] = size;
  }
  commit(count = this.max) {
    this.count = count; this.mesh.geometry.instanceCount = count;
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
  }
}
