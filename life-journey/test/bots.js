// Report, not a test: many seeded computer games, printed as tables for a human tuning the game. Asserts
// nothing and always exits 0 (listed under dgames.reportOnly in the root package.json).
//   - game length per player count, full and quick
//   - Cautious against Risky: win share per seat
//   - average final worth by each road, wedding and retirement choice
// Run: node test/bots.js [games per line-up, default 1000]
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { Math, console, Array, Object, Number, String, JSON, Set, Map, Infinity, Error };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const M = ctx.__life;
const N = Number(process.argv[2]) || 1000;
const rotate = (a, r) => a.slice(r % a.length).concat(a.slice(0, r % a.length));
const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

console.log(`${N} games per line-up.\n`);
console.log('Turns per player (p10 / median / p90 / max), and whether any game hit the turn cap');
for (const quick of [false, true]) for (const n of [2, 3, 4, 6]) {
  const kinds = Array.from({ length: n }, (_, i) => (i % 2 ? 'risky' : 'cautious'));
  const turns = []; let capped = 0;
  for (let s = 1; s <= N; s++) { const S = M.simulate(20000 + s, rotate(kinds, s), { quick }); S.players.forEach((P) => turns.push(P.turns)); if (S.endReason === 'cap') capped++; }
  turns.sort((a, b) => a - b);
  console.log(`  ${quick ? 'quick' : 'full '} ${n} players: ${pct(turns, 0.1)} / ${pct(turns, 0.5)} / ${pct(turns, 0.9)} / ${turns[turns.length - 1]}   capped ${capped}`);
}

console.log('\nWin share per seat (fair share = 1 / players)');
const by = {};
const add = (k, v) => (by[k] = by[k] || []).push(v);
for (const kinds of [['cautious', 'risky'], ['cautious', 'cautious', 'risky', 'risky'], ['cautious', 'risky', 'cautious', 'risky', 'cautious', 'risky']]) {
  const wins = {}, seats = {};
  for (const k of kinds) seats[k] = (seats[k] || 0) + 1;
  for (let s = 1; s <= N; s++) {
    const k = rotate(kinds, s), S = M.simulate(40000 + s, k);
    wins[k[S.winner]] = (wins[k[S.winner]] || 0) + 1;
    if (kinds.length === 4) S.players.forEach((P) => {
      for (const [f, r] of Object.entries(P.roads)) add(f + ': ' + r, P.final);
      add('wedding: ' + P.wedding, P.final); add('retired to: ' + P.dest, P.final); add('style: ' + P.kind, P.final);
    });
  }
  console.log('  ' + kinds.join(' v ').padEnd(60) + Object.keys(seats).map((k) => `${k} ${(100 * (wins[k] || 0) / N / seats[k]).toFixed(1)}%`).join('   '));
}
console.log('\nAverage final worth in 4-player games, by choice');
for (const k of Object.keys(by).sort()) console.log(`  ${k.padEnd(24)} ${M.fmt(Math.round(avg(by[k]))).padStart(8)}   (${by[k].length})`);
