// Every mission must be completable, and only in order. Lifts the SIM section out of index.html (as
// sim.js does) and, for each mission: (a) proves every objective and the landing zone are reachable on the
// nav grid from the start, (b) walks a scripted player through the chain and checks the mission ends
// 'done', (c) checks that no objective can be done before its turn. Then the pieces the new objective
// types rely on: charges and their blast, the extraction deadline, identifying a target through the
// scope, a keycard door, and a captive who keeps up. This is logic, not stealth: the scripted runs have
// the garrison removed (or cannot die). Run: node test/missions.js
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const a = html.indexOf('// ---------- SIM ----------'), b = html.indexOf('// ---------- UI ----------');
if (a < 0 || b < a) throw new Error('SIM / UI markers not found');
const src = html.slice(a, b) + '\nglobalThis.__sim = { createState, step, buildMission, buildLevel, MISSIONS, findPath, setDoor, objectivePos,'
  + ' currentObjective, guardParts, segBlocked, lightAt, detectRate, guardSees, mulberry32, navBlockedAt, visibility, BLAST_R };';
const ctx = { Math, console, Array, Object, Number, Infinity, Float32Array, Int32Array, Uint8Array, Uint32Array, JSON, Error, Set };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const T = ctx.__sim;

let failures = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) failures++; };
const DT = 1 / 30;
const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
const dist = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);

ok(T.MISSIONS.length >= 4, `${T.MISSIONS.length} missions: ${T.MISSIONS.map((m) => m.code + ' ' + m.name).join(', ')}`);
ok(new Set(T.MISSIONS.map((m) => m.id)).size === T.MISSIONS.length, 'mission ids are unique');

// Walk toward (tx, tz) along a nav path, repathing when the target moves more than a metre.
function follow(S, mem, tx, tz, extra) {
  const p = S.player;
  if (!mem.path || Math.hypot(mem.tx - tx, mem.tz - tz) > 1) { mem.path = T.findPath(S.level, p.x, p.z, tx, tz) || []; mem.i = 0; mem.tx = tx; mem.tz = tz; }
  let wp = mem.path && mem.path[mem.i];
  while (wp && Math.hypot(wp.x - p.x, wp.z - p.z) < 0.6) { mem.i++; wp = mem.path[mem.i]; }
  if (!wp) return { yaw: yawTo(tx - p.x, tz - p.z), pitch: 0, mz: Math.hypot(tx - p.x, tz - p.z) > 0.3 ? 1 : 0, ...extra };
  return { yaw: yawTo(wp.x - p.x, wp.z - p.z), pitch: 0, mz: 1, ...extra };
}
// The guards an objective names (the target, the body to search): kept in the scripted runs, the rest go.
function namedGuards(L) {
  const names = new Set(L.objectives.map((o) => o.target || o.from).filter(Boolean));
  return L.guards.filter((g) => names.has(g.name));
}
// Play the chain in order: walk to each objective, hold interact at it, shoot a named target from close
// range through the scope, wait at the LZ for any live charge. Returns the state and a log of objectives.
function playChain(m, seed = 7) {
  const L = T.buildMission(m);
  const S = T.createState(seed, { level: L, guards: namedGuards(L) });
  S.player.hp = 1e9;                                  // the objective logic is under test, not the gunfight
  const log = [];
  let mem = {}, last = -1;
  for (let i = 0; i < 30 * 600; i++) {
    const M = S.mission;
    if (M.phase === 'done' || M.phase === 'failed') break;
    const o = T.currentObjective(S);
    if (M.obj !== last) { last = M.obj; mem = {}; }
    const q = T.objectivePos(S, o), p = S.player;
    let inp;
    if (o.type === 'eliminate') {
      const g = S.guards[o.gi], d = dist(p, g);
      const head = T.guardParts(g)[0], hx = (head.x0 + head.x1) / 2, hy = (head.y0 + head.y1) / 2, hz = (head.z0 + head.z1) / 2;
      const clear = !T.segBlocked(L.sightBoxes, p.x, p.eye, p.z, hx, hy, hz);
      if (d < 14 && clear) {
        inp = { yaw: yawTo(hx - p.x, hz - p.z), pitch: Math.atan2(hy - p.eye, Math.hypot(hx - p.x, hz - p.z)), scope: true, fire: p.scope && (i % 4 === 0) };
      } else inp = follow(S, mem, g.x, g.z);
    } else if (o.type === 'extract') {
      inp = follow(S, mem, o.x, o.z);
      if (dist(p, o) < o.r * 0.5) inp.mz = 0;
    } else if (L.doors.some((d) => !d.open && M.keys.includes(d.id))) {
      const d = L.doors.find((q2) => !q2.open && M.keys.includes(q2.id));      // a locked door he has the card for: go to it
      inp = follow(S, mem, d.x + 1.2, d.z);
    } else {
      const near = dist(p, q) < (o.r || 1.7) * 0.6;
      inp = near ? { yaw: p.yaw, pitch: 0, interact: true } : follow(S, mem, q.x, q.z);
    }
    T.step(S, inp, DT);
    for (const e of S.events) if (e.type === 'objective') log.push(e.kind + '@' + S.t.toFixed(0) + 's');
  }
  return { S, log };
}

for (const m of T.MISSIONS) {
  console.log(`\n-- ${m.code} ${m.name} (${m.map}, ${m.preset})`);
  const L = T.buildMission(m);
  // (a) reachability from the start
  const st = L.start;
  ok(!T.navBlockedAt(L.nav, st.x, st.z), `start (${st.x}, ${st.z}) is on open ground`);
  for (const o of L.objectives) {
    let pts;
    if (o.target || o.from) {
      const g = L.guards.find((d) => d.name === (o.target || o.from));
      ok(!!g, `${o.type}: the named guard "${o.target || o.from}" is in the garrison`);
      pts = [[g.x, g.z]].concat(g.route || []);
    } else if (o.type === 'rescue') pts = [[L.captive.x, L.captive.z]];
    else pts = [[o.x, o.z]];
    for (const d of L.doors) T.setDoor(L, d.id, true);       // (doors: checked closed and open below)
    const bad = pts.filter(([x, z]) => { const path = T.findPath(L, st.x, st.z, x, z); if (!path) return true; const e = path[path.length - 1]; return Math.hypot(e.x - x, e.z - z) > Math.max(0.8, (o.r || 1.7) * 0.6); });
    for (const d of L.doors) T.setDoor(L, d.id, false);
    ok(!bad.length, `${o.type} ${o.label}: all ${pts.length} point(s) reachable from the start${bad.length ? ' -- not: ' + JSON.stringify(bad) : ''}`);
  }
  // (b) the chain, played in order, completes
  const t0 = Date.now();
  const { S, log } = playChain(m);
  ok(S.mission.phase === 'done', `scripted run completes: ${S.mission.phase} after ${S.mission.time.toFixed(0)} s [${log.join(' > ')}] (${Date.now() - t0} ms)`);
  ok(log.length === L.objectives.length, `every objective reported once, in order (${log.length}/${L.objectives.length})`);
  // (c) out of order: from a fresh start, stand at (or hold interact at) each later objective
  for (let k = 1; k < L.objectives.length; k++) {
    const o = L.objectives[k];
    const S2 = T.createState(3, { level: L, guards: namedGuards(L) });
    S2.player.hp = 1e9;
    for (const d of L.doors) T.setDoor(L, d.id, true);         // even with the door open, the pilot is not yet the objective
    const q = o.type === 'rescue' ? S2.captive : o.gi != null || o.from ? S2.guards.find((g) => g.name === o.from) : o;
    S2.player.x = q.x + 0.5; S2.player.z = q.z + 0.3;
    for (let i = 0; i < 30 * 8; i++) { S2.player.x = q.x + 0.5; S2.player.z = q.z + 0.3; T.step(S2, { yaw: 0, interact: true }, DT); }
    for (const d of L.doors) T.setDoor(L, d.id, false);
    ok(S2.mission.obj === 0 && S2.mission.phase !== 'done', `out of order: 8 s at ${o.type} ${o.label} before objective 1 is done -> still on objective ${S2.mission.obj + 1}, phase ${S2.mission.phase}`);
  }
}

// ---- charges: the blast, who hears it, the deadline ----
{
  const m = T.MISSIONS.find((q) => q.id === 'blackout');
  const L = T.buildMission(m);
  const o = L.objectives[0];
  const S = T.createState(11, { level: L });
  S.player.x = o.x; S.player.z = o.z + 0.4;
  let n = 0;
  while (S.mission.obj === 0 && n++ < 30 * 5) T.step(S, { yaw: 0, interact: true }, DT);
  ok(S.mission.obj === 1 && S.mission.charges.length === 1 && S.mission.deadline != null, `setting the mast charge takes ${(n / 30).toFixed(1)} s and starts the clock (${(S.mission.deadline - S.t).toFixed(0)} s)`);
  // stand 6 m off it and let it blow: hurt, not dead; the guards all go looking
  S.player.x = o.x + 6; S.player.z = o.z + 2;
  const hp = S.player.hp;
  let boom = false;
  for (let i = 0; i < 30 * 21 && !boom; i++) { S.player.x = o.x + 6; S.player.z = o.z + 2; T.step(S, { yaw: 0 }, DT); boom = S.events.some((e) => e.type === 'boom'); }
  const searching = S.guards.filter((g) => g.state === 'search' || g.state === 'dead').length;
  ok(boom && S.player.hp < hp && !S.player.dead, `the charge blows at 20 s; 6 m away you take ${Math.round(hp - S.player.hp)} damage and live`);
  ok(searching >= S.guards.length - 1, `the whole garrison hears it: ${searching}/${S.guards.length} guards searching (or dead)`);
  // the deadline: idle out the clock (the searchers removed, so it is the clock that ends it)
  for (const g of S.guards) { g.state = 'dead'; g.found = true; }
  for (let i = 0; i < 30 * 160 && S.mission.phase !== 'failed'; i++) T.step(S, { yaw: 0, crouch: true }, DT);
  ok(S.mission.phase === 'failed' && S.mission.failReason === 'time', `no extraction within the window: ${S.mission.phase} (${S.mission.failReason}) at ${S.mission.time.toFixed(0)} s`);
  // a guard standing on the charge dies with it
  const S2 = T.createState(12, { level: L, guards: [{ name: 'x', x: o.x + 1, z: o.z + 1, post: true, yaw: 0 }] });
  S2.mission.charges.push({ id: 'mast', x: o.x, z: o.z, t: 0.01, blown: false });
  S2.player.x = o.x + 30; S2.player.z = o.z + 20;
  T.step(S2, { yaw: 0 }, DT);
  ok(S2.guards[0].state === 'dead' && S2.mission.kills === 1, 'a guard 1.4 m from a charge is killed by it');
  // extraction waits for a live charge
  const S3 = T.createState(13, { level: L, guards: [] });
  S3.mission.obj = 2; S3.mission.phase = 'extract';
  S3.mission.charges.push({ id: 'generator', x: 21, z: 17, t: 3, blown: false });
  const e = L.objectives[2];
  S3.player.x = e.x; S3.player.z = e.z;
  T.step(S3, { yaw: 0 }, DT);
  const waiting = S3.mission.phase === 'extract';
  for (let i = 0; i < 30 * 4; i++) T.step(S3, { yaw: 0 }, DT);
  ok(waiting && S3.mission.phase === 'done', 'at the LZ with a charge still ticking, the mission waits for the bang, then ends');
}

// ---- identification through the scope ----
{
  const m = T.MISSIONS.find((q) => q.id === 'highground');
  const L = T.buildMission(m);
  const S = T.createState(21, { level: L, guards: namedGuards(L) });
  const g = S.guards[0];
  g.x = -16.5; g.z = -11; g.route = []; g.post = true;
  // 40 m west of him in the open, looking the other way, then at him unscoped, then scoped
  S.player.x = -56; S.player.z = -8;
  const aimY = yawTo(g.x - S.player.x, g.z - S.player.z), aimP = Math.atan2(g.y + 1.6 - 1.65, Math.hypot(g.x - S.player.x, g.z - S.player.z));
  const clear = !T.segBlocked(L.sightBoxes, S.player.x, 1.65, S.player.z, g.x, 1.6, g.z);
  T.step(S, { yaw: aimY + Math.PI, pitch: 0, scope: true }, DT);
  const a1 = S.mission.marked;
  T.step(S, { yaw: aimY, pitch: aimP, scope: false }, DT);
  const a2 = S.mission.marked;
  T.step(S, { yaw: aimY, pitch: aimP, scope: true }, DT);
  ok(clear && !a1 && !a2 && S.mission.marked, `Varga at ${dist(S.player, g).toFixed(0)} m: not marked looking away (${a1}) or unscoped (${a2}); marked once scoped on him (${S.mission.marked})`);
  const hint = T.objectivePos(T.createState(22, { level: L, guards: namedGuards(L) }), L.objectives[0]);
  ok(hint.x === 6 && hint.z === -22, 'before he is identified the objective points at HQ, where he was reported');
}

// ---- keycard door and the captive ----
{
  const m = T.MISSIONS.find((q) => q.id === 'nightingale');
  const L = T.buildMission(m);
  const S = T.createState(31, { level: L, guards: [] });
  const c = S.captive;
  ok(!T.findPath(L, S.player.x, S.player.z, c.x, c.z) || dist(T.findPath(L, S.player.x, S.player.z, c.x, c.z).slice(-1)[0], c) > 2,
    'the pilot cannot be reached while the detention block door is locked');
  // without the keycard, standing at the door does nothing
  S.player.x = -2.5; S.player.z = -36;
  for (let i = 0; i < 30; i++) T.step(S, { yaw: 0 }, DT);
  ok(!L.doors[0].open, 'without the keycard the door stays shut');
  // take the card, walk to the door: it opens and the pilot can be reached
  S.mission.keys.push('cells'); S.mission.obj = 1;
  for (let i = 0; i < 5; i++) T.step(S, { yaw: 0 }, DT);
  const path = T.findPath(L, 20, 0, c.x, c.z);
  ok(L.doors[0].open && path && dist(path[path.length - 1], c) < 1, 'with the keycard the door opens when you reach it, and the cell is on the nav grid');
  const S2 = T.createState(32, { level: L, guards: [] });
  ok(!L.doors[0].open, 'a new run (retry) starts with the door locked again');
  void S2;
  // The captive keeps up: freed, then the player jumps to 25 random reachable spots 12-30 m away; each
  // time the pilot must get within 3 m of him inside 20 s.
  const S3 = T.createState(33, { level: L, guards: [] });
  T.setDoor(L, 'cells', true);
  S3.mission.obj = 1; S3.captive.state = 'follow';
  const rng = T.mulberry32(99);
  let worst = 0, fails = 0;
  for (let k = 0; k < 25; k++) {
    let x, z, tries = 0;
    do { const ang = rng() * 6.283, r = 12 + rng() * 18; x = S3.captive.x + Math.cos(ang) * r; z = S3.captive.z + Math.sin(ang) * r; }
    while ((T.navBlockedAt(L.nav, x, z) || !T.findPath(L, S3.captive.x, S3.captive.z, x, z)) && tries++ < 50);
    S3.player.x = x; S3.player.z = z;
    let t = 0;
    while (dist(S3.captive, S3.player) > 3 && t < 20) { T.step(S3, { yaw: 0, sprint: false }, DT); t += DT; }
    if (t >= 20) fails++;
    worst = Math.max(worst, t);
  }
  ok(fails === 0, `the pilot caught up with 25 random jumps of 12-30 m, the slowest in ${worst.toFixed(1)} s (${fails} failed)`);
  // He is seen like you are: walking upright in a lamp's pool in front of a guard he raises suspicion.
  const S4 = T.createState(34, { level: L, guards: [{ name: 'w', x: 10, z: 1, post: true, yaw: 0, scan: 0 }] });
  S4.captive.state = 'follow'; S4.captive.x = 10; S4.captive.z = -12; S4.captive.crouch = false; S4.captive.eye = 1.65;
  S4.player.x = 60; S4.player.z = 44;
  for (let i = 0; i < 30; i++) { S4.captive.x = 10 + (i % 2) * 0.1; S4.captive.vx = 3; T.step(S4, { yaw: 0 }, DT); S4.captive.x = 10; S4.captive.z = -12; }
  ok(S4.guards[0].sus > 0, `a guard who sees the pilot gets suspicious (${S4.guards[0].sus.toFixed(2)} after 1 s)`);
}

// ---- lighting: the preset's ambient is what the guards see by ----
{
  const dusk = T.buildMission(T.MISSIONS[0]), night = T.buildMission(T.MISSIONS[1]), dawn = T.buildMission(T.MISSIONS[2]);
  const at = (L) => T.lightAt(L, 0, 22);          // the south yard, away from the lamps
  ok(at(night) < at(dusk) && at(dusk) < at(dawn), `unlit ground: night ${at(night).toFixed(2)} < dusk ${at(dusk).toFixed(2)} < dawn ${at(dawn).toFixed(2)}`);
  const p = { x: 0, z: 22, eye: 1.65, crouch: false, vx: 4, vz: 0 };
  ok(T.visibility(night, p) < T.visibility(dusk, p) * 0.85, `walking upright there: visibility at night ${T.visibility(night, p).toFixed(2)} vs dusk ${T.visibility(dusk, p).toFixed(2)}`);
}

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
