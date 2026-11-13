// ---------------------------------------------------------------------------
// Murmur: boot, the frame loop and the shared game context.
//   index.html → boot(): renderer, HDR post, the world (sky, lake, land, flock),
//   the title → begin → flow.js runs the evening.
// ---------------------------------------------------------------------------
import * as THREE from '../vendor/three.module.js';
import { Post } from './engine/post.js';
import { CameraDirector } from './engine/camera.js';
import { input } from './engine/input.js';
import { clock } from './engine/clock.js';
import { tweens, uiTweens } from './engine/tween.js';
import { param, isTouch, clamp, nextFrame } from './engine/util.js';
import { AudioEngine } from './engine/audio.js';
import { World } from './world/world.js';
import { HUD } from './ui/hud.js';
import { Flow } from './game/flow.js';
import { Dev } from './game/dev.js';

const touch = isTouch();
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x1a1430, 1);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 9000);
const post = new Post(renderer);
const director = new CameraDirector(camera);
const audio = new AudioEngine();
if (param('mute') === '1') audio.muted = true;

/** The shared context every part of the game works through. */
export const G = {
  THREE, renderer, camera, post, director, input, audio, clock,
  world: null, hud: null, flow: null, dev: null, touch,
  auto: param('auto') === '1', seed: +param('seed', (Math.random() * 1e9) | 0),
  fps: 60, ms: 0,
};
window.__mm = G;

/* --------------------------------------------------------------- sizing */
// Render resolution as a multiple of CSS pixels. Never below 1 (soft edges turn a bird two pixels wide into mush); a
// GPU that can't hold the frame rate gives the extra back first.
const QUALITY = { cap: touch ? 1.5 : 1.75, min: 1 };
let dpr = clamp(+param('dpr', clamp(devicePixelRatio || 1, QUALITY.min, QUALITY.cap)), 0.5, 3);
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
  const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
  post.setSize(bw, bh);
  if (G.world) G.world.setSize(bw, bh);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  director.setView(w, h);
}
addEventListener('resize', resize);

/* ------------------------------------------------- adaptive resolution */
const perf = { acc: 0, n: 0, slow: 0, fast: 0, locked: param('dpr') != null };
function adapt(raw) {
  if (document.hidden) return;
  perf.acc += raw; perf.n++;
  if (perf.acc < 1) return;
  const avg = perf.acc / perf.n; perf.acc = 0; perf.n = 0; G.fps = 1 / avg;
  if (perf.locked) return;
  if (avg > 1 / 42) { perf.slow++; perf.fast = 0; } else if (avg < 1 / 58) { perf.fast++; perf.slow = 0; } else { perf.slow = perf.fast = 0; }
  if (perf.slow >= 2 && dpr > QUALITY.min) { dpr = Math.max(QUALITY.min, dpr - 0.15); perf.slow = 0; resize(); }
  else if (perf.slow >= 3 && G.world.water.scale > 0.34) { G.world.water.scale = 0.33; perf.slow = 0; resize(); }      // then a coarser reflection
  else if (perf.fast >= 4 && dpr < QUALITY.cap) { dpr = Math.min(QUALITY.cap, dpr + 0.1); perf.fast = 0; resize(); }
}

/* ------------------------------------------------------------ the loop */
let last = performance.now(), running = false;
const FAST = clamp(+param('fast', 1), 0.25, 16);
function frame(now) {
  const raw = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  // ?fast=N plays N whole steps a frame (the simulation stays exact; only the wall clock is cheated)
  const steps = FAST > 1 ? Math.round(FAST) : 1, step = FAST < 1 ? raw * FAST : raw;
  const t0 = performance.now();
  for (let i = 0; i < steps; i++) {
    const { dt, ui } = clock.tick(step);
    tweens.update(dt); uiTweens.update(ui);
    G.flow.update(dt, ui);
    G.world.update(dt, ui, camera);
    director.update(ui);
  }
  G.ms += (performance.now() - t0 - G.ms) * 0.05;
  post.fx.dirBlur.copy(director.blurOut);
  G.world.prerender(renderer, camera);
  post.render(G.world.scene, camera, clock.realTime);
  adapt(raw);
  if (G.dev) G.dev.frame();
  requestAnimationFrame(frame);
}

/* ----------------------------------------------------------------- boot */
async function boot() {
  const bar = document.getElementById('ttFill');
  const progress = (p) => { bar.style.transform = `scaleX(${p})`; };
  progress(0.08);
  if (document.fonts) await Promise.race([document.fonts.load('400 40px "Cormorant Garamond"').catch(() => {}), new Promise((r) => setTimeout(r, 2500))]);
  progress(0.2); await nextFrame();
  G.world = new World({ birds: clamp(+param('birds', touch ? 3200 : 5000), 200, 12000), seed: 7 });
  resize();
  progress(0.6); await nextFrame();
  G.hud = new HUD(G);
  input.init();
  G.flow = new Flow(G);
  G.dev = new Dev(G);
  G.flow.title();
  // compile every shader now, so the first flare or the first lamp never hitches
  renderer.compile(G.world.scene, camera);
  progress(0.9); await nextFrame();
  if (!running) { running = true; requestAnimationFrame((t) => { last = t; frame(t); }); }
  progress(1);
  G.hud.ready(G.flow.best);
  G.dev.boot();
}

boot().catch((e) => {
  console.error(e);
  const d = document.getElementById('dev'); if (d) { d.hidden = false; d.textContent = String((e && e.stack) || e); }
});
