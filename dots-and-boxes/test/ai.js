// Headless rules + AI check (no browser). Loads the pure game logic out of index.html and:
//  1. checks box completion, double-box completion, extra turns, turn passing and game end;
//  2. checks Normal takes a box when it can and never opens a box while a safe edge exists;
//  3. checks Hard, when forced to give away, opens the chain that costs the fewest boxes;
//  4. plays level-vs-level tournaments and prints the result mix.
// Run: node test/ai.js
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'))
  + '\nglobalThis.__dab = { newState, legalMoves, sides, boxesOf, applyMove, winner, classify, giveaway, aiMove, cloneState, distToSegment };';
const ctx = { Math, console, Array, Infinity, Map, JSON, Object }; ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const g = ctx.__dab;

let failures = 0;
const assert = (ok, msg) => { if (!ok) { failures++; console.log('FAIL', msg); } };
const H = (r, c) => ({ t: 'h', r, c }), V = (r, c) => ({ t: 'v', r, c });

// 1. Rules on the smallest board (2x2 dots, one box).
{
  const s = g.newState(2);
  assert(g.legalMoves(s).length === 4, '2x2 board has 4 edges');
  assert(g.applyMove(s, H(0, 0)).length === 0 && s.player === 2, 'first edge: no box, turn passes');
  assert(g.applyMove(s, H(1, 0)).length === 0 && s.player === 1, 'second edge: turn passes back');
  assert(g.applyMove(s, V(0, 0)).length === 0 && s.player === 2, 'third edge: turn passes');
  assert(g.applyMove(s, H(0, 0)) === null, 'replaying a filled edge is illegal');
  const claimed = g.applyMove(s, V(0, 1));
  assert(claimed.length === 1 && s.boxes[0][0] === 2 && s.scores[2] === 1, 'fourth edge completes the box for player 2');
  assert(s.over && s.remaining === 0 && g.winner(s) === 2, 'game ends when every edge is filled');
  assert(g.applyMove(s, H(0, 0)) === null, 'no moves after game over');
}
// 1b. One edge completing two boxes at once, and the extra turn that follows.
{
  const s = g.newState(3);   // 2x2 boxes
  for (const e of [H(0, 0), H(1, 0), V(0, 0), H(0, 1), H(1, 1), V(0, 2)]) g.applyMove(s, e);
  // Boxes (0,0) and (0,1) each have 3 sides; the shared edge v[0][1] is missing. Player 1 to move (6 moves, no boxes).
  assert(s.player === 1, 'player 1 to move after six non-scoring edges');
  assert(g.sides(s, 0, 0) === 3 && g.sides(s, 0, 1) === 3, 'both top boxes have three sides');
  assert(g.boxesOf(s, V(0, 1)).length === 2, 'shared edge borders two boxes');
  const claimed = g.applyMove(s, V(0, 1));
  assert(claimed.length === 2 && s.scores[1] === 2, 'one edge claims two boxes');
  assert(s.player === 1 && !s.over, 'completing a box keeps the turn');
  assert(g.classify(s, H(2, 0)).gives === false, 'bottom edge with 1 side drawn is safe');
}

// 2. Normal: random positions from Easy-vs-Easy play; check the two rules hold at every step.
let normalChecks = 0;
for (let game = 0; game < 200; game++) {
  const s = g.newState(4 + (game % 3));
  while (!s.over) {
    const moves = g.legalMoves(s), info = moves.map((e) => g.classify(s, e));
    const choice = g.aiMove(s, 'normal'), ck = g.classify(s, choice);
    if (info.some((m) => m.scores)) assert(ck.scores, 'normal takes an available box');
    else if (info.some((m) => !m.gives)) assert(!ck.gives, 'normal keeps a safe edge while one exists');
    normalChecks++;
    g.applyMove(s, moves[Math.floor(Math.random() * moves.length)]);   // advance with a random edge
  }
}
console.log('normal rules checked on', normalChecks, 'positions');

// 3. Hard: when there is no safe edge, its choice must give away the minimum.
let hardChecks = 0, hardSaved = 0;
for (let game = 0; game < 150; game++) {
  const s = g.newState(4 + (game % 3));
  while (!s.over) {
    const moves = g.legalMoves(s), info = moves.map((e) => g.classify(s, e));
    if (!info.some((m) => m.scores) && !info.some((m) => !m.gives)) {
      const costs = moves.map((e) => g.giveaway(s, e)), min = Math.min(...costs);
      const chosen = g.giveaway(s, g.aiMove(s, 'hard'));
      assert(chosen === min, 'hard gave ' + chosen + ' when ' + min + ' was possible');
      const normalCost = g.giveaway(s, g.aiMove(s, 'normal'));
      hardSaved += normalCost - min; hardChecks++;
    }
    g.applyMove(s, g.aiMove(s, 'normal'));
  }
}
console.log('hard forced-giveaway positions', hardChecks, '- boxes saved vs a normal pick', hardSaved);

// 4. Tournaments. AI A is player 1 in even games, player 2 in odd games.
function tournament(a, b, n, games) {
  const r = { win: 0, draw: 0, loss: 0 };
  for (let i = 0; i < games; i++) {
    const s = g.newState(n), aSide = i % 2 ? 2 : 1;
    let guard = 0;
    while (!s.over) {
      const e = g.aiMove(s, s.player === aSide ? a : b);
      assert(e && g.applyMove(s, e) !== null, a + '/' + b + ' made an illegal move');
      if (++guard > 500) { assert(false, 'game did not terminate'); break; }
    }
    const w = g.winner(s); r[w === aSide ? 'win' : w ? 'loss' : 'draw']++;
  }
  return r;
}
const T = [];
for (const [a, b, n] of [['normal', 'easy', 5], ['hard', 'normal', 5], ['hard', 'normal', 7], ['hard', 'easy', 5]]) {
  const r = tournament(a, b, n, 400);
  console.log((a + ' vs ' + b).padEnd(16), n + 'x' + n, 'x400: win', r.win, 'draw', r.draw, 'loss', r.loss);
  T.push({ a, b, n, r });
}
assert(T[0].r.win > 340, 'normal should beat easy at least 85% of the time');
assert(T[1].r.win > T[1].r.loss * 1.5, 'hard should clearly beat normal on 5x5');
assert(T[2].r.win > T[2].r.loss * 1.5, 'hard should clearly beat normal on 7x7');

// 5. The double-cross. Hard must be willing to DECLINE a box: taking every box you can reach is the
// beginner mistake, because whoever finishes a chain has to open the next one. This is a real position
// reached in play (4x4 dots, 9 boxes) where one scoring edge is available, v1,1, and taking it loses.
// Played out, declining ends +5 and taking ends -3 - an eight-box swing on a nine-box board.
// A win-rate check alone would not catch a regression to greedy here, so this pins the behaviour.
{
  const seq = ["v1,0","v1,2","h1,1","v0,1","h0,2","v0,0","v2,0","h3,2","v2,3","h2,0","v1,3","v0,3","h3,1","h0,0","h1,0"];
  const parse = (k) => ({ t: k[0], r: +k[1], c: +k.slice(3) });
  const s2 = g.newState(4, 2);
  for (const k of seq) g.applyMove(s2, parse(k));
  const moves = g.legalMoves(s2);
  const scoring = moves.filter((e) => g.classify(s2, e).scores);
  assert(scoring.length === 1, "the test position offers exactly one scoring edge (" + scoring.length + ")");

  // Deterministic: every candidate is compared by rollout, so the pick does not depend on the rng.
  const chosen = g.aiMove(s2, "hard", () => 0);
  assert(!g.classify(s2, chosen).scores, "hard declines the box rather than taking it (chose " + chosen.t + chosen.r + "," + chosen.c + ")");

  // And prove declining is the right call, so the assertion above is not just pinning a quirk.
  const playout = (st) => { const t = g.cloneState(st); let guard = 200;
    while (!t.over && guard-- > 0) {
      const mv = g.legalMoves(t).find((x) => g.classify(t, x).scores)
        || g.legalMoves(t).find((x) => !g.classify(t, x).gives) || g.legalMoves(t)[0];
      if (!mv) break; g.applyMove(t, mv);
    } return t.scores[1] - t.scores[2]; };
  const take = g.cloneState(s2); g.applyMove(take, scoring[0]);
  const decline = g.cloneState(s2); g.applyMove(decline, chosen);
  const a = playout(take), b = playout(decline);
  assert(b > a, "declining really does finish ahead of taking (" + b + " vs " + a + ")");
  console.log("double-cross position: declining ends " + b + ", taking ends " + a);

  // Normal must NOT decline - the levels have to stay distinct.
  const nChosen = g.aiMove(s2, "normal", () => 0);
  assert(g.classify(s2, nChosen).scores, "normal still takes the box, keeping the levels apart");
}

// 6. distToSegment: half of the pointer tolerance that decides whether a tap lands on an edge.
{
  const d = g.distToSegment;
  assert(Math.abs(d(5, 0, [0, 0], [10, 0])) < 1e-9, "a point on the segment is distance 0");
  assert(Math.abs(d(5, 3, [0, 0], [10, 0]) - 3) < 1e-9, "perpendicular distance from above the middle");
  assert(Math.abs(d(-4, 0, [0, 0], [10, 0]) - 4) < 1e-9, "past the start clamps to the start point");
  assert(Math.abs(d(14, 0, [0, 0], [10, 0]) - 4) < 1e-9, "past the end clamps to the end point");
  assert(Math.abs(d(3, 4, [0, 0], [0, 10]) - 3) < 1e-9, "works on a vertical segment too");
  assert(Math.abs(d(3, 4, [0, 0], [6, 8])) < 1e-9, "a point on a diagonal segment is distance 0");
  // (0,5) projects onto the 3-4-5 segment at (2.4, 1.8), which is 4 away.
  assert(Math.abs(d(0, 5, [0, 0], [4, 3]) - 4) < 1e-9, "perpendicular distance to a diagonal");
  // A zero-length segment gives l2 = 0, so the projection divides 0 by 0 and this returns NaN. Left
  // unguarded deliberately: the only caller builds each segment between two distinct dots, so the
  // degenerate case cannot arise, and a guard here would be dead code wearing the costume of safety.
  assert(Number.isNaN(d(0, 0, [3, 4], [3, 4])), "a zero-length segment is NaN, and cannot occur in play");
}

console.log(failures ? failures + ' FAILURE(S)' : 'all checks passed');
process.exit(failures ? 1 : 0);
