// Report, not a test: how the computer players compare and how long games run, over many seeded games,
// for a human to read when tuning them. Asserts nothing and always exits 0 (listed under
// dgames.reportOnly in the root package.json). Seats are rotated game by game so no level always goes first.
// Run: node test/bots.js [games per line-up, default 400]
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { Math, console, Array, Object, Number, String, JSON, Set, Map, Infinity, Uint8Array, Error };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const M = ctx.__islandTraders;
const N = Number(process.argv[2]) || 400;
const rotate = (a, r) => a.slice(r % a.length).concat(a.slice(0, r % a.length));
const pct = (x) => (100 * x).toFixed(1) + '%';

// 1. Game length. "Steps" are the computer's visible actions (roll, build, trade, end...): the page pauses
//    about 0.6 s on each at Normal speed, 0.25 s at Fast, plus roughly 1.5 s of dice and card animation
//    per roll. A human turn is guessed at 60 s; that guess dominates the total.
console.log(`${N} games per line-up.\n\nGame length (one human seat played by the Normal computer, the rest as listed):`);
for (const kinds of [['normal', 'normal', 'normal', 'normal'], ['normal', 'hard', 'hard', 'hard'], ['normal', 'easy', 'easy', 'easy'], ['normal', 'normal', 'normal'], ['normal', 'normal']]) {
  let turns = 0, steps = 0, humanTurns = 0, trades = 0, sevens = 0, longest = 0, army = 0, cards = 0;
  const lens = [];
  for (let seed = 1; seed <= N; seed++) {
    let st = 0;
    const S = M.simulate(9000 + seed, kinds, { onAct: (T, a) => { if (T.cur !== 0 || a.t === 'discard') st++; } });
    turns += S.turn; steps += st; lens.push(S.turn); humanTurns += Math.ceil(S.turn / kinds.length);
    trades += S.trades || 0; sevens += S.rolls[7]; if (S.longest >= 0) longest++; if (S.army >= 0) army++;
    cards += S.players.reduce((s, P) => s + P.cards.length + P.guards, 0);
  }
  lens.sort((a, b) => a - b);
  const aiSec = (steps / N) * 0.6 + (turns / N) * (1 - 1 / kinds.length) * 1.5, humanSec = (humanTurns / N) * 60;
  console.log(`  ${kinds.join(',').padEnd(28)} turns avg ${(turns / N).toFixed(1)} (median ${lens[lens.length >> 1]}, 90th ${lens[Math.floor(lens.length * 0.9)]}, max ${lens[lens.length - 1]}), ` +
    `rounds ${(turns / N / kinds.length).toFixed(1)}; computer steps ${(steps / N).toFixed(0)} -> ~${(aiSec / 60).toFixed(1)} min of computer play at Normal speed (${(aiSec * 0.45 / 60).toFixed(1)} at Fast) ` +
    `+ ${(humanSec / 60).toFixed(0)} min of your turns at 60 s each; player trades ${(trades / N).toFixed(1)}, 7s ${(sevens / N).toFixed(1)}, Longest Road awarded in ${pct(longest / N)}, Strongest Guard in ${pct(army / N)}, venture cards ${(cards / N).toFixed(1)}`);
}

// 2. Who wins, mixed tables.
const LINEUPS = [
  ['hard', 'normal', 'easy'],
  ['hard', 'normal', 'normal', 'normal'],
  ['normal', 'easy', 'easy', 'easy'],
  ['hard', 'easy', 'easy', 'easy'],
  ['hard', 'hard', 'normal', 'normal'],
  ['hard', 'normal', 'easy', 'easy'],
  ['hard', 'normal'],
  ['normal', 'easy'],
];
console.log('\nShare of wins per seat of each level (fair share = 1 / players):');
for (const kinds of LINEUPS) {
  const t0 = Date.now();
  const wins = {}, seats = {};
  for (const k of kinds) seats[k] = (seats[k] || 0) + 1;
  let capped = 0, turns = 0;
  for (let seed = 1; seed <= N; seed++) {
    const k = rotate(kinds, seed);
    const S = M.simulate(5000 + seed, k);
    if (S.winner >= 0) wins[k[S.winner]] = (wins[k[S.winner]] || 0) + 1;
    if (S.endReason === 'cap') capped++;
    turns += S.turn;
  }
  const parts = Object.keys(seats).map((k) => {
    const share = (wins[k] || 0) / N / seats[k];
    const se = Math.sqrt(share * (1 - share) / (N * seats[k]));
    return `${k} ${pct(share)} ±${(100 * se).toFixed(1)}`;
  });
  console.log(`  ${kinds.join(' v ').padEnd(34)} ${parts.join('   ').padEnd(54)} turns avg ${(turns / N).toFixed(1)}; capped ${capped} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
// 3. Seat order: does going first matter? (four Normals)
{
  const wins = [0, 0, 0, 0];
  for (let seed = 1; seed <= N; seed++) wins[M.simulate(7000 + seed, ['normal', 'normal', 'normal', 'normal']).winner]++;
  console.log('\nFour Normals, wins by seat (1st to 4th): ' + wins.map((w) => pct(w / N)).join(', '));
}
