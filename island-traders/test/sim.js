// Whole computer games, headless, kept to a few seconds: every seeded game ends with a winner well
// before the turn cap at 2, 3 and 4 players, the computers really trade with each other, the levels
// come out in the right order, and the tuning targets hold loosely: Easy is a beatable but real opponent
// (not a pushover), Normal goes for the Longest Road, two-player games are shorter. The bands are wide on
// purpose (a few standard errors) so only a real regression trips them. The long level-versus-level table
// is test/bots.js (a report, not a test).
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
  ok(trades / N >= 2, '  and the computers trade with each other (' + (trades / N).toFixed(1) + ' trades a game)');
  if (kinds.length === 2) ok(M.newGame({ seed: 1, players: kinds.map((k) => ({ kind: k })) }).target === 8 && rounds < 27, `  two players play to 8 by default, so the game is short (${rounds.toFixed(1)} rounds; it was about 30 to 10 points)`);
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

// 4. Easy is gentle but real: tuned to about 12-18% a seat against three Normals and 25-35% heads-up
//    against one (it was 2-3% and 11%, a pushover). It spends rather than sits on a big hand.
{
  const N = 300;
  let easy = 0, ends = 0, big = 0;
  for (let seed = 1; seed <= N; seed++) {
    const k = rotate(['easy', 'normal', 'normal', 'normal'], seed);
    const S = M.simulate(4000 + seed, k, { onAct: (T, a) => {
      if (a.t !== 'end') return;
      const q = (T.cur + 3) % 4; if (k[q] !== 'easy') return;
      ends++; if (M.sum(T.players[q].res) > 10) big++;
    } });
    if (k[S.winner] === 'easy') easy++;
  }
  let duel = 0;
  for (let seed = 1; seed <= N; seed++) { const k = rotate(['normal', 'easy'], seed); const S = M.simulate(4500 + seed, k); if (k[S.winner] === 'easy') duel++; }
  console.log(`     Easy v 3 Normal, ${N} games: Easy won ${(100 * easy / N).toFixed(1)}%; Easy v Normal heads-up: Easy won ${(100 * duel / N).toFixed(1)}%; Easy ended ${(100 * big / ends).toFixed(2)}% of its turns holding more than 10 cards`);
  ok(easy / N >= 0.07 && easy / N <= 0.22, 'Easy wins a real but small share against three Normals (band 7-22%)');
  ok(duel / N >= 0.22 && duel / N <= 0.45 && duel / N < 0.5, 'and loses to Normal heads-up most of the time without being hopeless (band 22-45%)');
  ok(big / ends < 0.01, 'and does not hoard: under 1% of its turns end with more than 10 cards');
}
// 5. Normal races for the Longest Road some of the time: four Normals see it awarded in most games
//    (it was about 35%), but less often than four Hards, who chase it from further out.
{
  const N = 150;
  let nLR = 0, hLR = 0;
  for (let seed = 1; seed <= N; seed++) {
    if (M.simulate(4800 + seed, ['normal', 'normal', 'normal', 'normal']).longest >= 0) nLR++;
    if (M.simulate(4800 + seed, ['hard', 'hard', 'hard', 'hard']).longest >= 0) hLR++;
  }
  console.log(`     Longest Road awarded: four Normals ${(100 * nLR / N).toFixed(0)}%, four Hards ${(100 * hLR / N).toFixed(0)}% of ${N} games`);
  ok(nLR / N >= 0.5 && nLR / N <= 0.88 && nLR < hLR, 'Normal goes for the Longest Road (awarded in 50-88% of all-Normal games), Hard more keenly');
}

console.log(`\n${checks - failures}/${checks} passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failures ? 1 : 0);
