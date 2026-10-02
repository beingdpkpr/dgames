// Whole computer games, headless, kept to a few seconds: every seeded game ends with a winner well
// before the turn cap at 2, 3 and 4 players, the computers really trade with each other, and the levels
// come out in the right order. The long level-versus-level table is test/bots.js (a report, not a test).
// Run: node test/sim.js
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { Math, console, Array, Object, Number, String, JSON, Set, Map, Infinity, Uint8Array, Error };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const M = ctx.__islandTraders;

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (cond) console.log('ok   ' + msg); else { failures++; console.log('FAIL ' + msg); } };
const rotate = (a, r) => a.slice(r % a.length).concat(a.slice(0, r % a.length));
const t0 = Date.now();

// 1. every game ends, at every table size
for (const kinds of [['normal', 'normal'], ['hard', 'normal', 'easy'], ['normal', 'normal', 'normal', 'normal'], ['easy', 'easy', 'easy', 'easy'], ['hard', 'hard', 'hard', 'hard']]) {
  const N = 40;
  let unfinished = 0, maxTurn = 0, sum = 0, trades = 0;
  for (let seed = 1; seed <= N; seed++) {
    const S = M.simulate(100 + seed, rotate(kinds, seed));
    if (S.phase !== 'over' || S.endReason === 'cap' || M.totalVP(S, S.winner) < S.target) unfinished++;
    maxTurn = Math.max(maxTurn, S.turn); sum += S.turn; trades += S.trades || 0;
  }
  const rounds = sum / N / kinds.length;
  console.log(`     ${kinds.join(',')}: ${N} games, turns avg ${(sum / N).toFixed(1)} (${rounds.toFixed(1)} rounds), max ${maxTurn}, player trades ${(trades / N).toFixed(1)} per game`);
  ok(unfinished === 0 && maxTurn < 300, `${kinds.length} players (${[...new Set(kinds)].join('/')}): all ${N} games end with a winner, none near the cap`);
  if (!kinds.every((k) => k === 'easy')) ok(trades / N >= 2, '  and the computers trade with each other (' + (trades / N).toFixed(1) + ' trades a game)');
}

// 2. levels mean something: one of each level at a three-player table, seats rotated
{
  const N = 300, wins = { hard: 0, normal: 0, easy: 0 };
  for (let seed = 1; seed <= N; seed++) {
    const k = rotate(['hard', 'normal', 'easy'], seed);
    const S = M.simulate(2000 + seed, k);
    wins[k[S.winner]]++;
  }
  console.log(`     Hard/Normal/Easy, ${N} games: Hard ${wins.hard}, Normal ${wins.normal}, Easy ${wins.easy}`);
  ok(wins.hard > wins.normal && wins.normal > wins.easy && wins.hard > N * 0.45, 'Hard wins most, then Normal, then Easy');
}
// 3. Hard against three Normals beats its fair share
{
  const N = 160; let hard = 0;
  for (let seed = 1; seed <= N; seed++) {
    const k = rotate(['hard', 'normal', 'normal', 'normal'], seed);
    const S = M.simulate(3000 + seed, k);
    if (k[S.winner] === 'hard') hard++;
  }
  console.log(`     Hard v 3 Normal, ${N} games: Hard won ${hard} (${(100 * hard / N).toFixed(0)}%, fair share 25%)`);
  ok(hard / N > 0.3, 'Hard beats its fair share against three Normals');
}

console.log(`\n${checks - failures}/${checks} passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failures ? 1 : 0);
