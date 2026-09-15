// Headless multi-player rules check (no browser). Loads the pure game logic out of index.html and, for
// 2, 3, 4 and 5 players:
//  1. plays full games with every seat driven by the AI and checks at every move that the turn either
//     stays with the player who just completed a box or passes to the next seat in order;
//  2. checks the final scores sum to the number of boxes and every box/edge is owned by a real seat;
//  3. checks ranking() orders everyone best-first with shared ranks on equal scores, and winner()
//     names the outright leader or 0 on a tie;
//  4. builds a deliberate 3-way tie and a deliberate outright win by a late seat.
// Run: node test/players.js
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'))
  + '\nglobalThis.__dab = { newState, legalMoves, applyMove, winner, ranking, aiMove, nextPlayer, MIN_PLAYERS, MAX_PLAYERS };';
const ctx = { Math, console, Array, Infinity, Map, JSON, Object }; ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const g = ctx.__dab;

let failures = 0;
const assert = (ok, msg) => { if (!ok) { failures++; console.log('FAIL', msg); } };
const H = (r, c) => ({ t: 'h', r, c }), V = (r, c) => ({ t: 'v', r, c });
const LEVELS = ['easy', 'normal', 'hard'];

assert(g.MIN_PLAYERS === 2 && g.MAX_PLAYERS === 5, 'player range is 2..5');
assert(g.newState(3, 1).players === 2 && g.newState(3, 9).players === 5, 'player count is clamped to the range');
assert(g.newState(3).players === 2, 'default is two players');

// 1-3. Full games, every seat played by a (cycling) AI level, on 3x3 .. 6x6 dot boards.
let games = 0, moves = 0, extraTurns = 0, ties = 0;
for (let players = g.MIN_PLAYERS; players <= g.MAX_PLAYERS; players++) {
  for (let game = 0; game < 60; game++) {
    const n = 3 + (game % 4), s = g.newState(n, players), totalBoxes = (n - 1) * (n - 1);
    assert(Object.keys(s.scores).length === players, players + 'p: one score per seat');
    assert(s.player === 1, players + 'p: seat 1 opens');
    let guard = 0, sawExtra = false;
    while (!s.over) {
      const before = s.player, expectedNext = (before % players) + 1;
      assert(expectedNext === g.nextPlayer(s), 'nextPlayer cycles 1..players');
      const e = g.aiMove(s, LEVELS[(before + game) % LEVELS.length]);
      const claimed = g.applyMove(s, e);
      assert(claimed !== null, players + 'p: AI made an illegal move');
      moves++;
      if (s.over) break;
      if (claimed.length) { assert(s.player === before, players + 'p: completing a box keeps the turn'); extraTurns++; sawExtra = true; }
      else assert(s.player === expectedNext, players + 'p: turn passes to the next seat (' + before + ' -> ' + s.player + ', expected ' + expectedNext + ')');
      assert(s.player >= 1 && s.player <= players, players + 'p: current player in range');
      if (++guard > 1000) { assert(false, 'game did not terminate'); break; }
    }
    if (totalBoxes >= 4) assert(sawExtra, players + 'p: a full game on ' + n + 'x' + n + ' should include at least one extra turn');
    // Scores and ownership.
    let sum = 0;
    for (let p = 1; p <= players; p++) sum += s.scores[p];
    assert(sum === totalBoxes, players + 'p: scores sum to ' + totalBoxes + ' (got ' + sum + ')');
    const owned = {};
    for (const row of s.boxes) for (const p of row) { assert(p >= 1 && p <= players, 'every box is owned by a seat'); owned[p] = (owned[p] || 0) + 1; }
    for (let p = 1; p <= players; p++) assert((owned[p] || 0) === s.scores[p], players + 'p: score ' + p + ' matches boxes owned');
    for (const grid of [s.h, s.v]) for (const row of grid) for (const p of row) assert(p >= 1 && p <= players, 'every edge is owned by a seat');
    assert(s.remaining === 0, 'no edges remain');
    // Ranking and winner.
    const r = g.ranking(s), w = g.winner(s);
    assert(r.length === players && new Set(r.map((x) => x.p)).size === players, players + 'p: ranking lists every seat once');
    for (let i = 1; i < r.length; i++) {
      assert(r[i].score <= r[i - 1].score, 'ranking is best-first');
      assert(r[i].score === r[i - 1].score ? r[i].rank === r[i - 1].rank : r[i].rank === i + 1, 'equal scores share a rank, otherwise rank = position');
    }
    assert(r[0].rank === 1, 'top of the ranking is rank 1');
    if (w) assert(r[0].p === w && (players === 1 || r[1].score < r[0].score), players + 'p: winner is the sole leader');
    else { assert(r[1].score === r[0].score, players + 'p: winner 0 means the top score is shared'); ties++; }
    games++;
  }
}
console.log('full games', games, '- moves', moves, '- extra turns', extraTurns, '- tied games', ties);

// 4a. Deliberate three-way tie on a 4x4-dot board (9 boxes) with 3 players: hand each seat exactly three boxes.
{
  // Give a box to the current player by drawing its four sides, last side completing it. Sides may be shared, so
  // draw the three "free" sides first with pass-through of turns, then the closing side. Simpler: use a scripted
  // sequence and let the rules decide, then assert the score split we engineered.
  const s = g.newState(4, 3);
  // Non-scoring opening: every horizontal edge in rows 0..3 (12 edges, 3 seats x 4 each), no box completes
  // because no vertical edge exists yet.
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) assert(g.applyMove(s, H(r, c)).length === 0, 'horizontal opening scores nothing');
  assert(s.player === 1, 'after 12 non-scoring edges (3 seats x 4) seat 1 is to move again');
  // Now every box has 2 sides. Seat 1 draws v(0,0): box (0,0) gets its 3rd side, turn passes to seat 2.
  assert(g.applyMove(s, V(0, 0)).length === 0 && s.player === 2, 'seat 1 opens column 0');
  // Seat 2 draws v(0,1): completes box (0,0) (4 sides) -> extra turn; box (0,1) now 3 sides.
  assert(g.applyMove(s, V(0, 1)).length === 1 && s.player === 2 && s.scores[2] === 1, 'seat 2 completes (0,0) and keeps the turn');
  assert(g.applyMove(s, V(0, 2)).length === 1 && s.player === 2 && s.scores[2] === 2, 'seat 2 completes (0,1) and keeps the turn');
  assert(g.applyMove(s, V(0, 3)).length === 1 && s.player === 2 && s.scores[2] === 3, 'seat 2 completes (0,2) and keeps the turn');
  // Seat 2 now must move without scoring: v(1,0) gives box (1,0) a 3rd side, turn to seat 3.
  assert(g.applyMove(s, V(1, 0)).length === 0 && s.player === 3, 'seat 2 opens row 1, turn to seat 3');
  assert(g.applyMove(s, V(1, 1)).length === 1 && s.player === 3, 'seat 3 takes (1,0)');
  assert(g.applyMove(s, V(1, 2)).length === 1 && s.player === 3, 'seat 3 takes (1,1)');
  assert(g.applyMove(s, V(1, 3)).length === 1 && s.player === 3 && s.scores[3] === 3, 'seat 3 takes (1,2)');
  assert(g.applyMove(s, V(2, 0)).length === 0 && s.player === 1, 'seat 3 opens row 2, turn cycles back to seat 1');
  assert(g.applyMove(s, V(2, 1)).length === 1 && s.player === 1, 'seat 1 takes (2,0)');
  assert(g.applyMove(s, V(2, 2)).length === 1 && s.player === 1, 'seat 1 takes (2,1)');
  const last = g.applyMove(s, V(2, 3));
  assert(last.length === 1 && s.scores[1] === 3 && s.over, 'seat 1 takes (2,2) and the game ends');
  assert(s.scores[1] === 3 && s.scores[2] === 3 && s.scores[3] === 3, 'three-way 3-3-3 split');
  assert(g.winner(s) === 0, 'three-way tie reports no winner');
  const r = g.ranking(s);
  assert(r.every((x) => x.rank === 1), 'all three share rank 1 in a three-way tie');
  assert(g.applyMove(s, H(0, 0)) === null, 'no moves after the game is over');
}
// 4b. Same script with 5 players: seats 1..5 take 12 horizontals (5,5,2 -> seat 3 is next), then the chain
//     hands rows to whoever is on turn. Verify the late seats can win outright and ranking handles a 0 score.
{
  const s = g.newState(4, 5);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) g.applyMove(s, H(r, c));
  assert(s.player === 3, '12 edges over 5 seats leaves seat 3 to move');
  g.applyMove(s, V(0, 0));                       // seat 3 opens, turn -> seat 4
  assert(s.player === 4, 'turn passes 3 -> 4');
  for (const c of [1, 2, 3]) g.applyMove(s, V(0, c));   // seat 4 takes row 0 (3 boxes)
  assert(s.scores[4] === 3 && s.player === 4, 'seat 4 took three boxes and still has the turn');
  g.applyMove(s, V(1, 0));                       // seat 4 opens row 1, turn -> seat 5
  assert(s.player === 5, 'turn passes 4 -> 5');
  for (const c of [1, 2, 3]) g.applyMove(s, V(1, c));   // seat 5 takes row 1
  g.applyMove(s, V(2, 0));                       // seat 5 opens row 2, turn -> seat 1 (wraps)
  assert(s.player === 1, 'turn wraps 5 -> 1');
  for (const c of [1, 2]) g.applyMove(s, V(2, c));      // seat 1 takes two boxes
  assert(s.scores[1] === 2 && s.player === 1 && !s.over, 'seat 1 has two boxes and one edge remains');
  g.applyMove(s, V(2, 3));
  assert(s.over && s.scores[1] === 3, 'seat 1 takes the last box');
  assert(s.scores[1] + s.scores[2] + s.scores[3] + s.scores[4] + s.scores[5] === 9, '5p: scores sum to 9');
  assert(g.winner(s) === 0, '5p: 3-3-3 split among seats 1, 4, 5 is a tie');
  const r = g.ranking(s);
  assert(r.slice(0, 3).every((x) => x.rank === 1) && r[3].rank === 4 && r[4].rank === 4, '5p: ranks are 1,1,1,4,4');
  assert(r.slice(0, 3).map((x) => x.p).join() === '1,4,5', '5p: tied leaders listed in seat order');
}
// 4c. Outright win by the last seat.
{
  const s = g.newState(3, 4);   // 2x2 boxes = 4 boxes, 12 edges
  // 6 non-scoring horizontals: h(0,*), h(1,*), h(2,*) -> seats 1,2,3,4,1,2 play; seat 3 to move.
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) g.applyMove(s, H(r, c));
  assert(s.player === 3, '6 edges over 4 seats leaves seat 3 to move');
  g.applyMove(s, V(0, 0));   // seat 3 opens, -> seat 4
  g.applyMove(s, V(0, 1)); g.applyMove(s, V(0, 2));   // seat 4 takes (0,0),(0,1)
  g.applyMove(s, V(1, 0));   // seat 4 opens row 1 -> seat 1
  assert(s.player === 1 && s.scores[4] === 2, 'seat 4 has two, seat 1 to move');
  g.applyMove(s, V(1, 1)); g.applyMove(s, V(1, 2));   // seat 1 takes the rest
  assert(s.over && s.scores[1] === 2 && s.scores[4] === 2 && g.winner(s) === 0, '2-0-0-2 is a tie');
  const r = g.ranking(s);
  assert(r[0].p === 1 && r[1].p === 4 && r[0].rank === 1 && r[1].rank === 1 && r[2].rank === 3 && r[3].rank === 3, 'ranks 1,1,3,3');
  // Five seats on the same board: seats 2 and 3 open both rows, seat 4 sweeps every box and wins outright.
  const u = g.newState(3, 5);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) g.applyMove(u, H(r, c));   // 6 edges over 5 seats -> seat 2 to move
  assert(u.player === 2, '6 edges over 5 seats leaves seat 2 to move');
  g.applyMove(u, V(0, 0)); g.applyMove(u, V(1, 0));   // seats 2,3 open both rows; seat 4 to move
  assert(u.player === 4, 'two opening moves, seat 4 to move');
  for (const e of [V(0, 1), V(0, 2), V(1, 1), V(1, 2)]) g.applyMove(u, e);   // seat 4 sweeps all four boxes
  assert(u.over && u.scores[4] === 4 && g.winner(u) === 4, 'seat 4 wins outright with every box');
  const ru = g.ranking(u);
  assert(ru[0].p === 4 && ru[0].rank === 1 && ru.slice(1).every((x) => x.rank === 2 && x.score === 0), 'ranks 1,2,2,2,2');
}

console.log(failures ? failures + ' FAILURE(S)' : 'all checks passed');
process.exit(failures ? 1 : 0);
