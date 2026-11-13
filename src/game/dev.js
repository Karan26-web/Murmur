// ---------------------------------------------------------------------------
// Dev and QA switches (URL parameters), and the hooks the playtests read.
//   ?dev=1        a small read-out (fps, simulation ms, birds, phase)
//   ?start=1      skip the title
//   ?auto=1       the autopilot plays (with ?start=1: a whole evening unattended)
//   ?fast=N       N simulation steps a frame
//   ?at=120       jump the evening to this second once play starts
//   ?tod=0.62     hold the sky at a time of day (title only: for looking at light)
//   ?flock=N      start play with N extra birds already in the flock
//   ?birds=N  ?seed=N  ?dpr=N  ?mute=1  ?lan=hi  ?nofalcon=1  ?noflare=1
// window.__mm.dev.state() returns what a test needs to know.
// ---------------------------------------------------------------------------
import { param } from '../engine/util.js';

export class Dev {
  constructor(G) {
    this.G = G; this.el = document.getElementById('dev'); this.on = param('dev') === '1'; this.n = 0;
    this.tod = param('tod') != null ? +param('tod') : null;
    this.at = param('at') != null ? +param('at') : null;
    this.extra = +param('flock', 0);
    if (this.on) this.el.hidden = false;
  }
  boot() { if (param('start') === '1') this.G.flow.begin(); }
  state() {
    const G = this.G, f = G.world.flock, fl = G.flow, p = f.player;
    return { phase: fl.phase, t: +fl.t.toFixed(2), tod: +G.world.tod.toFixed(3), flock: p.n - f.home, flying: p.fly, home: f.home, active: f.active, total: fl.total,
      wisps: fl.wisps.length, falcon: G.world.falcon.state, fps: Math.round(G.fps), ms: +G.ms.toFixed(2), radius: +p.r.toFixed(1), stats: fl.stats, result: fl.result || null,
      audio: G.audio.ctx ? G.audio.ctx.state : 'none' };
  }
  frame() {
    const G = this.G, fl = G.flow;
    if (this.tod != null && fl.phase === 'title') G.world.setTod(this.tod);
    if (this.extra && fl.phase === 'play') { const f = G.world.flock; f.spawn(f.player, this.extra, G.world.lure.pos, 45); this.extra = 0; }
    if (this.at != null && fl.phase === 'play') { fl.t = this.at; fl.schedule = fl.schedule.filter((e) => e.t >= this.at); this.at = null; }
    if (!this.on || (this.n++ & 7)) return;
    const s = this.state();
    this.el.textContent = `${s.fps} fps · sim ${s.ms} ms · ${s.active} birds\n${s.phase} t=${s.t} tod=${s.tod}\nflock ${s.flock} (r ${s.radius}) home ${s.home}/${s.total} wisps ${s.wisps} falcon ${s.falcon}`;
  }
}
