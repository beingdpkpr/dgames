// Report, not a test: level-versus-level win rates over many seeded computer games, for a human to read
// when tuning the computer players. Asserts nothing and always exits 0 (listed under dgames.reportOnly in
// the root package.json). Seats are rotated game by game so no level always moves first.
// Run: node test/bots.js [games per line-up, default 400]
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { Math, console, Array, Object, Number, String, JSON, Set, Map, Infinity };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const M = ctx.__cityTycoon;
const N = Number(process.argv[2]) || 400;
const rotate = (a, r) => a.slice(r % a.length).concat(a.slice(0, r % a.length));

const LINEUPS = [
  ['hard', 'normal'], ['hard', 'easy'], ['normal', 'easy'],
  ['hard', 'hard', 'normal', 'normal'], ['hard', 'hard', 'easy', 'easy'], ['normal', 'normal', 'easy', 'easy'],
  ['hard', 'normal', 'easy', 'hard', 'normal', 'easy'],
];
console.log(`${N} games per line-up. Share of wins per level, per seat of that level (fair share = 1 / players).`);
for (const kinds of LINEUPS) {
  const t0 = Date.now();
  const wins = {}, seats = {};
  for (const k of kinds) seats[k] = (seats[k] || 0) + 1;
  const turns = [];
  let capped = 0;
  for (let seed = 1; seed <= N; seed++) {
    const k = rotate(kinds, seed);
    const S = M.simulate(5000 + seed, k);
    wins[k[S.winner]] = (wins[k[S.winner]] || 0) + 1;
    turns.push(S.turns);
    if (S.endReason === 'cap') capped++;
  }
  turns.sort((a, b) => a - b);
  const parts = Object.keys(seats).map((k) => {
    const share = (wins[k] || 0) / N / seats[k];
    const se = Math.sqrt(share * (1 - share) / (N * seats[k]));
    return `${k} ${(100 * share).toFixed(1)}% ±${(100 * se).toFixed(1)}`;
  });
  console.log(`${kinds.join(' v ').padEnd(44)} ${parts.join('   ').padEnd(56)} turns median ${turns[N >> 1]}, max ${turns[N - 1]}, capped ${capped}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
