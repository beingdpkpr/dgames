// Headless behaviour tests for Dusk Protocol. Lifts the SIM section out of index.html by its two
// markers, runs it in node's vm, and checks what the guards and the mission actually do: how fast a
// guard spots you, that cover and darkness work, that guards miss more at range, that the alarm stays
// inside its radius, that a headshot beats a body shot, that the objective and extraction finish the
// mission, and that sneaking survives more often than rushing. Run: node test/sim.js
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const a = html.indexOf('// ---------- SIM ----------'), b = html.indexOf('// ---------- UI ----------');
if (a < 0 || b < a) throw new Error('SIM / UI markers not found');
const src = html.slice(a, b) + '\nglobalThis.__sim = { createState, step, buildLevel, emptyLevel, finishLevel, addBox, findPath, guardSees, detectRate,'
  + ' segBlocked, aimAssistTarget, alertGuard, guardFire, playerFire, guardParts, damageGuard, lightAt, mulberry32, awareness, HACK_TIME, ALARM_R };';
const ctx = { Math, console, Array, Object, Number, Infinity, Float32Array, Int32Array, Uint8Array, Uint32Array, JSON, Error };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const T = ctx.__sim;

let failures = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) failures++; };
const DT = 1 / 60;
const yawTo = (dx, dz) => Math.atan2(-dx, -dz);

// An open field (nothing but ground) with optional extra boxes, one guard, and the player placed.
function field(boxes, guard, player, ambient = 0.18) {
  const L = T.emptyLevel();
  L.ambient = ambient;
  for (const bx of boxes || []) T.addBox(L, ...bx);
  L.terminal = { x: 100, z: 100 }; L.extraction = { x: -100, z: -100, r: 3 };
  T.finishLevel(L);
  const S = T.createState(1, { level: L, guards: [guard], start: player });
  return S;
}
// Frames until the guard alerts while the player holds `inp`, or Infinity within `maxS` seconds.
function framesToAlert(S, inp, maxS) {
  for (let f = 1; f <= maxS * 60; f++) {
    T.step(S, { yaw: S.player.yaw, pitch: 0, ...inp }, DT);
    if (S.guards[0].state === 'alert') return f;
  }
  return Infinity;
}
// The guard faces +z (south) from the origin and holds still, so every case is the same stare.
const starer = { x: 0, z: 0, yaw: Math.PI, post: true, scan: 0 };

// ---- 1. seeing ----
{
  // walking back and forth across his view at 20 m (strafing keeps the distance)
  const S = field([], starer, { x: 0, z: 20, yaw: 0 });
  let dir = 1, f;
  for (f = 1; f <= 600; f++) {
    if (f % 90 === 0) dir = -dir;
    T.step(S, { yaw: 0, pitch: 0, mx: dir }, DT);
    if (S.guards[0].state === 'alert') break;
  }
  ok(f <= 180, `standing, walking, in the open at 20 m: spotted in ${f} frames (${(f / 60).toFixed(2)} s; limit 180)`);
  const s2 = field([], starer, { x: 0, z: 10, yaw: 0 });
  const f10 = framesToAlert(s2, { mx: 0 }, 10);
  const s3 = field([], starer, { x: 0, z: 30, yaw: 0 });
  const f30 = framesToAlert(s3, { mx: 0 }, 30);
  ok(f10 < f30, `standing still: 10 m spotted in ${(f10 / 60).toFixed(1)} s, 30 m in ${(f30 / 60).toFixed(1)} s (nearer is faster)`);
  const s4 = field([], starer, { x: 0, z: 50, yaw: 0 });
  ok(framesToAlert(s4, { mx: 0 }, 20) === Infinity, 'beyond his 44 m range he never spots you (20 s)');
  const s5 = field([], { ...starer, yaw: 0 }, { x: 0, z: 20, yaw: 0 });
  ok(framesToAlert(s5, { mx: 0 }, 20) === Infinity, 'behind his back at 20 m (outside the 120-degree cone): never spotted (20 s)');
}
// ---- 2. cover and darkness ----
{
  // a crate 1.2 m tall halfway between: standing is seen over it, crouched is not
  const crate = ['crate', 0, 19, 1.4, 1.2, 0, 1.2];
  const s1 = field([crate], starer, { x: 0, z: 20, yaw: 0 });
  const seenOver = T.guardSees(s1.level, s1.guards[0], s1.player) >= 0;
  s1.player.crouch = true; s1.player.eye = 1.0;
  const hidden = T.guardSees(s1.level, s1.guards[0], s1.player) < 0;
  ok(seenOver && hidden, `a 1.2 m crate 1 m in front of you at 20 m: standing player seen over it (${seenOver}), crouched player hidden (${hidden})`);
  const s2 = field([crate], starer, { x: 0, z: 20, yaw: 0 });
  ok(framesToAlert(s2, { crouch: true }, 30) === Infinity && s2.guards[0].sus === 0, 'crouched behind that crate at 20 m: no suspicion at all in 30 s');
  // a wall blocks, the chain-link fence does not
  const wall = field([['wall', 0, 10, 4, 0.3, 0, 3]], starer, { x: 0, z: 20, yaw: 0 });
  const fence = field([['fence', 0, 10, 4, 0.1, 0, 2.6]], starer, { x: 0, z: 20, yaw: 0 });
  ok(T.guardSees(wall.level, wall.guards[0], wall.player) < 0 && T.guardSees(fence.level, fence.guards[0], fence.player) >= 0,
    'a wall blocks his sight; chain-link fence does not');
  // crouched, still, in the open, in the dark at 25 m: slow enough to be a choice, not a death sentence
  const s3 = field([], starer, { x: 0, z: 25, yaw: 0 });
  const fDark = framesToAlert(s3, { crouch: true }, 12);
  ok(fDark === Infinity, `crouched and still in the dark at 25 m, in plain view: not spotted within 12 s (suspicion ${s3.guards[0].sus.toFixed(2)})`);
  // same spot under a lamp, standing still: spotted, and faster than in the dark
  const lit = field([], starer, { x: 0, z: 25, yaw: 0 });
  lit.level.lamps.push({ x: 0, z: 25, r: 12, i: 0.85 });
  const dark = field([], starer, { x: 0, z: 25, yaw: 0 });
  const fl = framesToAlert(lit, {}, 30), fd = framesToAlert(dark, {}, 30);
  ok(fl < fd, `standing still at 25 m: under a lamp spotted in ${(fl / 60).toFixed(1)} s, in the dark ${(fd / 60).toFixed(1)} s`);
  // sprinting is conspicuous
  const run = field([], starer, { x: -8, z: 20, yaw: -Math.PI / 2 });
  const walk = field([], starer, { x: -8, z: 20, yaw: -Math.PI / 2 });
  const fr = framesToAlert(run, { mz: 1, sprint: true }, 5), fw = framesToAlert(walk, { mz: 1 }, 5);
  ok(fr < fw, `crossing his view at 20 m: sprinting spotted in ${(fr / 60).toFixed(2)} s, walking ${(fw / 60).toFixed(2)} s`);
}
// ---- 3. guard accuracy ----
{
  function hitRate(dist, moving) {
    let hits = 0;
    const N = 600;
    for (let i = 0; i < N; i++) {
      const S = field([], { ...starer, post: true }, { x: 0, z: dist, yaw: 0 });
      S.rng = T.mulberry32(1000 + i);
      const g = S.guards[0]; g.state = 'alert'; g.seeT = 5;
      if (moving) { S.player.vx = 4; S.player.vz = 0; }
      const hp = S.player.hp;
      T.guardFire(S, g);
      if (S.player.hp < hp) hits++;
    }
    return hits / N;
  }
  const r10 = hitRate(10, false), r25 = hitRate(25, false), r45 = hitRate(45, false), m25 = hitRate(25, true);
  ok(r10 > r25 && r25 > r45, `settled guard hit rate per round: 10 m ${(r10 * 100).toFixed(0)}%, 25 m ${(r25 * 100).toFixed(0)}%, 45 m ${(r45 * 100).toFixed(0)}%`);
  ok(m25 < r25 * 0.75, `at 25 m a walking target is hit ${(m25 * 100).toFixed(0)}% vs ${(r25 * 100).toFixed(0)}% standing`);
}
// ---- 4. alarm radius ----
{
  const L = T.emptyLevel(); L.terminal = { x: 100, z: 100 }; L.extraction = { x: -100, z: -100, r: 3 }; T.finishLevel(L);
  const defs = [{ x: 0, z: 0, post: true }, { x: 15, z: 0, post: true }, { x: 0, z: -27, post: true }, { x: 29, z: 0, post: true }, { x: -40, z: 10, post: true }];
  const S = T.createState(1, { level: L, guards: defs, start: { x: 0, z: 30 } });
  T.alertGuard(S, S.guards[0], true);
  const st = S.guards.map((g) => g.state);
  ok(st[1] === 'alert' && st[2] === 'alert' && st[3] !== 'alert' && st[4] !== 'alert',
    `shout from guard 0 (radius ${T.ALARM_R} m): 15 m ${st[1]}, 27 m ${st[2]}, 29 m ${st[3]}, 41 m ${st[4]}`);
  ok(S.mission.alarm && S.mission.spotted === 1, 'the shout raises the alarm and counts one spotting, not one per guard');
}
// ---- 5. damage ----
{
  const parts = T.guardParts({ x: 0, z: 0, y: 0, crouch: false });
  const head = parts.find((p) => p.part === 'head'), body = parts.find((p) => p.part === 'body');
  ok(head.dmg > body.dmg && head.dmg >= 100, `headshot ${head.dmg} vs body ${body.dmg} (one head kills; body takes ${Math.ceil(100 / body.dmg)})`);
  // fired for real through playerFire from 12 m, scoped and still (spread 0.0015 rad = 1.8 cm)
  function shootAt(y) {
    const S = field([], { x: 0, z: 0, yaw: 0, post: true }, { x: 0, z: 12, yaw: 0 });
    const p = S.player; p.scope = true;
    p.pitch = Math.atan2(y - p.eye, 12);
    T.playerFire(S);
    return S.guards[0];
  }
  const h = shootAt(1.72), bd = shootAt(1.25);
  ok(h.state === 'dead' && bd.hp === 60 && bd.state === 'alert', `scoped at 12 m: head shot -> ${h.state}; chest shot -> hp ${bd.hp}, ${bd.state}`);
  // a gunshot is heard: an unaware guard 30 m away goes to search near the shot
  const S = field([], { x: 30, z: 12, yaw: 0, route: [[30, 12], [30, 0]] }, { x: 0, z: 12, yaw: 0 });
  T.playerFire(S);
  const g = S.guards[0];
  ok(g.state === 'search' && Math.hypot(g.searchTarget.x, g.searchTarget.z - 12) < 12, `a shot heard at 30 m: guard ${g.state === 'search' ? 'searches' : g.state} about ${Math.hypot(g.searchTarget.x, g.searchTarget.z - 12).toFixed(1)} m from the shooter`);
}
// ---- 6. losing you and searching ----
{
  const S = field([['wall', -6, 12, 12, 0.3, 0, 3]], { x: 0, z: 0, yaw: Math.PI, route: [[0, 0], [0, -5]] }, { x: 0, z: 8, yaw: 0 });
  const g = S.guards[0];
  T.alertGuard(S, g, true);
  // step out of sight behind the wall's west end and stay there
  S.player.x = -9; S.player.z = 16; S.player.crouch = true;
  let searched = false, target = null;
  for (let i = 0; i < 60 * 12; i++) { T.step(S, { crouch: true, yaw: 0 }, DT); if (g.state === 'search') { searched = true; target = g.searchTarget; break; } if (g.state !== 'alert') break; }
  ok(searched && Math.hypot(target.x - 0, target.z - 8) < 1, `out of sight for 6 s the guard goes to search your last known spot (${searched ? target.x.toFixed(1) + ',' + target.z.toFixed(1) : 'no search'})`);
}
// ---- 7. the mission ----
function follow(S, mem, tx, tz, extra) {
  const p = S.player;
  if (!mem.path || mem.to !== tx + ',' + tz) { mem.path = T.findPath(S.level, p.x, p.z, tx, tz); mem.i = 0; mem.to = tx + ',' + tz; }
  let wp = mem.path && mem.path[mem.i];
  while (wp && Math.hypot(wp.x - p.x, wp.z - p.z) < 0.6) { mem.i++; wp = mem.path[mem.i]; }
  if (!wp) return { yaw: p.yaw, pitch: 0, ...extra };
  return { yaw: yawTo(wp.x - p.x, wp.z - p.z), pitch: 0, mz: 1, ...extra };
}
{
  const S = T.createState(3, { guards: [] });
  const L = S.level, mem = {};
  let t = 0;
  while (Math.hypot(S.player.x - L.terminal.x, S.player.z - L.terminal.z) > 1.0 && t++ < 60 * 90) T.step(S, follow(S, mem, L.terminal.x, L.terminal.z), DT);
  ok(Math.hypot(S.player.x - L.terminal.x, S.player.z - L.terminal.z) <= 1.0, `the terminal is reachable on foot from the start (through the cut in the wire): ${(t / 60).toFixed(1)} s`);
  for (let i = 0; i < 150; i++) T.step(S, { yaw: 0, interact: true }, DT);       // 2.5 s, then let go
  T.step(S, { yaw: 0 }, DT);
  ok(S.mission.phase === 'infiltrate' && S.mission.hackT === 0, 'letting go of the terminal at 2.5 s loses the upload');
  let n = 0;
  while (S.mission.phase === 'infiltrate' && n++ < 400) T.step(S, { yaw: 0, interact: true }, DT);
  ok(S.mission.phase === 'extract' && Math.abs(n / 60 - T.HACK_TIME) < 0.05, `holding interact uploads in ${(n / 60).toFixed(2)} s, then the objective is extraction`);
  const m2 = {};
  t = 0;
  while (S.mission.phase === 'extract' && t++ < 60 * 120) T.step(S, follow(S, m2, L.extraction.x, L.extraction.z), DT);
  ok(S.mission.phase === 'done', `reaching the landing zone completes the mission (${(S.mission.time).toFixed(0)} s total)`);
  const S2 = T.createState(3, { guards: [] });
  const m3 = {};
  for (let i = 0; i < 60 * 150 && S2.mission.phase === 'infiltrate'; i++) T.step(S2, follow(S2, m3, L.extraction.x, L.extraction.z), DT);
  ok(S2.mission.phase === 'infiltrate', 'walking to the landing zone without the upload does not end the mission');
}
// ---- 8. rushing vs sneaking, the whole garrison, many seeds ----
// Two scripted players on the real level. Both take the shortest path to the terminal and then to the
// landing zone, and both shoot back at any guard they can see once they have been spotted.
//   rush:  sprints, and opens fire on any guard in view from the start (aim error 0.03 rad).
//   sneak: crouch-walks, holds still while any guard is looking his way, and backs off along his own
//          trail while a suspicious guard is coming to look.
function bot(seed, style) {
  const S = T.createState(seed);
  const L = S.level, p = S.player, mem = {}, rng = T.mulberry32(seed * 7 + 1);
  const gauss = () => (rng() + rng() + rng() - 1.5) * 2;
  const trail = [];
  const dt = 1 / 30;
  for (let i = 0; i < 30 * 240; i++) {
    const M = S.mission;
    if (M.phase === 'done' || M.phase === 'failed') break;
    const alarmed = S.guards.some((g) => g.state === 'alert');
    // nearest living guard the player can see
    let tgt = null, td = 1e9;
    for (const g of S.guards) {
      if (g.state === 'dead') continue;
      const d = Math.hypot(g.x - p.x, g.z - p.z);
      if (d > 50 || d > td) continue;
      if (T.segBlocked(L.sightBoxes, p.x, p.eye, p.z, g.x, g.y + 1.3, g.z)) continue;
      tgt = g; td = d;
    }
    const near = M.phase === 'infiltrate' && Math.hypot(p.x - L.terminal.x, p.z - L.terminal.z) < 1.0;
    const dest = M.phase === 'infiltrate' ? L.terminal : L.extraction;
    let inp;
    if (near) inp = { yaw: p.yaw, interact: true, crouch: style === 'sneak' };
    else inp = follow(S, mem, dest.x, dest.z, { crouch: style === 'sneak', sprint: style === 'rush' && !tgt });
    const shoot = tgt && (style === 'rush' || alarmed);
    if (shoot) {
      inp.yaw = yawTo(tgt.x - p.x, tgt.z - p.z) + gauss() * 0.03;
      inp.pitch = Math.atan2(tgt.y + 1.3 - p.eye, td) + gauss() * 0.03;
      inp.fire = true; inp.sprint = false; inp.mz = inp.mz ? 0.6 : 0;
    }
    // A careful player watches before moving: hold still while any guard is looking his way, and if
    // one is coming to check, back off along the trail he came in by.
    if (style === 'sneak' && !alarmed && !near) {
      // watched: a guard with eyes on him who would gain suspicion if he kept crouch-walking
      // (checked where he is and 1.5 m further along, which is a player looking before he steps out)
      const ahead = { ...p, vx: 1.9, vz: 0, crouch: true, eye: 1.0, x: p.x - Math.sin(inp.yaw) * 1.5, z: p.z - Math.cos(inp.yaw) * 1.5 };
      const here = { ...p, vx: 1.9, vz: 0 };
      const watched = S.guards.some((g) => { if (g.state === 'dead') return false; return [here, ahead].some((q) => { const d = T.guardSees(L, g, q); return d >= 0 && T.detectRate(L, g, q, d) > 0; }); });
      const coming = S.guards.some((g) => (g.state === 'search' || g.state === 'suspicious') && Math.hypot(g.x - p.x, g.z - p.z) < 18 && T.guardSees(L, g, p) >= 0);
      if (coming && trail.length) { const q = trail[trail.length - 1]; if (Math.hypot(q.x - p.x, q.z - p.z) < 0.5) trail.pop(); inp.yaw = yawTo(q.x - p.x, q.z - p.z); inp.mz = 1; inp.fire = false; mem.path = null; }
      else if (watched) { inp.mz = 0; inp.mx = 0; }
      else if (!trail.length || Math.hypot(trail[trail.length - 1].x - p.x, trail[trail.length - 1].z - p.z) > 2) trail.push({ x: p.x, z: p.z });
    }
    T.step(S, inp, dt);
  }
  return S.mission;
}
{
  const N = 16;
  const res = { rush: { dead: 0, won: 0, spotted: 0 }, sneak: { dead: 0, won: 0, spotted: 0 } };
  for (const style of ['rush', 'sneak']) for (let s = 1; s <= N; s++) {
    const M = bot(s, style);
    if (M.phase === 'failed') res[style].dead++;
    if (M.phase === 'done') res[style].won++;
    res[style].spotted += M.spotted;
  }
  const r = res.rush, k = res.sneak;
  console.log(`     rush:  died ${r.dead}/${N}, completed ${r.won}/${N}, spotted ${(r.spotted / N).toFixed(1)} times a run`);
  console.log(`     sneak: died ${k.dead}/${N}, completed ${k.won}/${N}, spotted ${(k.spotted / N).toFixed(1)} times a run`);
  ok(r.dead > k.dead, `rushing in shooting dies more often than sneaking (${r.dead} vs ${k.dead} of ${N})`);
  ok(k.spotted < r.spotted, 'sneaking gets spotted less often than rushing');
}
// ---- 9. determinism ----
{
  const run = () => { const M = bot(5, 'rush'); return [M.phase, M.time.toFixed(4), M.kills, M.shots].join(' '); };
  const x = run(), y = run();
  ok(x === y, `same seed, same run: "${x}"`);
}

// ---- interiors are dark for the guards, not just on screen ----
{
  const L = T.buildLevel();
  // Compared with the same spot unroofed, not with some yard point: a spot outside may simply be unlit.
  const open = Object.assign({}, L, { buildings: [] });
  for (const B of L.buildings) {
    const inside = T.lightAt(L, B.cx, B.cz), bare = T.lightAt(open, B.cx, B.cz);
    ok(inside <= bare * 0.6, `${B.name}: light in the room ${inside.toFixed(2)} vs the same spot unroofed ${bare.toFixed(2)}`);
  }
}

// ---- aim assist (phones) only ever finds a guard the player can really see ----
{
  const look = (x, z) => ({ x: 0, z: 0, yaw: yawTo(x, z) });
  const guard = { x: 0, z: -20, yaw: 0, route: [] };
  const S1 = field([], guard, { x: 0, z: 0, yaw: 0 });
  const t1 = T.aimAssistTarget(S1, 0.05, 0, 0.09, false);
  ok(!!t1 && Math.abs(t1.dyaw + 0.05) < 0.02, `guard in plain view, 3 degrees off the crosshair: found, pull points back at him (${t1 && t1.dyaw.toFixed(3)})`);
  ok(!T.aimAssistTarget(S1, 0.2, 0, 0.09, false), 'the same guard 11 degrees off: outside the cone, ignored');
  const S2 = field([['crate', 0, -10, 2, 1, 0, 2.4]], guard, { x: 0, z: 0, yaw: 0 });
  ok(!T.aimAssistTarget(S2, 0, 0, 0.09, false), 'a crate between you and him: no assist through it');
  S1.guards[0].state = 'dead';
  ok(!T.aimAssistTarget(S1, 0, 0, 0.09, false), 'a dead guard is never a target');
  S1.guards[0].state = 'patrol';
  const th = T.aimAssistTarget(S1, 0, 0, 0.09, true), tb = T.aimAssistTarget(S1, 0, 0, 0.09, false);
  ok(th && tb && th.dpitch > tb.dpitch, 'scoped it aims at the head, above the chest');
}

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
