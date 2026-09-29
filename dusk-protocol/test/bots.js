// Report, not a test: the "rush vs sneak" scripted players of test/sim.js, run on every mission against
// the real garrison. Asserts nothing and always exits 0 (listed under dgames.reportOnly in package.json);
// it prints how often each style dies, completes, and is spotted, for a human to read when tuning.
// Run: node test/bots.js [seeds per style, default 8]
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const a = html.indexOf('// ---------- SIM ----------'), b = html.indexOf('// ---------- UI ----------');
const src = html.slice(a, b) + '\nglobalThis.__sim = { createState, step, buildMission, MISSIONS, findPath, segBlocked, guardSees, detectRate, objectivePos, currentObjective, guardParts, mulberry32 };';
const ctx = { Math, console, Array, Object, Number, Infinity, Float32Array, Int32Array, Uint8Array, Uint32Array, JSON, Error, Set };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const T = ctx.__sim;
const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
const N = Number(process.argv[2]) || 8;

function follow(S, mem, tx, tz, extra) {
  const p = S.player;
  if (!mem.path || Math.hypot(mem.tx - tx, mem.tz - tz) > 1) { mem.path = T.findPath(S.level, p.x, p.z, tx, tz) || []; mem.i = 0; mem.tx = tx; mem.tz = tz; }
  let wp = mem.path[mem.i];
  while (wp && Math.hypot(wp.x - p.x, wp.z - p.z) < 0.6) { mem.i++; wp = mem.path[mem.i]; }
  if (!wp) return { yaw: yawTo(tx - p.x, tz - p.z), pitch: 0, mz: 1, ...extra };
  return { yaw: yawTo(wp.x - p.x, wp.z - p.z), pitch: 0, mz: 1, ...extra };
}
// As in test/sim.js: rush sprints and shoots whatever it sees; sneak crouch-walks, freezes while watched,
// backs off along its trail from a guard coming to look, and only fights once the alarm is up. Both go
// straight for the current objective; a named target is shot on sight from under 40 m (scoped).
function bot(m, seed, style) {
  const L = T.buildMission(m);
  const S = T.createState(seed, { level: L });
  const p = S.player, rng = T.mulberry32(seed * 7 + 1), gauss = () => (rng() + rng() + rng() - 1.5) * 2, trail = [];
  let mem = {}, last = -1;
  const dt = 1 / 30;
  for (let i = 0; i < 30 * 300; i++) {
    const M = S.mission;
    if (M.phase === 'done' || M.phase === 'failed') break;
    const o = T.currentObjective(S);
    if (M.obj !== last) { last = M.obj; mem = {}; }
    const q = T.objectivePos(S, o);
    const alarmed = S.guards.some((g) => g.state === 'alert');
    let tgt = null, td = 1e9;
    for (const g of S.guards) {
      if (g.state === 'dead') continue;
      const d = Math.hypot(g.x - p.x, g.z - p.z);
      if (d > 50 || d > td) continue;
      if (T.segBlocked(L.sightBoxes, p.x, p.eye, p.z, g.x, g.y + 1.3, g.z)) continue;
      tgt = g; td = d;
    }
    const door = L.doors.find((d) => !d.open && M.keys.includes(d.id));
    const holdable = o.type !== 'extract' && o.type !== 'eliminate';
    const near = holdable && !door && Math.hypot(p.x - q.x, p.z - q.z) < (o.r || 1.7) * 0.6;
    let inp;
    if (near) inp = { yaw: p.yaw, interact: true, crouch: style === 'sneak' };
    else if (door) inp = follow(S, mem, door.x + 1.2, door.z, { crouch: style === 'sneak' });
    else inp = follow(S, mem, q.x, q.z, { crouch: style === 'sneak', sprint: style === 'rush' && !tgt });
    const target = o.type === 'eliminate' ? S.guards[o.gi] : null;
    const onTarget = target && target.state !== 'dead' && tgt && (tgt === target || Math.hypot(target.x - p.x, target.z - p.z) < 40
      && !T.segBlocked(L.sightBoxes, p.x, p.eye, p.z, target.x, target.y + 1.6, target.z));
    const shootAt = onTarget ? target : tgt && (style === 'rush' || alarmed) ? tgt : null;
    if (shootAt) {
      const d = Math.hypot(shootAt.x - p.x, shootAt.z - p.z), hy = shootAt === target ? 1.7 : 1.3;
      inp.yaw = yawTo(shootAt.x - p.x, shootAt.z - p.z) + gauss() * (shootAt === target ? 0.004 : 0.03);
      inp.pitch = Math.atan2(shootAt.y + hy - p.eye, d) + gauss() * (shootAt === target ? 0.004 : 0.03);
      inp.scope = shootAt === target; inp.fire = !inp.scope || p.scope; inp.sprint = false; inp.mz = inp.scope ? 0 : inp.mz ? 0.6 : 0;
    }
    if (style === 'sneak' && !alarmed && !near && !shootAt) {
      const ahead = { ...p, vx: 1.9, vz: 0, crouch: true, eye: 1.0, x: p.x - Math.sin(inp.yaw) * 1.5, z: p.z - Math.cos(inp.yaw) * 1.5 };
      const here = { ...p, vx: 1.9, vz: 0 };
      const watched = S.guards.some((g) => g.state !== 'dead' && [here, ahead].some((r) => { const d = T.guardSees(L, g, r); return d >= 0 && T.detectRate(L, g, r, d) > 0; }));
      const coming = S.guards.some((g) => (g.state === 'search' || g.state === 'suspicious') && Math.hypot(g.x - p.x, g.z - p.z) < 18 && T.guardSees(L, g, p) >= 0);
      if (coming && trail.length) { const r = trail[trail.length - 1]; if (Math.hypot(r.x - p.x, r.z - p.z) < 0.5) trail.pop(); inp.yaw = yawTo(r.x - p.x, r.z - p.z); inp.mz = 1; mem.path = null; }
      else if (watched) { inp.mz = 0; inp.mx = 0; }
      else if (!trail.length || Math.hypot(trail[trail.length - 1].x - p.x, trail[trail.length - 1].z - p.z) > 2) trail.push({ x: p.x, z: p.z });
    }
    T.step(S, inp, dt);
  }
  return S.mission;
}
for (const m of T.MISSIONS) {
  const out = [];
  for (const style of ['rush', 'sneak']) {
    let dead = 0, won = 0, spotted = 0, objs = 0, time = 0, late = 0;
    for (let s = 1; s <= N; s++) {
      const M = bot(m, s, style);
      if (M.phase === 'failed') { dead++; if (M.failReason === 'time') late++; }
      if (M.phase === 'done') { won++; time += M.time; }
      spotted += M.spotted; objs += Math.min(M.obj, M.objs.length);
    }
    out.push(`${style}: failed ${dead}/${N}${late ? ' (' + late + ' on time)' : ''}, completed ${won}/${N}${won ? ' in ' + (time / won).toFixed(0) + ' s' : ''}, objectives ${(objs / N).toFixed(1)}/${m.objectives.length}, spotted ${(spotted / N).toFixed(1)}/run`);
  }
  console.log(`${m.code} ${m.name.padEnd(12)} ${out.join(' | ')}`);
}
