// Headless AI check (no browser). Loads the pure game logic out of index.html and:
//  1. walks every possible opponent line against the Hard AI (both sides, both to move first)
//     and asserts the AI never loses;
//  2. checks Normal takes a win, blocks a loss, and takes the centre;
//  3. plays 2000 random games per level and prints the result mix.
// Run: node test/ai.js
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'))
  + "\nglobalThis.__ttt = { winner, empties, isOver, completing, bestMoves, aiMove, other };";
const ctx = { Math, console, Array, Infinity, Map }; ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const g = ctx.__ttt;

let failures = 0;
const assert = (ok, msg) => { if (!ok) { failures++; console.log('FAIL', msg); } };

// 1. Exhaustive: for every opponent move, for every optimal AI reply, the AI must not lose.
let nodes = 0, leaves = { win: 0, draw: 0, loss: 0 };
function walk(b, me, turn) {
  nodes++;
  const w = g.winner(b);
  if (w || !g.empties(b).length) { leaves[w === me ? 'win' : w ? 'loss' : 'draw']++; return; }
  const moves = turn === me ? g.bestMoves(b.slice(), me) : g.empties(b);
  for (const i of moves) { b[i] = turn; walk(b, me, g.other(turn)); b[i] = ''; }
}
for (const me of ['X', 'O']) for (const first of ['X', 'O']) walk(Array(9).fill(''), me, first);
console.log('hard exhaustive: nodes', nodes, 'leaves', JSON.stringify(leaves));
assert(leaves.loss === 0, 'hard AI lost in ' + leaves.loss + ' lines');
assert(leaves.win > 0, 'hard AI never wins against blunders');

// 2. Normal heuristics.
const B = (s) => s.split('').map(c => (c === '.' ? '' : c));
assert(g.aiMove(B('XX.OO....'), 'X', 'normal') === 2, 'normal takes the win');
assert(g.aiMove(B('OO.X....X'), 'X', 'normal') === 2, 'normal blocks the loss');
assert(g.aiMove(B('X........'), 'O', 'normal') === 4, 'normal takes the centre');
assert([0, 2, 6, 8].includes(g.aiMove(B('....X....'), 'O', 'normal')), 'normal takes a corner after centre');
assert(g.aiMove(B('XOXXOOOXX'), 'X', 'normal') === -1, 'full board returns -1');

// 3. Random opponent, 2000 games per level, AI alternates side and who starts.
for (const level of ['easy', 'normal', 'hard']) {
  const r = { win: 0, draw: 0, loss: 0 };
  for (let n = 0; n < 2000; n++) {
    const me = n % 2 ? 'X' : 'O'; let turn = n % 4 < 2 ? 'X' : 'O'; const b = Array(9).fill('');
    while (!g.isOver(b)) {
      const i = turn === me ? g.aiMove(b, me, level) : g.empties(b)[Math.floor(Math.random() * g.empties(b).length)];
      assert(i >= 0 && i < 9 && b[i] === '', level + ' made an illegal move ' + i); if (b[i]) break;
      b[i] = turn; turn = g.other(turn);
    }
    const w = g.winner(b); r[w === me ? 'win' : w ? 'loss' : 'draw']++;
  }
  console.log(level.padEnd(7), 'vs random x2000: win', r.win, 'draw', r.draw, 'loss', r.loss);
  if (level === 'hard') assert(r.loss === 0, 'hard lost vs random');
  if (level === 'normal') assert(r.loss < 100, 'normal loses too often vs random: ' + r.loss);
}

console.log(failures ? failures + ' FAILURE(S)' : 'all checks passed');
process.exit(failures ? 1 : 0);
