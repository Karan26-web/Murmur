// ---------------------------------------------------------------------------
// Dev and QA switches (URL parameters), and the hooks the playtests read.
//   ?dev=1        a small read-out (fps, simulation ms, birds, phase)
//   ?start=1      skip the title
//   ?auto=1       the autopilot plays (with ?start=1: a whole evening unattended)
//   ?fast=N       N simulation steps a frame
//   ?q=N          start the evening at its Nth question (0-9), with a flock to match
//   ?miss=N       the autopilot answers wrong N times before it answers right (to see the hint ladder)
//   ?tod=0.62     hold the sky at a time of day (title only: for looking at light)
//   ?birds=N  ?seed=N  ?dpr=N  ?mute=1  ?lan=hi
// window.__mm.dev.state() returns what a test needs to know.
// ---------------------------------------------------------------------------
import { param } from '../engine/util.js';

export class Dev {
  constructor(G) {
    this.G = G; this.el = document.getElementById('dev'); this.on = param('dev') === '1'; this.n = 0;
    this.tod = param('tod') != null ? +param('tod') : null;
    if (this.on) this.el.hidden = false;
  }
  boot() { if (param('start') === '1') this.G.flow.begin(); }
  state() {
    const G = this.G, f = G.world.flock, fl = G.flow, p = f.player, q = fl.plan[fl.qi];
    return { phase: fl.phase, qi: fl.qi, type: q ? q.type : null, tod: +G.world.tod.toFixed(3), flock: p.n + (fl.scouts && fl.scouts.active ? fl.scouts.n : 0) - f.home, flying: p.fly, home: f.home,
      active: f.active, total: fl.total, asked: fl.asked, first: fl.firstTry, falcon: G.world.falcon.state, fps: Math.round(G.fps), ms: +G.ms.toFixed(2), result: fl.result || null,
      dock: !document.getElementById('dock').hidden && !G.dock.locked, audio: G.audio.ctx ? G.audio.ctx.state : 'none' };
  }
  frame() {
    const G = this.G, fl = G.flow;
    if (this.tod != null && fl.phase === 'title') G.world.setTod(this.tod);
    if (!this.on || (this.n++ & 7)) return;
    const s = this.state();
    this.el.textContent = `${s.fps} fps · sim ${s.ms} ms · ${s.active} birds\n${s.phase} q${s.qi} ${s.type || ''} tod=${s.tod}\nflock ${s.flock} home ${s.home}/${s.total} first ${s.first}/${s.asked}`;
  }
}
