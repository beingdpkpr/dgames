// Whole computer games, headless, kept to a few seconds: every game ends (no game needs the round cap),
// the diplomacy limits hold at every step, a quick game stays short, and the levels are in the right
// order. The long level-versus-level tables are test/bots.js (a report, not a test).
// Run: node test/sim.js
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { Math, console, Array, Object, Number, String, JSON, Set, Map, Infinity, Int16Array, Int32Array, Float64Array, Error };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const M = ctx.__worldConquest;

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (cond) console.log('ok   ' + msg); else { failures++; console.log('FAIL ' + msg); } };
const rotate = (a, r) => a.slice(r % a.length).concat(a.slice(0, r % a.length));
const t0 = Date.now();

// 1. every game ends, at every table size, in both modes, with and without diplomacy
const TABLES = [['hard', 'normal'], ['hard', 'normal', 'easy'], ['normal', 'normal', 'normal', 'normal'], ['hard', 'hard', 'easy', 'easy', 'normal'], ['easy', 'easy', 'easy', 'easy', 'easy', 'easy'], ['hard', 'normal', 'easy', 'hard', 'normal', 'easy']];
for (const mode of ['classic', 'quick']) for (const diplomacy of [true, false]) {
  const N = mode === 'classic' && diplomacy ? 40 : 20;
  for (const kinds of TABLES) {
    let capped = 0, sum = 0, max = 0, bad = 0;
    for (let seed = 1; seed <= N; seed++) {
      const S = M.simulate(300 + seed, rotate(kinds, seed), { mode, diplomacy });
      if (S.endReason === 'cap') capped++;
      if (S.phase !== 'over' || S.winner < 0 || !S.players[S.winner].alive) bad++;
      sum += S.round; max = Math.max(max, S.round);
    }
    const label = `${mode}, talk ${diplomacy ? 'on ' : 'off'}, ${kinds.length} players`;
    const limit = mode === 'quick' ? M.QUICK.rounds : M.ROUND_CAP - 1;
    ok(!capped && !bad && max <= limit, `${label.padEnd(30)} ${N} games all end with a living winner: rounds avg ${(sum / N).toFixed(1)}, max ${max}${mode === 'quick' ? ` (limit ${M.QUICK.rounds})` : ''}`);
  }
}

// 2. the anti-stall rules hold at every single step of real games
{
  let steps = 0, broken = [];
  for (let seed = 1; seed <= 25; seed++) {
    const kinds = rotate(['hard', 'normal', 'normal', 'hard', 'easy'], seed);
    const S = M.newGame({ seed: 900 + seed, mode: 'classic', players: kinds.map((k) => ({ kind: k })) });
    while (S.phase !== 'over') {
      M.apply(S, M.aiAct(S)); steps++;
      const alive = M.realAlive(S);
      for (const p of alive) if (M.pactsOf(S, p).length > Math.max(0, alive.length - 2)) broken.push('too many pacts');
      if (alive.length < 3 && S.pacts.length) broken.push('pact with two left');
      for (const pc of S.pacts) if (pc.until - S.round > M.PACT_ROUNDS) broken.push('pact too long');
      if (S.round > M.ROUND_CAP) broken.push('cap');
    }
  }
  ok(!broken.length, `${steps} steps of 25 five-player games: never more than (players - 2) pacts each, never a pact with two players left, no pact longer than ${M.PACT_ROUNDS} rounds` + (broken.length ? ' — ' + broken.slice(0, 3).join(', ') : ''));
}

// 3. levels mean something: one of each level at a three-player table, seats rotated
{
  const N = 300, wins = { hard: 0, normal: 0, easy: 0 };
  for (let seed = 1; seed <= N; seed++) {
    const k = rotate(['hard', 'normal', 'easy'], seed);
    const S = M.simulate(2000 + seed, k, { mode: 'classic' });
    wins[k[S.winner]]++;
  }
  console.log(`     Hard/Normal/Easy, ${N} classic games: Hard ${wins.hard}, Normal ${wins.normal}, Easy ${wins.easy}`);
  ok(wins.hard > wins.normal && wins.normal > wins.easy && wins.hard > N * 0.45, 'Hard wins most, then Normal, then Easy');
  const two = { hard: 0, normal: 0 };
  for (let seed = 1; seed <= 200; seed++) { const k = rotate(['hard', 'normal'], seed); const S = M.simulate(4000 + seed, k, { mode: 'quick' }); two[k[S.winner]]++; }
  console.log(`     Hard v Normal (with a neutral army), 200 quick games: Hard ${two.hard}, Normal ${two.normal}`);
  ok(two.hard > 110, 'head to head in a quick game, Hard beats Normal');
}

console.log(`\n${checks - failures}/${checks} passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failures ? 1 : 0);
