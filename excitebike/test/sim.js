// Headless check of the Excitebike engine (no browser). Loads the pure SIM section out of index.html with
// node's vm and drives the bike frame by frame. The engine takes `dt` and an input object and seeds its
// own track, so every scenario below is set up on demand rather than waited for.
//
// The last block is the one that matters most: a bot that holds turbo forever is raced against one that
// manages the gauge. If mindless turbo wins, the heat economy is not tuned and the game has no core loop.
// Run: node test/sim.js
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { Math, console, Array, Object, Number, String, Infinity, Map, Set, JSON, Date };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const E = ctx.__eb, C = E.C;

let failures = 0, checks = 0;
const assert = (ok, msg) => { checks++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const DT = 1 / 60;

// A game with an empty track, so a scenario is only what the test puts in it.
function bare(opts = {}) {
  const g = E.createGame({ mode: 'solo', seed: 1, ...opts });
  g.track = [];
  E.startGame(g);
  return g;
}
const run = (g, input, seconds) => { for (let t = 0; t < seconds; t += DT) E.step(g, input, DT); return g; };
const HOLD = { up: false, down: false, accel: true, turbo: false };
const TURBO = { up: false, down: false, accel: true, turbo: true };
const COAST = { up: false, down: false, accel: false, turbo: false };

// ---------- 1. the heat economy ----------
{
  const g = bare();
  run(g, TURBO, 1.0);
  assert(near(g.bike.heat, C.HEAT_RATE, 0.02), `turbo heats the engine (${g.bike.heat.toFixed(3)} after 1s, rate ${C.HEAT_RATE})`);

  const h0 = g.bike.heat;
  run(g, HOLD, 1.0);
  assert(near(g.bike.heat, h0 - C.COOL_RATE, 0.02), `releasing turbo cools it (${h0.toFixed(3)} -> ${g.bike.heat.toFixed(3)})`);
  assert(C.COOL_RATE < C.HEAT_RATE, `cooling is slower than heating (${C.COOL_RATE} < ${C.HEAT_RATE}), so you cannot idle out of trouble`);
}
{
  // An arrow strip dumps the lot, instantly, and only in its own lane.
  const g = bare();
  run(g, TURBO, 2.0);
  const hot = g.bike.heat;
  assert(hot > 0.4, `warmed up first (${hot.toFixed(3)})`);
  g.track = [{ kind: 'arrow', x: g.bike.x, len: 40, lane: g.bike.lane }];
  E.step(g, TURBO, DT);
  assert(g.bike.heat === 0, `riding an arrow empties the gauge (${hot.toFixed(3)} -> ${g.bike.heat})`);

  const h2 = bare();
  run(h2, TURBO, 2.0);
  h2.track = [{ kind: 'arrow', x: h2.bike.x, len: 40, lane: h2.bike.lane + 2 }];
  const before = h2.bike.heat;
  E.step(h2, TURBO, DT);
  assert(h2.bike.heat > before, `an arrow in another lane does nothing (${before.toFixed(3)} -> ${h2.bike.heat.toFixed(3)})`);
}
{
  // Filling the gauge stalls the engine, and the stall actually costs the time it claims.
  const g = bare();
  const t = 1 / C.HEAT_RATE;
  run(g, TURBO, t + 0.2);
  assert(g.bike.stalls === 1, `holding turbo for ${t.toFixed(1)}s stalls the engine (stalls=${g.bike.stalls})`);
  assert(g.bike.stall > 0, 'the stall timer is running');
  const vAtStall = g.bike.vx;
  run(g, TURBO, C.STALL_TIME + 0.1);
  assert(g.bike.stall === 0, `the stall clears after ${C.STALL_TIME}s`);
  assert(g.bike.vx < vAtStall * 0.5, `the bike coasts down during a stall (${vAtStall.toFixed(1)} -> ${g.bike.vx.toFixed(1)} m/s)`);
}

// ---------- 2. landing on the pitch, from both sides of the window ----------
// Put the bike in the air at a chosen pitch and drop it, without needing a ramp.
function land(pitch, vx = 30) {
  const g = bare();
  const b = g.bike;
  b.vx = vx; b.air = true; b.y = 0.5; b.vy = 0; b.pitch = pitch;
  for (let i = 0; i < 200 && b.air; i++) E.step(g, COAST, DT);
  return { g, b, event: g.event };
}
{
  const level = land(0);
  assert(!level.b.air && level.b.crash === 0, 'a level landing stays on the bike');
  assert(near(level.b.vx, 30, 1.5), `a level landing keeps the speed (30 -> ${level.b.vx.toFixed(1)} m/s)`);
  assert(level.b.cleanLandings === 1, 'and it counts as clean');

  const edge = land(C.LAND_CLEAN - 0.01);
  assert(edge.b.cleanLandings === 1, `just inside the clean window (${(C.LAND_CLEAN - 0.01).toFixed(2)} rad) is still clean`);

  const sloppy = land(C.LAND_CLEAN + 0.05);
  assert(sloppy.b.crash === 0 && sloppy.b.sloppyLandings === 1,
    `nose-up past ${C.LAND_CLEAN} rad is a wheelie, not a crash`);
  assert(sloppy.b.vx < 30 * 0.8, `and it costs speed (30 -> ${sloppy.b.vx.toFixed(1)} m/s, keep factor ${C.SLOPPY_KEEP})`);

  const tooHigh = land(C.LAND_SLOPPY + 0.05);
  assert(tooHigh.b.crash > 0 && tooHigh.b.crashes === 1,
    `nose-up past ${C.LAND_SLOPPY} rad throws you off`);

  const noseDown = land(C.LAND_NOSE - 0.05);
  assert(noseDown.b.crash > 0 && noseDown.b.crashes === 1,
    `nose-down past ${C.LAND_NOSE} rad digs in and throws you off`);

  const noseOk = land(C.LAND_NOSE + 0.02);
  assert(noseOk.b.crash === 0, `just inside the nose-down limit (${(C.LAND_NOSE + 0.02).toFixed(2)} rad) survives`);
}
{
  // Lean authority: the same keys that pick a lane on the ground rotate the bike in the air.
  const g = bare();
  const b = g.bike;
  b.air = true; b.y = 6; b.vy = 0; b.pitch = 0;
  run(g, { up: true, down: false, accel: false, turbo: false }, 0.5);
  assert(near(b.pitch, C.PITCH_RATE * 0.5, 0.1), `up leans the nose over 0.5s (${b.pitch.toFixed(2)} rad, rate ${C.PITCH_RATE})`);
}

// ---------- 3. the crash costs what it says ----------
{
  const g = bare();
  g.bike.vx = 30;
  const c = land(1.2, 30);             // a certain crash
  const t0 = c.g.time;
  let guard = 0;
  while (c.b.crash > 0 && guard++ < 1000) E.step(c.g, TURBO, DT);
  const lost = c.g.time - t0;
  assert(near(lost, C.CRASH_TIME, 0.1), `getting back on takes ${C.CRASH_TIME}s (measured ${lost.toFixed(2)}s)`);
  assert(c.b.vx === 0 || c.b.vx < 5, `and you are barely moving when you remount (${c.b.vx.toFixed(1)} m/s)`);
}

// ---------- 4. timing, finishing and qualification ----------
{
  const g = bare();
  g.bike.x = C.TRACK_LEN - 0.1; g.bike.vx = 30;   // 30 m/s covers 0.5 m in a frame, so this crosses
  E.step(g, HOLD, DT);
  assert(g.state === 'finished', 'crossing the line finishes the race');
  assert(g.finishTime === g.time && g.time > 0, `the finish time is the elapsed time (${g.finishTime.toFixed(3)}s)`);
  assert(near(g.qualify, C.TRACK_LEN / C.QUALIFY_SPEED, 0.001),
    `the qualifying time is the lap at ${C.QUALIFY_SPEED} m/s (${g.qualify.toFixed(2)}s)`);

  const fast = bare(); fast.bike.x = C.TRACK_LEN; fast.time = g.qualify - 5; E.step(fast, HOLD, DT);
  assert(E.qualified(fast), `finishing under ${g.qualify.toFixed(1)}s qualifies`);
  const slow = bare(); slow.bike.x = C.TRACK_LEN; slow.time = g.qualify + 5; E.step(slow, HOLD, DT);
  assert(!E.qualified(slow), 'finishing over it does not');

  assert(E.formatTime(9.5) === '9.50' && E.formatTime(75.25) === '1:15.25',
    `times read as a lap board (${E.formatTime(9.5)}, ${E.formatTime(75.25)})`);
}

// ---------- 5. the track generator ----------
{
  const a = E.makeTrack(7), b = E.makeTrack(7), c = E.makeTrack(8);
  assert(JSON.stringify(a) === JSON.stringify(b), 'the same seed builds the same track');
  assert(JSON.stringify(a) !== JSON.stringify(c), 'a different seed builds a different one');
  assert(a.every((f, i) => i === 0 || a[i - 1].x <= f.x), 'features come out sorted by distance');
  const kinds = new Set(a.map(f => f.kind));
  for (const k of ['arrow', 'ramp', 'whoops', 'mud']) assert(kinds.has(k), `the track contains ${k}`);
  const arrows = a.filter(f => f.kind === 'arrow');
  assert(arrows.length >= 10, `there are enough cooling arrows to plan around (${arrows.length})`);
  assert(a.every(f => f.lane === null || (f.lane >= 0 && f.lane < C.LANES)), 'every feature sits in a real lane');
}

// ---------- 6. the proof: mindless turbo must lose to a managed gauge ----------
// Neither bot steers or leans, so both land clean and the only difference between them is how they spend
// heat. If the flat-out bot wins anyway, the economy is decoration.
function race(policy, seed) {
  const g = E.createGame({ mode: 'solo', seed });
  E.startGame(g);
  let guard = 0;
  while (g.state === 'riding' && guard++ < 20000) E.step(g, policy(g), DT);
  return g;
}
const flatOut = () => TURBO;
// Back off before the needle buries itself, and let it breathe until there is room again.
const managed = (g) => (g.bike.heat > 0.74 ? HOLD : TURBO);
{
  let flatWins = 0, sumFlat = 0, sumMan = 0, stallsFlat = 0, stallsMan = 0;
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
  for (const s of seeds) {
    const f = race(flatOut, s), m = race(managed, s);
    sumFlat += f.finishTime; sumMan += m.finishTime;
    stallsFlat += f.bike.stalls; stallsMan += m.bike.stalls;
    if (f.finishTime <= m.finishTime) flatWins++;
  }
  const n = seeds.length;
  console.log(`\n   flat-out: ${(sumFlat / n).toFixed(2)}s avg, ${(stallsFlat / n).toFixed(1)} stalls/race`);
  console.log(`   managed : ${(sumMan / n).toFixed(2)}s avg, ${(stallsMan / n).toFixed(1)} stalls/race\n`);
  assert(flatWins === 0, `managing the gauge beats flat-out turbo on every track (flat-out won ${flatWins}/${n})`);
  assert(stallsFlat / n > 2, `flat-out actually stalls, repeatedly (${(stallsFlat / n).toFixed(1)} per race)`);
  assert(stallsMan / n < 0.5, `a managed rider rarely stalls (${(stallsMan / n).toFixed(1)} per race)`);
  assert(sumMan / n < sumFlat / n, `and finishes sooner (${(sumMan / n).toFixed(2)}s vs ${(sumFlat / n).toFixed(2)}s)`);
}

// ---------- 7. rivals ----------
{
  const g = E.createGame({ mode: 'race', seed: 3 });
  E.startGame(g);
  assert(g.rivals.length === 3, `the pack is three riders (${g.rivals.length})`);
  // Park a rival just ahead in the same lane and ride into the back of it.
  g.track = [];
  g.bike.vx = 30; g.bike.x = 100;
  g.rivals = [{ x: 101.5, lane: g.bike.lane, vx: 0, phase: 0, done: 0 }];
  E.step(g, HOLD, DT);
  assert(g.bike.crash > 0, 'clipping a rival from behind throws you off');
}

console.log(`\n${checks} checks`);
console.log(failures ? `${failures} FAILED` : 'all checks passed');
process.exit(failures ? 1 : 0);
