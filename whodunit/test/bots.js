// Report, not a test: how the computer detectives compare, over many seeded games, for a human to read
// when tuning them. Asserts nothing and always exits 0 (listed under dgames.reportOnly in the root
// package.json). Seats are rotated game by game so no level always goes first.
// Run: node test/bots.js [games per line-up, default 400]
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { Math, console, Array, Object, Number, String, JSON, Set, Map, Infinity, Int8Array, WeakMap, Error };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const M = ctx.__whodunit;
const N = Number(process.argv[2]) || 400;
const rotate = (a, r) => a.slice(r % a.length).concat(a.slice(0, r % a.length));
const pct = (x) => (100 * x).toFixed(1) + '%';

// 1. How fast each level solves a case on its own terms: four of the same level, one die. "Own turns"
//    is how many turns the winner had taken, the number a player would feel.
console.log(`${N} games per line-up.\n\nTurns to solve, four detectives of one level (one die):`);
for (const k of ['easy', 'normal', 'hard']) {
  const own = [], table = [];
  let wrong = 0, capped = 0;
  for (let seed = 1; seed <= N; seed++) {
    const S = M.simulate(7000 + seed, [k, k, k, k]);
    if (S.endReason === 'cap') capped++;
    if (S.winner >= 0) { own.push(S.players[S.winner].turns); table.push(S.turn); }
    S.log.forEach((e) => { if (e.t === 'accuse' && !e.ok) wrong++; });
  }
  own.sort((a, b) => a - b); table.sort((a, b) => a - b);
  const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
  console.log(`  ${k.padEnd(7)} winner's own turns avg ${avg(own)} (median ${own[own.length >> 1]}, max ${own[own.length - 1]}); table turns avg ${avg(table)}; wrong accusations ${(wrong / N).toFixed(2)} per game; capped ${capped}`);
}

// 2. Who wins, mixed tables.
const LINEUPS = [
  ['hard', 'normal'].concat(['easy']),
  ['hard', 'easy', 'easy'],
  ['normal', 'easy', 'easy'],
  ['hard', 'normal', 'normal'],
  ['hard', 'hard', 'normal', 'normal'],
  ['hard', 'hard', 'easy', 'easy'],
  ['normal', 'normal', 'easy', 'easy'],
  ['hard', 'normal', 'easy', 'hard', 'normal', 'easy'],
];
console.log('\nShare of wins per seat of each level (fair share = 1 / players), one die:');
for (const kinds of LINEUPS) {
  const t0 = Date.now();
  const wins = {}, seats = {}, wrong = {};
  for (const k of kinds) seats[k] = (seats[k] || 0) + 1;
  let capped = 0, nobody = 0, turns = 0;
  for (let seed = 1; seed <= N; seed++) {
    const k = rotate(kinds, seed);
    const S = M.simulate(5000 + seed, k);
    if (S.winner >= 0) wins[k[S.winner]] = (wins[k[S.winner]] || 0) + 1; else nobody++;
    if (S.endReason === 'cap') capped++;
    turns += S.turn;
    S.log.forEach((e) => { if (e.t === 'accuse' && !e.ok) wrong[k[e.by]] = (wrong[k[e.by]] || 0) + 1; });
  }
  const parts = Object.keys(seats).map((k) => {
    const share = (wins[k] || 0) / N / seats[k];
    const se = Math.sqrt(share * (1 - share) / (N * seats[k]));
    return `${k} ${pct(share)} ±${(100 * se).toFixed(1)}`;
  });
  const wr = Object.keys(wrong).map((k) => k + ' ' + wrong[k]).join(', ') || 'none';
  console.log(`  ${kinds.join(' v ').padEnd(44)} ${parts.join('   ').padEnd(52)} turns avg ${(turns / N).toFixed(1)}, wrong accusations: ${wr}; unsolved ${nobody}, capped ${capped} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
