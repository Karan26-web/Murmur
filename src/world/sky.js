// ---------------------------------------------------------------------------
// The sky is the clock. One number, tod (0 = golden hour, 0.62 = the sun touches
// the far bank, 0.8 = blue hour, 1 = night), drives every colour in the world:
// the dome, the sun and its glow, the clouds, the fog, the light on the land, the
// birds. SKY holds the shared uniforms; every material in the world reads them.
// ---------------------------------------------------------------------------
import * as THREE from '../../vendor/three.module.js';
import { NOISE } from './glsl.js';
import { clamp, lerp, smoothstep, DEG } from '../engine/util.js';

const C = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);

/** where the sun goes down (a compass bearing in the xz plane; the far bank dips there) */
export const SUN_AZ = 27 * DEG;
export const SUN_H = new THREE.Vector3(Math.sin(SUN_AZ), 0, -Math.cos(SUN_AZ));
export const TOD_SUNSET = 0.62;

// keys: golden hour · late gold · sunset · blue hour · night
const KEYS = [
  { t: 0.00, zenith: C('#3b74bd'), mid: C('#9dbcd4'), horizon: C('#ffd48f'), sun: C('#fff0c8'), sunI: 6, glow: C('#ffc679', 0.9), cloudLit: C('#ffe9c4'), cloudShade: C('#8292b4'), fog: C('#e6c794'), ambient: C('#7f93b2'), deep: C('#1c3a52'), bird: C('#17110f'), exposure: 1.0 },
  { t: 0.34, zenith: C('#456fb3'), mid: C('#e3b79a'), horizon: C('#ffb469'), sun: C('#ffd08a'), sunI: 5.5, glow: C('#ffa550', 1.0), cloudLit: C('#ffbd85'), cloudShade: C('#80749c'), fog: C('#dfa672'), ambient: C('#75779a'), deep: C('#1d3049'), bird: C('#140e10'), exposure: 1.0 },
  { t: 0.62, zenith: C('#33407f'), mid: C('#c9737a'), horizon: C('#ff8748'), sun: C('#ff8a3c'), sunI: 5, glow: C('#ff7434', 1.1), cloudLit: C('#ff7a60'), cloudShade: C('#544372'), fog: C('#c8714f'), ambient: C('#544c78'), deep: C('#1a2140'), bird: C('#0e0a10'), exposure: 0.98 },
  { t: 0.80, zenith: C('#161d4d'), mid: C('#4b3a7a'), horizon: C('#b9505c'), sun: C('#ff6a3a'), sunI: 3, glow: C('#d0506a', 0.5), cloudLit: C('#8a5a8f'), cloudShade: C('#272a56'), fog: C('#8a4a62'), ambient: C('#262b5a'), deep: C('#0d1230'), bird: C('#07070d'), exposure: 0.94 },
  { t: 1.00, zenith: C('#080d28'), mid: C('#121840'), horizon: C('#2a2c5e'), sun: C('#000000'), sunI: 0, glow: C('#2a3166', 0.2), cloudLit: C('#2a3060'), cloudShade: C('#0e1230'), fog: C('#1a2048'), ambient: C('#1c2450'), deep: C('#070a1c'), bird: C('#05050b'), exposure: 1.0 },
];
const COLS = ['zenith', 'mid', 'horizon', 'sun', 'glow', 'cloudLit', 'cloudShade', 'fog', 'ambient', 'deep', 'bird'];

/** the uniforms every material shares (the same objects, by reference) */
export const SKY = {
  uTime: { value: 0 }, uTod: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0, 0.2, -1) }, uMoonDir: { value: new THREE.Vector3() },
  uZenith: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
  uSunColor: { value: new THREE.Color() }, uSunI: { value: 10 }, uGlow: { value: new THREE.Color() },
  uCloudLit: { value: new THREE.Color() }, uCloudShade: { value: new THREE.Color() }, uCloudK: { value: 1 },
  uStarK: { value: 0 }, uMoonK: { value: 0 },
  uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.00115 },
  uAmbient: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() }, uBird: { value: new THREE.Color() },
  uSunLit: { value: 1 },
  uPx: { value: 800 },            // buffer pixels per metre at one metre from the lens (for minimum on-screen sizes)
};

const VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);   // the dome rides with whichever camera draws it
  gl_Position = p.xyww;
}`;

const FRAG = /* glsl */`
uniform vec3 uSunDir, uMoonDir, uZenith, uMid, uHorizon, uSunColor, uGlow, uCloudLit, uCloudShade;
uniform float uTime, uSunI, uStarK, uMoonK, uCloudK;
varying vec3 vDir;
${NOISE}
void main() {
  vec3 d = normalize(vDir); d.y = abs(d.y);        // under the horizon the dome mirrors itself (only ever seen in thin gaps)
  float e = d.y;
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.2, e));
  col = mix(col, uZenith, smoothstep(0.1, 0.8, e));

  // the sun's scattering: a wide warm bloom round it and a band that hugs the horizon under it
  float sd = max(dot(d, uSunDir), 0.0);
  float az = max(dot(normalize(d.xz + 1e-5), normalize(uSunDir.xz)), 0.0);
  col += uGlow * (pow(sd, 9.0) * 0.2 + pow(sd, 80.0) * 0.4);
  col += uGlow * 0.22 * exp(-e * 9.0) * pow(az, 4.0);

  // stars: one in a few hundred cells of a grid wrapped on the dome, each with its own twinkle
  if (uStarK > 0.001) {
    vec3 p = d * 190.0; vec3 ip = floor(p); vec3 fp = fract(p) - 0.5;
    float h = hash13(ip);
    float star = step(0.9962, h) * smoothstep(0.42, 0.0, length(fp));
    float tw = 0.6 + 0.4 * sin(uTime * (1.5 + h * 5.0) + h * 80.0);
    col += vec3(0.9, 0.95, 1.2) * star * tw * uStarK * (0.6 + 2.2 * fract(h * 91.7)) * smoothstep(0.03, 0.3, e);
  }
  // a young moon following the sun down
  if (uMoonK > 0.001) {
    float md = dot(d, uMoonDir);
    float disc = smoothstep(0.99955, 0.9997, md);
    float bite = smoothstep(0.99945, 0.9996, dot(d, normalize(uMoonDir + vec3(0.012, 0.007, 0.0))));
    col += vec3(1.25, 1.2, 1.05) * uMoonK * (disc * (1.0 - bite) * 1.9 + pow(max(md, 0.0), 2500.0) * 0.1);
  }

  // clouds: long evening streaks, lit from below and behind
  vec2 uv = d.xz / (e + 0.16);
  float n1 = fbm(uv * vec2(0.55, 1.5) + vec2(uTime * 0.006, 3.0));
  float n2 = fbm(uv * 1.7 + vec2(-uTime * 0.004, uTime * 0.002) + n1);
  float dens = n1 * 0.75 + n2 * 0.35;
  float cov = smoothstep(0.50, 0.82, dens) * smoothstep(0.015, 0.14, e) * (1.0 - smoothstep(0.55, 0.95, e));
  float thick = smoothstep(0.5, 0.95, dens);
  vec3 cl = mix(uCloudLit, uCloudShade, clamp(thick * 1.1 - sd * 0.5 + 0.15, 0.0, 1.0));
  cl += uSunColor * 0.9 * pow(sd, 14.0) * (1.0 - thick);
  col = mix(col, cl, cov * uCloudK);

  // the sun itself (HDR: the bloom makes the light)
  float disc = smoothstep(0.99926, 0.99946, dot(d, uSunDir));
  col += uSunColor * uSunI * disc * (1.0 - cov * 0.8);
  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  constructor() {
    const geo = new THREE.SphereGeometry(1, 48, 24);
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthTest: false, depthWrite: false,
      uniforms: {
        uSunDir: SKY.uSunDir, uMoonDir: SKY.uMoonDir, uZenith: SKY.uZenith, uMid: SKY.uMid, uHorizon: SKY.uHorizon,
        uSunColor: SKY.uSunColor, uGlow: SKY.uGlow, uCloudLit: SKY.uCloudLit, uCloudShade: SKY.uCloudShade,
        uTime: SKY.uTime, uSunI: SKY.uSunI, uStarK: SKY.uStarK, uMoonK: SKY.uMoonK, uCloudK: SKY.uCloudK,
      },
    }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = -100;
    this.tod = 0; this.exposure = 1; this.sunEl = 0;
    const el = 21 * DEG, az = SUN_AZ - 30 * DEG;
    SKY.uMoonDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    this.set(0);
  }

  /** sun height above the horizon in degrees at a time of day */
  static sunElevation(tod) { return lerp(13, -8, tod); }

  set(tod) {
    tod = clamp(tod, 0, 1); this.tod = tod; SKY.uTod.value = tod;
    let i = 0; while (i < KEYS.length - 2 && tod > KEYS[i + 1].t) i++;
    const a = KEYS[i], b = KEYS[i + 1], k = clamp((tod - a.t) / (b.t - a.t), 0, 1);
    const U = { zenith: SKY.uZenith, mid: SKY.uMid, horizon: SKY.uHorizon, sun: SKY.uSunColor, glow: SKY.uGlow, cloudLit: SKY.uCloudLit, cloudShade: SKY.uCloudShade, fog: SKY.uFogColor, ambient: SKY.uAmbient, deep: SKY.uDeep, bird: SKY.uBird };
    for (const c of COLS) U[c].value.lerpColors(a[c], b[c], k);
    SKY.uSunI.value = lerp(a.sunI, b.sunI, k);
    this.exposure = lerp(a.exposure, b.exposure, k);
    const el = (this.sunEl = Sky.sunElevation(tod)) * DEG;
    SKY.uSunDir.value.set(SUN_H.x * Math.cos(el), Math.sin(el), SUN_H.z * Math.cos(el)).normalize();
    // how much direct sun still reaches the land (none once the disc is under the bank)
    SKY.uSunLit.value = smoothstep(-1.5, 3.5, this.sunEl);
    SKY.uStarK.value = smoothstep(0.68, 0.97, tod);
    SKY.uMoonK.value = smoothstep(0.7, 0.92, tod);
  }

  update(dt) { SKY.uTime.value += dt; }
}
