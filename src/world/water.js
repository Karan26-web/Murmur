// ---------------------------------------------------------------------------
// The lake. A real planar reflection: the whole world is drawn once more from a
// camera mirrored under the surface (half resolution, HDR, so the reflected sun
// still blooms), and the surface samples that picture through its ripples. The
// lens sits a few metres above the water, so most of the lake is a grazing mirror
// and every bird, lamp and cloud gets a wobbling twin.
// ---------------------------------------------------------------------------
import * as THREE from '../../vendor/three.module.js';
import { NOISE, FOG } from './glsl.js';
import { SKY } from './sky.js';

const VERT = /* glsl */`
uniform mat4 uTexMatrix;
varying vec3 vWorld; varying vec4 vProj;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz; vProj = uTexMatrix * w;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */`
uniform sampler2D tReflect;
uniform float uTime, uSunI, uRipple;
uniform vec3 uSunDir, uSunColor, uDeep;
varying vec3 vWorld; varying vec4 vProj;
${NOISE}
${FOG}
vec2 grad(vec2 p) {
  const float e = 0.35;
  return vec2(vnoise(p + vec2(e, 0.0)) - vnoise(p - vec2(e, 0.0)), vnoise(p + vec2(0.0, e)) - vnoise(p - vec2(0.0, e)));
}
void main() {
  vec3 toCam = cameraPosition - vWorld; float dist = length(toCam); vec3 V = toCam / dist;
  vec2 p = vWorld.xz;
  vec2 g = grad(p * 0.11 + uTime * vec2(0.22, 0.07)) * 0.9
         + grad(p * 0.37 + uTime * vec2(-0.16, 0.31)) * 0.5
         + grad(p * 1.3 + uTime * vec2(0.4, -0.2)) * 0.22;
  g *= uRipple;
  float calm = 1.0 / (1.0 + dist * 0.006);          // far ripples average out inside a pixel
  vec3 N = normalize(vec3(-g.x * calm, 1.0, -g.y * calm));
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);

  // at a grazing angle a small tilt of the surface throws the reflected ray a long way up or down: tall streaks
  vec2 uv = vProj.xy / vProj.w + vec2(g.x * 0.012, g.y * 0.05) * (0.25 + 0.75 * calm);
  vec3 refl = texture2D(tReflect, clamp(uv, 0.001, 0.999)).rgb;
  vec3 col = mix(uDeep, refl, clamp(0.32 + fres * 0.9, 0.0, 1.0));

  // glitter: the ripples that happen to face the sun
  vec3 R = reflect(-V, N);
  float s = pow(max(dot(R, normalize(vec3(uSunDir.x, abs(uSunDir.y) + 0.02, uSunDir.z))), 0.0), 260.0);
  col += uSunColor * s * uSunI * 0.22;
  gl_FragColor = vec4(applyFog(col, dist), 1.0);
}`;

const _pos = new THREE.Vector3(), _look = new THREE.Vector3(), _rot = new THREE.Matrix4();

export class Water {
  constructor() {
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, generateMipmaps: false });
    this.vcam = new THREE.PerspectiveCamera();
    this.texMatrix = new THREE.Matrix4();
    const geo = new THREE.PlaneGeometry(9000, 9000); geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        tReflect: { value: this.rt.texture }, uTexMatrix: { value: this.texMatrix }, uRipple: { value: 1 },
        uTime: SKY.uTime, uSunI: SKY.uSunI, uSunDir: SKY.uSunDir, uSunColor: SKY.uSunColor, uDeep: SKY.uDeep,
        uFogColor: SKY.uFogColor, uFogDensity: SKY.uFogDensity,
      },
    }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = -50;
    this.scale = 0.5;
  }
  setSize(w, h) { this.rt.setSize(Math.max(2, Math.round(w * this.scale)), Math.max(2, Math.round(h * this.scale))); }

  /** draw the mirrored world into the reflection target (call before the main pass) */
  render(renderer, scene, camera) {
    camera.updateMatrixWorld();
    _pos.setFromMatrixPosition(camera.matrixWorld);
    _rot.extractRotation(camera.matrixWorld);
    _look.set(0, 0, -1).applyMatrix4(_rot).add(_pos);
    const v = this.vcam;
    v.position.set(_pos.x, -_pos.y, _pos.z);
    v.up.set(0, 1, 0).applyMatrix4(_rot); v.up.y *= -1;
    v.lookAt(_look.x, -_look.y, _look.z);
    v.near = camera.near; v.far = camera.far;
    v.updateMatrixWorld();
    v.projectionMatrix.copy(camera.projectionMatrix); v.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    this.texMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(v.projectionMatrix).multiply(v.matrixWorldInverse);
    this.mesh.visible = false;
    renderer.setRenderTarget(this.rt); renderer.clear(); renderer.render(scene, v);
    renderer.setRenderTarget(null);
    this.mesh.visible = true;
  }
}
