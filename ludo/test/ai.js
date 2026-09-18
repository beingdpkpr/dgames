// Headless AI check (no browser). Plays seeded level-vs-level matches and reports the mix, the way
// dots-and-boxes/test/ai.js does. Ludo is a dice game, so a stronger level cannot win nearly as often as
// it can at a perfect-information game; the thresholds below are deliberately modest and the measured
// rate is printed so a regression shows up as a number rather than a pass/fail flip. Seats are swapped
// half way through every match because moving first is worth a lot here. Run: node test/ai.js
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { Math, console, Array, Object, Number, String, Infinity, Map, Set, JSON,
  localStorage: { getItem: () => null, setItem: () => {} } };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const L = ctx.__ludo;

let failures = 0;
const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures++; };

// One game between two levels. `levels[i]` is the level playing seat i. Returns the winning seat, or -1
// if the game ran long enough to look stuck.
function playGame(levels, seed) {
  const s = L.newState(levels.length);
  const rnd = L.makeRng(seed);
  for (let turn = 0; turn < 6000 && !s.over; turn++) {
    const roll = L.rollDie(rnd);
    const r = L.beginRoll(s, roll);
    if (r.forfeit || !r.moves.length) continue;
    L.applyMove(s, L.aiMove(s, roll, levels[s.player], rnd));
  }
  return s.over ? s.winner : -1;
}
// `n` games of a vs b, with the seats swapped for the second half so first-move advantage cancels out.
function match(a, b, n) {
  let aWins = 0, bWins = 0, stuck = 0;
  for (let i = 0; i < n; i++) {
    const swap = i >= n / 2;
    const w = playGame(swap ? [b, a] : [a, b], 1000 + i * 7919);
    if (w < 0) stuck++;
    else if ((w === 0) !== swap) aWins++;
    else bWins++;
  }
  return { aWins, bWins, stuck, rate: aWins / (aWins + bWins || 1) };
}

// 1. every level always produces a legal move when one exists
{
  const s = L.newState(4);
  const rnd = L.makeRng(7);
  for (let i = 0; i < 500 && !s.over; i++) {
    const roll = L.rollDie(rnd);
    const r = L.beginRoll(s, roll);
    if (r.forfeit || !r.moves.length) continue;
    for (const level of ['easy', 'normal', 'hard']) {
      const m = L.aiMove(s, roll, level, rnd);
      if (!r.moves.some((x) => x.token === m.token && x.to === m.to)) { assert(false, `${level} returned a move that is not legal`); i = 500; break; }
    }
    L.applyMove(s, L.aiMove(s, roll, 'hard', rnd));
  }
  assert(true, 'easy, normal and hard only ever pick from the legal move list');
}

// 2. normal and hard are deterministic given the same position and roll: the UI replays them, and the
// tournaments below would be meaningless if they drifted
{
  const s = L.newState(4);
  s.tokens[0] = [3, 12, L.YARD, 40]; s.tokens[1] = [7, L.YARD, 22, 5];
  for (const level of ['normal', 'hard']) {
    const a = L.aiMove(s, 3, level, L.makeRng(1)), b = L.aiMove(s, 3, level, L.makeRng(999));
    assert(a.token === b.token && a.to === b.to, `${level} picks the same move regardless of the generator`);
  }
}

// 3. hard prefers the capture that is on offer
{
  const s = L.newState(4);
  const idx = L.ringIndexOf(0, 10);
  let gp = -1;
  for (let g = 0; g <= L.LAST_RING; g++) if (L.ringIndexOf(1, g) === idx) gp = g;
  s.tokens[0] = [5, 30, L.YARD, L.YARD];
  s.tokens[1] = [gp, L.YARD, L.YARD, L.YARD];
  const m = L.aiMove(s, 5, 'hard', Math.random);
  assert(m.token === 0 && m.captures.length === 1, 'hard takes the capture rather than advancing its leader');
}

// 4. hard walks into a home run rather than loitering on the ring
{
  const s = L.newState(2);
  s.tokens[0] = [L.LAST_RING - 1, 20, L.YARD, L.YARD];
  const m = L.aiMove(s, 3, 'hard', Math.random);
  assert(m.token === 0 && m.to > L.LAST_RING, 'hard moves the token that can reach the home run');
}

// 5. the tournaments. Hard vs Normal differs by one term — whether the move avoids parking within an
// opponent's reach — and in a dice game that is worth only a few percentage points. 300 games measures
// it to about +/- 2.9pp, which cannot tell a real edge from a coin flip, so that match gets 1200 games
// (about +/- 1.4pp). The lopsided matches need far less to clear their thresholds.
const results = [];
for (const [a, b, n] of [['normal', 'easy', 400], ['hard', 'easy', 400], ['hard', 'normal', 1200]]) {
  const r = match(a, b, n);
  const se = Math.sqrt(0.25 / n) * 100;
  console.log(`\n${(a + ' vs ' + b).padEnd(16)} x${n}: ${a} ${r.aWins}, ${b} ${r.bWins}, unfinished ${r.stuck}  (${(r.rate * 100).toFixed(1)}% +/- ${se.toFixed(1)})`);
  results.push({ a, b, r });
}
console.log('');
const [ne, he, hn] = results;
assert(ne.r.stuck === 0 && he.r.stuck === 0 && hn.r.stuck === 0, 'every seeded game reached a winner');
assert(ne.r.rate > 0.8, `normal beats easy decisively (${(ne.r.rate * 100).toFixed(1)}%)`);
assert(he.r.rate > 0.85, `hard beats easy decisively (${(he.r.rate * 100).toFixed(1)}%)`);
// 0.52 sits about three standard errors below the measured 55.7%, so this fails on a real regression
// rather than on an unlucky run of seeds.
assert(hn.r.rate > 0.52, `hard's edge over normal is bigger than the noise (${(hn.r.rate * 100).toFixed(1)}%)`);
assert(he.r.rate > ne.r.rate, `hard beats easy more often than normal does (${(he.r.rate * 100).toFixed(1)}% vs ${(ne.r.rate * 100).toFixed(1)}%)`);

// Per-seat, against the same-level control. The combined figure above is a fair symmetric average, but
// averaging is exactly what hid this: seat 0 moves first, and moving first is a DISADVANTAGE here, because
// getting ahead is what exposes a token to capture from behind. With the SAME level on both seats, seat 0
// wins only about 39.5% (n=800, +/-1.7). So hard sitting on seat 0 can lose outright to normal while still
// being the better player, and reading hard's 44% against 50% makes it look like hard is worse when it
// starts. It is not: the control is normal in that same seat, and hard beats it from both ends.
// Without these two assertions a real regression in hard could hide behind a healthy-looking average.
function fixedSeat(a, b, aSeat, n) {
  let aWins = 0, played = 0;
  for (let i = 0; i < n; i++) {
    const w = playGame(aSeat === 0 ? [a, b] : [b, a], 500000 + i * 7919);
    if (w < 0) continue;
    played++; if (w === aSeat) aWins++;
  }
  return aWins / (played || 1);
}
{
  const N = 400, se = Math.sqrt(0.25 / N) * 100;
  console.log('');
  for (const seat of [0, 1]) {
    const base = fixedSeat('normal', 'normal', seat, N);
    const hard = fixedSeat('hard', 'normal', seat, N);
    const where = seat === 0 ? 'moving first ' : 'moving second';
    console.log(`seat ${seat} (${where}): normal ${(base * 100).toFixed(1)}%, hard ${(hard * 100).toFixed(1)}%  (+/- ${se.toFixed(1)})`);
    assert(hard > base, `hard beats normal from seat ${seat} against the same-seat control (${(hard * 100).toFixed(1)}% vs ${(base * 100).toFixed(1)}%)`);
  }
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
