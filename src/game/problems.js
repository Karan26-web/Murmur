// ---------------------------------------------------------------------------
// The maths: Class 10, "Some Applications of Trigonometry" (heights and distances).
// Every question is one right triangle standing on the lake:
//
//                      C  the strays (or the falcon, or the tree-top)
//                     /|
//      line of sight /  |  height (h)
//                   / θ |
//      the lamp    A----B   distance along the water (d)
//
// with θ one of 30°, 45°, 60°, and one of h, d, the line of sight or θ unknown.
// Each wrong option is a particular mistake (the ratio upside down, the wrong
// ratio, the wrong standard value, the wrong side), so a miss can be answered
// with the idea that was missing rather than with "wrong".
//   H  find the height        (tan)          F  the falcon: angle of depression, find the distance
//   D  find the distance      (tan)          T  the banyan: two angles 40 m apart, find the height
//   S  find the line of sight (sin or cos)
//   A  find the angle
// ---------------------------------------------------------------------------
import { t } from '../engine/i18n.js';
import { mulberry32 } from '../engine/util.js';

/** an exact length k·√r, as a number and as it is written */
export const V = (k, r = 1) => ({ k, r, n: k * Math.sqrt(r), text: r === 1 ? String(k) : `${k}√${r}` });
const DEGREES = (a) => ({ k: a, r: 1, n: a, text: `${a}°` });
/** the standard values, as they are written */
const RV = {
  tan: { 30: '1/√3', 45: '1', 60: '√3' },
  sin: { 30: '1/2', 45: '1/√2', 60: '√3/2' },
  cos: { 30: '√3/2', 45: '1/√2', 60: '1/2' },
};
const RAD = Math.PI / 180;

function shuffle(a, rng) { for (let i = a.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }

/** assemble a question; `ans` and each wrong value are V() lengths (or DEGREES) */
function mk(rng, q, ans, wrong, unit = ' m') {
  const seen = new Set([ans.text]), opts = [{ text: ans.text + unit, val: ans.n, code: null }];
  for (const [v, code] of wrong) { if (!v || seen.has(v.text) || !(v.n > 0)) continue; seen.add(v.text); opts.push({ text: v.text + unit, val: v.n, code }); }
  q.options = shuffle(opts.slice(0, 4), rng); q.answer = ans.text + unit;
  return q;
}
const pick = (rng, a) => a[(rng() * a.length) | 0];

function H(rng, theta, roomy = false) {
  const w = { h: t('w.h') };
  const d = theta === 45 ? pick(rng, roomy ? [50, 60, 70] : [30, 40, 50, 60, 70]) : theta === 60 ? pick(rng, [20, 30, 40, 50]) : pick(rng, [30, 60, 90]);
  let ans, wrong;
  if (theta === 45) { ans = V(d); wrong = [[V(d, 2), 'hyp'], [V(d / 2), 'value'], [V(d, 3), 'value']]; }
  else if (theta === 60) { ans = V(d, 3); wrong = [[V(d), 'value'], [V(2 * d), 'hyp'], d % 3 === 0 ? [V(d / 3, 3), 'inv'] : [V(d / 2, 3), 'ratio']]; }
  else { ans = V(d / 3, 3); wrong = [[V(d, 3), 'inv'], [V(d / 2), 'ratio'], [V(d), 'value']]; }
  return mk(rng, { type: 'H', theta, nd: d, nh: ans.n, unknown: 'h', show: { d: `${d} m`, theta: `${theta}°` }, diyas: true, ratio: 'tan',
    work: [`tan ${theta}° = ${w.h} ÷ ${d}`, `${RV.tan[theta]} = ${w.h} ÷ ${d}`, `${w.h} = ${ans.text} m`] }, ans, wrong);
}

/** the height is known, the distance is asked (also the falcon's question, with the angle at the top) */
function D(rng, theta, type = 'D') {
  const w = { d: t('w.d') };
  let h, ans, wrong;
  if (theta === 45) { const k = pick(rng, [30, 40, 50, 60]); h = V(k); ans = V(k); wrong = [[V(k, 2), 'hyp'], [V(k / 2), 'value'], [V(k, 3), 'value']]; }
  else if (theta === 60) {
    if (rng() < 0.5) { const k = pick(rng, [20, 30, 40]); h = V(k, 3); ans = V(k); wrong = [[V(3 * k), 'inv'], [V(k, 3), 'value'], [V(2 * k), 'hyp']]; }
    else { const k = pick(rng, [30, 60]); h = V(k); ans = V(k / 3, 3); wrong = [[V(k, 3), 'inv'], [V(k), 'value'], [V(2 * k / 3, 3), 'hyp']]; }
  } else { const k = pick(rng, [20, 30, 40, 50]); h = V(k); ans = V(k, 3); wrong = [[V(k), 'value'], [V(2 * k), 'hyp'], k % 3 === 0 ? [V(k / 3, 3), 'inv'] : [V(k / 2, 3), 'ratio']]; }
  const work = [`tan ${theta}° = ${h.text} ÷ ${w.d}`, `${RV.tan[theta]} = ${h.text} ÷ ${w.d}`, `${w.d} = ${ans.text} m`];
  if (type === 'F') work.unshift(t('work.alt'));
  return mk(rng, { type, theta, nd: ans.n, nh: h.n, unknown: 'd', show: { h: `${h.text} m`, theta: `${theta}°` }, ticks: h.r === 1, ratio: 'tan', work }, ans, wrong);
}

/** the length of the line of sight: the two ratios that have the hypotenuse in them */
function S(rng) {
  const w = { L: t('w.L') }, kind = pick(rng, ['30h', '60d', '45h']);
  if (kind === '30h') {
    const h = pick(rng, [20, 30, 40, 50]), ans = V(2 * h);
    return mk(rng, { type: 'S', theta: 30, nd: h * Math.sqrt(3), nh: h, unknown: 'L', show: { h: `${h} m`, theta: '30°' }, ticks: true, ratio: 'sin',
      work: [`sin 30° = ${h} ÷ ${w.L}`, `1/2 = ${h} ÷ ${w.L}`, `${w.L} = ${ans.text} m`] }, ans, [[V(h, 3), 'side'], [V(h / 2), 'inv'], h % 3 === 0 ? [V(2 * h / 3, 3), 'value'] : [V(h, 2), 'value']]);
  }
  if (kind === '60d') {
    const d = pick(rng, [20, 30, 40, 50]), ans = V(2 * d);
    return mk(rng, { type: 'S', theta: 60, nd: d, nh: d * Math.sqrt(3), unknown: 'L', show: { d: `${d} m`, theta: '60°' }, diyas: true, ratio: 'cos',
      work: [`cos 60° = ${d} ÷ ${w.L}`, `1/2 = ${d} ÷ ${w.L}`, `${w.L} = ${ans.text} m`] }, ans, [[V(d, 3), 'side'], [V(d / 2), 'inv'], d % 3 === 0 ? [V(2 * d / 3, 3), 'value'] : [V(d, 2), 'value']]);
  }
  const h = pick(rng, [30, 40, 50, 60]), ans = V(h, 2);
  return mk(rng, { type: 'S', theta: 45, nd: h, nh: h, unknown: 'L', show: { h: `${h} m`, theta: '45°' }, ticks: true, ratio: 'sin',
    work: [`sin 45° = ${h} ÷ ${w.L}`, `1/√2 = ${h} ÷ ${w.L}`, `${w.L} = ${ans.text} m`] }, ans, [[V(h), 'longest'], [V(2 * h), 'value'], [V(h / 2, 2), 'inv']]);
}

/** two sides are known, the angle is asked */
function A(rng, withSight = false) {
  let theta, q;
  if (withSight) {
    if (rng() < 0.5) { const h = pick(rng, [20, 30, 40]); theta = 30; q = { nd: h * Math.sqrt(3), nh: h, show: { h: `${h} m`, L: `${2 * h} m` }, ticks: true, ratio: 'sin', work: [`sin θ = ${h} ÷ ${2 * h}`, 'sin θ = 1/2', 'θ = 30°'] }; }
    else { const d = pick(rng, [20, 30, 40]); theta = 60; q = { nd: d, nh: d * Math.sqrt(3), show: { d: `${d} m`, L: `${2 * d} m` }, diyas: true, ratio: 'cos', work: [`cos θ = ${d} ÷ ${2 * d}`, 'cos θ = 1/2', 'θ = 60°'] }; }
  } else {
    theta = pick(rng, [30, 45, 60]);
    const k = pick(rng, [20, 30, 40]);
    const h = theta === 60 ? V(k, 3) : V(k), d = theta === 30 ? V(k, 3) : V(k);
    q = { nd: d.n, nh: h.n, show: { h: `${h.text} m`, d: `${d.text} m` }, diyas: d.r === 1, ticks: h.r === 1, ratio: 'tan', work: [`tan θ = ${h.text} ÷ ${d.text}`, `tan θ = ${RV.tan[theta]}`, `θ = ${theta}°`] };
  }
  const wrong = [30, 45, 60].filter((a) => a !== theta).map((a) => [DEGREES(a), a + theta === 90 ? 'swap' : 'other']);
  return mk(rng, { type: 'A', theta, unknown: 'theta', ...q }, DEGREES(theta), wrong, '');
}

/** the banyan: seen at 30° from the far lamp and at 60° from the lamp 40 m nearer */
function T(rng) {
  const w = { h: t('w.h') };
  return mk(rng, { type: 'T', theta: 60, theta2: 30, gap: 40, nd: 20, nh: 20 * Math.sqrt(3), unknown: 'h', show: {}, ratio: 'tan',
    work: [`tan 60°:  ${w.h} = x × √3`, `tan 30°:  ${w.h} = (x + 40) ÷ √3`, '3x = x + 40,  x = 20', `${w.h} = 20√3 m`] },
  V(20, 3), [[V(40, 3), 'one'], [V(20), 'x'], [V(10, 3), 'value']]);
}

/** where an option puts the light: metres along the water from the lamp (s) and above it (y) */
export function endpoint(q, val) {
  switch (q.type) {
    case 'H': return { s: q.nd, y: val };
    case 'D': case 'F': return { s: val, y: q.nh };
    case 'S': return { s: val * Math.cos(q.theta * RAD), y: val * Math.sin(q.theta * RAD) };
    case 'A': return { s: q.nd, y: q.nd * Math.tan(val * RAD) };
    default: return { s: 0, y: val };
  }
}
/** how a wrong option misses: 'low' | 'high' | 'short' | 'far' (or 'perfect') */
export function outcome(q, opt) {
  if (opt.code === null) return 'perfect';
  if (q.type === 'H' || q.type === 'T') return opt.val < q.nh ? 'low' : 'high';
  if (q.type === 'A') return opt.val < q.theta ? 'low' : 'high';
  const truth = q.type === 'S' ? Math.hypot(q.nd, q.nh) : q.nd;
  return opt.val < truth ? 'short' : 'far';
}

/** One evening: seven sightings, two falcons, the tree. `scale` sizes the wisps to the device's bird cap. */
export function buildPlan(seed, scale = 1) {
  const rng = mulberry32(seed);
  const sizes = [220, 280, 340, 400, 460, 520, 580].map((n) => Math.round(n * scale));
  const mixed = () => { const k = (rng() * 4) | 0; return k === 0 ? D(rng, pick(rng, [30, 60])) : k === 1 ? H(rng, pick(rng, [30, 60])) : k === 2 ? S(rng) : A(rng, true); };
  const list = [H(rng, 45, true), H(rng, 60), H(rng, 30), D(rng, pick(rng, [30, 45, 60])), D(rng, pick(rng, [45, 60, 30]), 'F'),
    S(rng), A(rng, false), mixed(), D(rng, pick(rng, [30, 60]), 'F'), T(rng)];
  let s = 0;
  for (const q of list) { q.kind = q.type === 'F' ? 'falcon' : q.type === 'T' ? 'tree' : 'sight'; if (q.kind === 'sight') q.birds = sizes[s++]; q.q = `q.${q.type}`;
    // the second rung of the hint ladder: the set-up, without the finish
    q.setup = q.type === 'F' ? q.work[1] : q.type === 'T' ? `${q.work[0]}\n${q.work[1]}` : q.work[0]; }
  return list;
}
