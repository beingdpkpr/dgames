// Whole computer games, headless, kept to a few seconds: every game ends by an accusation, no game needs
// the turn cap, Hard never accuses wrongly, and the levels are in the right order. The long
// level-versus-level table is test/bots.js (a report, not a test).
// Run: node test/sim.js
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { Math, console, Array, Object, Number, String, JSON, Set, Map, Infinity, Int8Array, WeakMap, Error };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const M = ctx.__whodunit;

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (cond) console.log('ok   ' + msg); else { failures++; console.log('FAIL ' + msg); } };
const rotate = (a, r) => a.slice(r % a.length).concat(a.slice(0, r % a.length));
const t0 = Date.now();

// 1. every game ends, at every table size
for (const kinds of [['hard', 'hard', 'hard'], ['normal', 'normal', 'normal', 'normal'], ['easy', 'easy', 'easy', 'easy', 'easy'], ['hard', 'normal', 'easy', 'hard', 'normal', 'easy']]) {
  const N = 60;
  let unfinished = 0, maxTurn = 0, sum = 0, wrongStrong = 0;
  for (let seed = 1; seed <= N; seed++) {
    const k = rotate(kinds, seed);
    const S = M.simulate(100 + seed, k, { dice: seed % 2 ? 1 : 2 });
    if (S.phase !== 'over' || S.endReason === 'cap') unfinished++;
    maxTurn = Math.max(maxTurn, S.turn); sum += S.turn;
    S.log.forEach((e) => { if (e.t === 'accuse' && !e.ok && k[e.by] !== 'easy') wrongStrong++; });
  }
  console.log(`     ${kinds.join(',')}: ${N} games, turns avg ${(sum / N).toFixed(1)}, max ${maxTurn}`);
  ok(unfinished === 0, kinds.length + ' players (' + [...new Set(kinds)].join('/') + '): all ' + N + ' games end with an accusation');
  ok(wrongStrong === 0, '  and no Normal or Hard detective accused wrongly');
}

// 2. levels mean something: one of each level at a three-player table, seats rotated
{
  const N = 240, wins = { hard: 0, normal: 0, easy: 0 };
  for (let seed = 1; seed <= N; seed++) {
    const k = rotate(['hard', 'normal', 'easy'], seed);
    const S = M.simulate(2000 + seed, k);
    if (S.winner >= 0) wins[k[S.winner]]++;
  }
  console.log(`     Hard/Normal/Easy, ${N} games: Hard ${wins.hard}, Normal ${wins.normal}, Easy ${wins.easy}`);
  ok(wins.hard > wins.normal && wins.normal > wins.easy * 0.9 && wins.hard > N * 0.4, 'Hard wins most, then Normal; Easy wins least or about as often as Normal (it gambles)');
}

console.log(`\n${checks - failures}/${checks} passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failures ? 1 : 0);
