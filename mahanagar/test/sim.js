// Whole games, headless. Plays seeded computer-vs-computer games through the real rules and asserts the
// things a person would only notice after an hour: every game ends, no game needs the turn cap, quick
// games stop at their round limit, Hard beats Easy, and the landing table the computers reason from
// still matches the board. Kept to a few seconds; the long level-vs-level table is test/bots.js.
// Run: node test/sim.js
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { Math, console, Array, Object, Number, String, JSON, Set, Map, Infinity };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const M = ctx.__mahanagar;

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (cond) console.log('ok   ' + msg); else { failures++; console.log('FAIL ' + msg); } };
const rotate = (a, r) => a.slice(r % a.length).concat(a.slice(0, r % a.length));
const t0 = Date.now();

// ------------------------------------------------------------ 1. the landing table is still true
{
  // Same procedure as produced FREQ: two players who never buy, leave jail at once, and roll 300,000 times.
  const S = M.newGame({ seed: 7, players: [{ name: 'a', kind: 'hard' }, { name: 'b', kind: 'hard' }], auctions: false, maxTurns: 1e9 });
  S.quiet = true;
  const cnt = Array(40).fill(0);
  let rolls = 0;
  while (rolls < 300000) {
    S.players.forEach((P) => { P.cash = 1e9; });
    if (S.phase === 'roll') { const P = S.players[S.cur]; if (P.jail) M.payJail(S); M.roll(S); rolls++; cnt[P.pos]++; }
    else if (S.phase === 'buy') M.decline(S); else if (S.phase === 'done') M.endTurn(S); else M.forceStep(S);
  }
  const drift = Math.max(...cnt.map((c, i) => Math.abs(c / rolls - M.FREQ[i])));
  ok(drift < 0.002, 'measured landing chances match the AI\'s table (worst square off by ' + (drift * 100).toFixed(3) + ' points)');
  ok(M.FREQ.reduce((a, b) => a + b, 0) > 0.99 && M.FREQ.reduce((a, b) => a + b, 0) < 1.01, 'the table sums to 1');
}

// ------------------------------------------------------------ 2. every game ends
{
  const lineups = { '4 mixed': ['hard', 'normal', 'easy', 'normal'], '2 hard': ['hard', 'hard'], '6 mixed': ['hard', 'normal', 'easy', 'hard', 'normal', 'easy'] };
  for (const [label, kinds] of Object.entries(lineups)) {
    const N = label === '4 mixed' ? 200 : 60;
    const turns = [];
    let capped = 0, unfinished = 0, maxSteps = 0, trades = 0;
    for (let seed = 1; seed <= N; seed++) {
      const S = M.simulate(seed, rotate(kinds, seed));
      if (S.phase !== 'over') unfinished++;
      if (S.endReason === 'cap') capped++;
      turns.push(S.turns); maxSteps = Math.max(maxSteps, S.steps);
    }
    turns.sort((a, b) => a - b);
    const avg = turns.reduce((a, b) => a + b, 0) / N;
    console.log(`     ${label}: ${N} games, turns avg ${avg.toFixed(0)}, median ${turns[N >> 1]}, max ${turns[N - 1]}; turn cap hit ${capped}x; most steps ${maxSteps}`);
    ok(unfinished === 0, label + ': all ' + N + ' games finish (no step-cap stall)');
    ok(capped <= Math.ceil(N * 0.02), label + ': the 1500-turn cap ends at most 2% of games (' + capped + ')');
  }
}

// ------------------------------------------------------------ 3. quick games stop at their limit
{
  let bad = 0, early = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const S = M.simulate(seed, rotate(['hard', 'normal', 'easy', 'normal'], seed), { rounds: 20, dealTwo: seed % 2 === 0 });
    if (S.phase !== 'over' || S.round > 21) bad++;
    if (S.endReason === 'rounds' && S.round !== 21) bad++;
    if (S.endReason === 'last') early++;
  }
  ok(bad === 0, '60 quick games of 20 rounds all end by round 21 (' + early + ' ended earlier by bankruptcies)');
}

// ------------------------------------------------------------ 4. levels mean something
{
  // Two Hard against two Easy, seats rotated. Hard's share of the wins measured ~80% (see bots.js);
  // the bar here is low enough that it only trips if something is badly broken.
  const N = 200;
  let hard = 0;
  for (let seed = 1; seed <= N; seed++) {
    const kinds = rotate(['hard', 'easy', 'hard', 'easy'], seed);
    const S = M.simulate(1000 + seed, kinds);
    if (kinds[S.winner] === 'hard') hard++;
  }
  ok(hard / N > 0.65, 'two Hard vs two Easy: Hard wins ' + (100 * hard / N).toFixed(1) + '% of ' + N + ' games');
}

console.log(`\n${checks - failures}/${checks} checks passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failures ? 1 : 0);
