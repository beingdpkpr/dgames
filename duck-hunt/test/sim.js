// Headless simulation check (no browser). Loads the SIM half of index.html and:
//  1. sanity-checks round scaling for rounds 1..25;
//  2. checks checkHit picks the nearest flying duck and ignores misses and dying ducks;
//  3. plays round 1 with a perfect shooter and asserts it reaches round 2;
//  4. never shoots and asserts the dog appears and the game ends;
//  5. shoots at random and asserts the counters stay consistent, ammo never negative,
//     and a round ends within a few seconds of the last shell being spent;
//  6. loads the pasted high-score module with a stubbed localStorage and checks rank order, the
//     top-10 cap, initials handling, and that hiScoreEntry() reports a finished game's score and round.
// Run: node test/sim.js
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { Math, console, Array, Infinity, Map, Number, String }; ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const g = ctx.__dh, S = g.S;

let failures = 0;
const assert = (ok, msg) => { if (!ok) { failures++; console.log('FAIL', msg); } };
const DT = 1 / 60;
const flying = () => S.ducks.filter(d => d.state === 'flying');
const events = {};
for (const ev of ['dog', 'clear', 'escape', 'hit', 'miss', 'high', 'empty', 'retrieve']) { events[ev] = 0; g.on(ev, () => events[ev]++); }
const resetEvents = () => { for (const k in events) events[k] = 0; };

// 1. Round scaling.
let prev = null;
for (let r = 1; r <= 25; r++) {
  const c = g.roundConfig(r);
  assert(c.required >= 1 && c.required <= c.ducks, `round ${r}: required ${c.required} within 1..${c.ducks}`);
  assert(c.ammo >= c.required, `round ${r}: ammo ${c.ammo} covers required ${c.required}`);
  assert(c.concurrent >= 1 && c.concurrent <= g.ROUND_SCALING.maxConcurrent, `round ${r}: concurrent ${c.concurrent}`);
  if (prev) {
    assert(c.ducks >= prev.ducks && c.speed >= prev.speed && c.concurrent >= prev.concurrent, `round ${r}: difficulty never drops`);
    assert(c.required >= prev.required, `round ${r}: required hits never drop`);
    // The four assertions above were all TRUE while round 11 was strictly easier than round 10, because
    // none of them look at the two numbers a player actually feels. Demanded accuracy is required/ammo,
    // and slack is the ducks you may ignore entirely; if ducks and ammo climb while required stalls,
    // every counter above still rises and the round gets easier anyway. That is exactly what happened:
    // 12/30 (40%, 3 to spare) became 12/32 (37.5%, 4 to spare).
    assert(c.required / c.ammo >= prev.required / prev.ammo - 1e-9,
      `round ${r}: demanded accuracy never drops (${prev.required}/${prev.ammo} -> ${c.required}/${c.ammo})`);
    assert(c.ducks - c.required <= prev.ducks - prev.required,
      `round ${r}: ducks you may ignore never rises (${prev.ducks - prev.required} -> ${c.ducks - c.required})`);
  }
  prev = c;
}
// The curve must not flatline: every axis used to hit its cap by round 13, so roundConfig(13) and
// roundConfig(200) were byte-identical and the README's "rounds scale" stopped being true there.
assert(JSON.stringify(g.roundConfig(13)) !== JSON.stringify(g.roundConfig(200)), 'the curve still climbs past round 13');
assert(g.roundConfig(25).ducks === g.ROUND_SCALING.maxDucks, 'duck count caps');
assert(g.roundConfig(25).speed === g.ROUND_SCALING.maxSpeed, 'speed caps');
console.log('round 1', JSON.stringify(g.roundConfig(1)), '| round 10', JSON.stringify(g.roundConfig(10)));

// 2. Hit detection.
g.setView(1280, 720); g.startGame(); S.phase = 'play';
const mk = (x, y, dir = 1, state = 'flying') => { const d = g.spawnDuck(); d.x = x; d.y = y; d.dir = dir; d.state = state; return d; };
S.ducks.length = 0;
const a = mk(400, 300), b = mk(470, 300);
assert(g.checkHit(400, 300) === a, 'direct hit on duck A');
assert(g.checkHit(478, 296) === b, 'nearest duck wins when hitboxes overlap');
assert(g.checkHit(400, 420) === null, 'shot well below the duck misses');
assert(g.checkHit(300, 300) === null, 'shot behind the tail misses');
a.state = 'dying';
assert(g.checkHit(400, 300) === null, 'dying duck cannot be hit again');

// 2b. Flight patterns: every pattern shows up, flush ducks climb to cruise and never leave through the sky.
g.startGame(); for (let i = 0; i < 5; i++) g.nextRound(); S.phase = 'play';
const seen = {}; let flushes = 0;
for (let i = 0; i < 400; i++) { S.ducks.length = 0; const d = g.spawnDuck(); seen[d.pattern] = (seen[d.pattern] || 0) + 1; if (d.flush) flushes++; }
for (const pat of ['glide', 'swoop', 'dart', 'erratic', 'dive']) assert(seen[pat] > 10, `pattern ${pat} spawns at round 6 (${seen[pat] || 0}/400)`);
assert(flushes > 60, `flush spawns happen (${flushes}/400)`);
{
  let escapedTop = 0, cruised = 0; g.on('escape', (d) => { if (d.y < 0) escapedTop++; });
  for (let i = 0; i < 40; i++) {
    S.ducks.length = 0; S.resolved = 0; S.spawned = 0; S.phase = 'play'; const d = g.spawnDuck(); d.flush = true; d.baseY = S.view ? 0 : g.view.groundY + 10; d.targetY = g.view.h * 0.3; d.vy = -350; d.turns = 0;
    for (let t = 0; t < 6 && S.ducks.length; t += DT) g.update(DT);
    if (!d.flush) cruised++;
  }
  assert(cruised === 40, `flushed ducks reach cruise (${cruised}/40)`);
  assert(escapedTop === 0, 'no duck escapes through the top of the sky');
}
console.log('patterns at round 6:', JSON.stringify(seen), 'flush', flushes);

// Helper: step the sim until a predicate holds or the time budget runs out.
function runUntil(pred, seconds, each) {
  let t = 0;
  while (t < seconds) { if (each) each(); g.update(DT); t += DT; if (pred()) return t; }
  return -1;
}

// 3. Perfect shooter clears round 1.
g.setView(1280, 720); g.startGame(); resetEvents();
const cfg1 = S.cfg;
const aim = () => {
  if (S.phase !== 'play') return;
  for (const d of flying()) {
    if (d.x > d.size * 2 && d.x < 1280 - d.size * 2) { const ok = g.shoot(d.x + d.dir * d.size * 0.3, d.y - d.size * 0.15); assert(ok, 'perfect shot connects'); break; }
  }
};
const t3 = runUntil(() => S.round === 2, 90, aim);
assert(t3 > 0, 'perfect shooter reaches round 2');
assert(events.clear === 1 && events.dog === 0, 'round clear fired once, no dog');
assert(events.hit === cfg1.ducks && events.miss === 0, `every duck hit (${events.hit}/${cfg1.ducks}), no misses`);
assert(S.score > 0 && S.highScore === S.score && events.high > 0, 'score and high score updated');
assert(events.retrieve > 0 && events.retrieve <= cfg1.ducks, `dog retrieved the downed ducks (${events.retrieve} trips)`);
runUntil(() => false, 4); assert(!S.ducks.some(d => d.state === 'fallen'), 'no duck left lying in the grass 4s into the next round');
console.log('perfect shooter: round 2 after', t3.toFixed(1), 's, score', S.score, '| dog trips', events.retrieve);

// 3b. A near miss spooks a flying duck; a far miss does not.
g.startGame(); S.phase = 'play'; S.ducks.length = 0;
{ const d = g.spawnDuck(); d.x = 600; d.y = 300; d.flush = false; g.shoot(600, 420); assert(d.spooked > 0 && d.vy < 0, 'near miss below the duck pushes it up and spooks it');
  const e = g.spawnDuck(); e.x = 200; e.y = 300; e.flush = false; g.shoot(900, 300); assert(!(e.spooked > 0), 'far miss leaves the duck alone'); }

// 4. No shooting: dog laughs, game over.
g.startGame(); resetEvents();
const t4 = runUntil(() => S.phase === 'over', 120);
assert(t4 > 0, 'idle player reaches game over');
assert(events.dog === 1 && S.gameOver, 'dog fired once and gameOver set');
assert(events.escape === S.cfg.ducks, `all ${S.cfg.ducks} ducks escaped (${events.escape})`);
console.log('idle player: game over after', t4.toFixed(1), 's');

// 5. Random shooter: invariants hold, and running dry ends the round promptly.
g.startGame(); resetEvents();
let minAmmo = Infinity, badResolved = 0, dryAt = -1, dryRound = 0, roundsSeen = 1, slowEnd = 0, clock = 0;
runUntil(() => S.phase === 'over' || S.round > 6, 400, () => {
  clock += DT;
  if (S.phase === 'play' && Math.random() < 0.4) g.shoot(Math.random() * 1280, Math.random() * 720);
  if (S.ammo < minAmmo) minAmmo = S.ammo;
  if (S.cfg && S.resolved > S.cfg.ducks) badResolved++;
  if (S.phase === 'play' && S.ammo === 0 && dryAt < 0) { dryAt = clock; dryRound = S.round; }
  if (dryAt >= 0 && S.round === dryRound && S.phase !== 'play') { if (clock - dryAt > 4) slowEnd++; dryAt = -1; }
  if (S.round > roundsSeen) roundsSeen = S.round;
});
assert(minAmmo >= 0, 'ammo never negative');
assert(badResolved === 0, 'resolved never exceeds the round duck count');
assert(slowEnd === 0, 'a round ends within 4s of the last shell being spent');
console.log('random shooter: reached round', roundsSeen, '| hits', events.hit, 'misses', events.miss, '| phase', S.phase);

// 6. High scores: the module pasted into index.html (stubbed localStorage) and the game's own hook.
{
  const store = {};
  ctx.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const hs = g.makeHiScores({ key: 'duck-hunt', order: 'desc', max: 10, label: (v) => `${v} pts` });
  assert(hs.list().length === 0 && hs.rank(1) === 0, 'empty table: any score ranks first');
  for (let i = 1; i <= 12; i++) hs.add(i * 100, 'p' + i, 'round ' + i);
  const l = hs.list();
  assert(l.length === 10, `table capped at 10 (${l.length})`);
  assert(l[0].value === 1200 && l[9].value === 300 && l.every((e, i) => i === 0 || l[i - 1].value >= e.value), 'desc order keeps the best ten, best first');
  assert(hs.rank(5000) === 0 && hs.rank(650) === 6 && hs.rank(300) === -1 && hs.rank(250) === -1, 'rank: top, middle, equal-to-last and below-last');
  const e = hs.add(999, 'deepak', 'round 3');
  assert(e.initials === 'deepak', `player name kept as typed (${e.initials})`);
  assert(JSON.parse(store['dgames.hiscores.duck-hunt']).length === 10, 'stored under dgames.hiscores.duck-hunt, still capped');
  // Hook: clear round 1 perfectly, then stand idle so the dog ends the game in round 2 with a score on the board.
  g.setView(1280, 720); g.startGame(); resetEvents();
  assert(g.hiScoreEntry() === null, 'no entry while a game is running');
  runUntil(() => S.round === 2, 90, aim);
  const scoreAt2 = S.score;
  const t6 = runUntil(() => S.phase === 'over', 120);
  assert(t6 > 0 && S.gameOver && S.round === 2, 'idle round 2 ends the game');
  const entry = g.hiScoreEntry();
  assert(entry && entry.value === scoreAt2 && entry.value === S.score && entry.detail === 'round 2', `hook reports the final score and round (${JSON.stringify(entry)})`);
  assert(entry && hs.rank(entry.value) === (entry.value > 300 ? hs.list().findIndex((x) => entry.value > x.value) : -1), 'hook value ranks against the stored table');
  g.startGame(); g.endGame();
  assert(g.hiScoreEntry() === null, 'a zero score is never submitted');
  console.log('hiscore: table', hs.list().map((x) => x.initials + ':' + x.value).join(' '), '| entry', JSON.stringify(entry));
}

console.log(failures ? `${failures} FAILURE(S)` : 'ALL OK');
process.exit(failures ? 1 : 0);
