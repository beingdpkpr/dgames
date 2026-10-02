// Report, not a test: how the computer players compare over many seeded games, for a human to read
// when tuning them. Asserts nothing and always exits 0 (listed under dgames.reportOnly in the root
// package.json). Seats are rotated game by game so no level always goes first.
// Run: node test/bots.js [games per line-up, default 300]
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { Math, console, Array, Object, Number, String, JSON, Set, Map, Infinity, Error };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const M = ctx.__railRoutes;
const N = Number(process.argv[2]) || 300;
const rotate = (a, r) => a.slice(r % a.length).concat(a.slice(0, r % a.length));
const pct = (x) => (100 * x).toFixed(1) + '%';

// 1. Game length and what a game looks like, one level throughout.
console.log(`${N} games per line-up.\n\nOne level throughout, four players:`);
for (const k of ['easy', 'normal', 'hard']) {
  const turns = [], score = [], done = [], failed = [], left = [];
  let stalled = 0;
  for (let seed = 1; seed <= N; seed++) {
    const S = M.simulate(7000 + seed, [k, k, k, k]);
    if (S.endReason !== 'trains') stalled++;
    turns.push(S.turn / 4);
    S.final.rows.forEach((r) => { score.push(r.total); done.push(r.done); failed.push(r.tickets.length - r.done); left.push(S.players[r.p].hand.reduce((a, b) => a + b, 0)); });
  }
  const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
  turns.sort((a, b) => a - b);
  console.log(`  ${k.padEnd(7)} turns per player avg ${avg(turns)} (range ${turns[0]}-${turns[turns.length - 1]}); score avg ${avg(score)}; tickets done ${avg(done)}, missed ${avg(failed)} per player; cards left in hand ${avg(left)}; not ended by trains ${stalled}`);
}

// 2. Who wins, mixed tables.
const LINEUPS = [
  ['hard', 'normal'], ['normal', 'easy'], ['hard', 'easy'],
  ['hard', 'normal', 'easy'], ['hard', 'normal', 'normal'],
  ['hard', 'normal', 'normal', 'normal'], ['hard', 'hard', 'normal', 'easy'], ['normal', 'easy', 'easy', 'easy'],
  ['hard', 'normal', 'normal', 'normal', 'normal'], ['hard', 'normal', 'easy', 'normal', 'easy'],
];
console.log('\nShare of wins per seat of each level (fair share = 1 / players), and average score:');
for (const kinds of LINEUPS) {
  const t0 = Date.now();
  const wins = {}, seats = {}, pts = {};
  for (const k of kinds) seats[k] = (seats[k] || 0) + 1;
  let turns = 0;
  for (let seed = 1; seed <= N; seed++) {
    const k = rotate(kinds, seed);
    const S = M.simulate(5000 + seed, k);
    for (const w of S.final.winners) wins[k[w]] = (wins[k[w]] || 0) + 1 / S.final.winners.length;
    S.final.rows.forEach((r) => { pts[k[r.p]] = (pts[k[r.p]] || 0) + r.total; });
    turns += S.turn / kinds.length;
  }
  const parts = Object.keys(seats).map((k) => {
    const share = (wins[k] || 0) / N / seats[k];
    const se = Math.sqrt(share * (1 - share) / (N * seats[k]));
    return `${k} ${pct(share)} ±${(100 * se).toFixed(1)} (${(pts[k] / N / seats[k]).toFixed(0)} pts)`;
  });
  console.log(`  ${kinds.join(' v ').padEnd(40)} ${parts.join('   ').padEnd(80)} ${(turns / N).toFixed(1)} turns each (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
