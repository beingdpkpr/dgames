// Report, not a test: how the computer players compare, how long games run, and how much they talk —
// over many seeded games, for a human to read when tuning. Asserts nothing and always exits 0 (listed
// under dgames.reportOnly in the root package.json). Seats are rotated game by game.
// Run: node test/bots.js [games per line-up, default 300]
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { Math, console, Array, Object, Number, String, JSON, Set, Map, Infinity, Int16Array, Int32Array, Float64Array, Error };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const M = ctx.__worldConquest;
const N = Number(process.argv[2]) || 300;
const rotate = (a, r) => a.slice(r % a.length).concat(a.slice(0, r % a.length));
const pct = (x) => (100 * x).toFixed(1) + '%';
const t0 = Date.now();

console.log(`${N} games per line-up; ± is one standard error.\n`);
console.log('1. Share of wins per seat of each level (fair share = 1 / players):');
const LINEUPS = [['hard', 'normal', 'easy'], ['hard', 'normal'], ['normal', 'easy'], ['hard', 'normal', 'normal', 'normal'], ['normal', 'easy', 'easy', 'easy'], ['hard', 'easy', 'easy', 'easy'], ['hard', 'hard', 'normal', 'normal', 'easy', 'easy']];
for (const mode of ['classic', 'quick']) for (const diplomacy of [true, false]) {
  console.log(`   ${mode}, truces and alliances ${diplomacy ? 'on' : 'off'}:`);
  for (const kinds of LINEUPS) {
    const wins = {}, seats = {};
    for (const k of kinds) seats[k] = (seats[k] || 0) + 1;
    for (let seed = 1; seed <= N; seed++) { const k = rotate(kinds, seed); const S = M.simulate(7000 + seed, k, { mode, diplomacy }); wins[k[S.winner]] = (wins[k[S.winner]] || 0) + 1; }
    const parts = Object.keys(seats).map((k) => { const share = (wins[k] || 0) / N / seats[k], se = Math.sqrt(share * (1 - share) / (N * seats[k])); return `${k} ${pct(share)} ±${(100 * se).toFixed(1)}`; });
    console.log(`     ${kinds.join(' v ').padEnd(46)} ${parts.join('   ')}${kinds.length === 2 ? '   (+ a neutral army)' : ''}`);
  }
}

console.log('\n2. Game length in rounds (a round = every player has one turn), Normal computers, talk on:');
for (const mode of ['quick', 'classic']) {
  for (let n = 2; n <= 6; n++) {
    const rounds = [], why = {};
    for (let seed = 1; seed <= N; seed++) { const S = M.simulate(9000 + seed, new Array(n).fill('normal'), { mode }); rounds.push(S.round); why[S.endReason] = (why[S.endReason] || 0) + 1; }
    rounds.sort((a, b) => a - b);
    const avg = rounds.reduce((a, b) => a + b, 0) / N;
    console.log(`   ${mode.padEnd(7)} ${n} players: avg ${avg.toFixed(1)}, median ${rounds[N >> 1]}, 90th ${rounds[Math.floor(N * 0.9)]}, max ${rounds[N - 1]}; ended by ${Object.entries(why).map(([k, v]) => k + ' ' + v).join(', ')}`);
  }
}

console.log('\n3. Diplomacy per game (five players: Hard, Normal, Normal, Hard, Easy; classic):');
{
  let offers = 0, pacts = 0, alliances = 0, breaks = 0; const by = {};
  for (let seed = 1; seed <= N; seed++) {
    const S = M.simulate(11000 + seed, rotate(['hard', 'normal', 'normal', 'hard', 'easy'], seed));
    offers += S.stats.offers; pacts += S.stats.pacts; alliances += S.stats.alliances; breaks += S.stats.breaks;
    for (const k in S.stats.breakBy) by[k] = (by[k] || 0) + S.stats.breakBy[k];
  }
  console.log(`   offers ${(offers / N).toFixed(1)}, pacts signed ${(pacts / N).toFixed(1)} (alliances against the leader ${(alliances / N).toFixed(1)}), broken ${(breaks / N).toFixed(2)}`);
  console.log(`   broken by: ${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(', ') || 'nobody'} (level/character; loyal and Easy players never break)`);
}
console.log(`\n(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
