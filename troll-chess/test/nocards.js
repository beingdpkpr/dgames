// Headless check of Fusion Chess, the mode with no cards. One move a turn, always the Fusion rules, and
// a 50-move draw. Loads the pure section of index.html (everything above `// ---------- UI ----------`).
// Run: node test/nocards.js
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { Math, console, Array, Object, Number, String, JSON, Set, Map, Error, RegExp, Infinity };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const C = ctx.__cc;

let failures = 0, checks = 0;
const assert = (ok, msg) => { checks++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures++; };
const throws = (f) => { try { f(); return false; } catch (e) { return true; } };
const sq = (name) => (8 - +name[1]) * 8 + C.FILES.indexOf(name[0]);
const mv = (a, b) => ({ from: sq(a), to: sq(b) });
function rngFrom(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
// A no-cards game from a FEN, player 0 commanding `p0` and to move.
function troll(fen, p0 = 'w') {
  const s = C.newGame({ seed: 5, p0, cards: false });
  s.pos = C.fromFEN(fen, true).pos;
  s.turn = 0; s.phase = 'move'; s.movesLeft = 1; s.movesMade = 0;
  return s;
}

// ---------------------------------------------------------------- 1. no cards
{
  const s = C.newGame({ seed: 3, cards: false });
  assert(s.phase === 'move' && s.movesLeft === 1 && s.deck.length === 0, 'a game without cards starts straight in the move phase, one move, no deck');
  assert(throws(() => C.draw(s)), 'there is nothing to draw');
  C.playMove(s, mv('e2', 'e4'));
  assert(s.turn === 1 && s.phase === 'move' && s.movesLeft === 1, 'after one move the other side is straight to move');
  C.playMove(s, mv('e7', 'e5'));
  assert(s.turn === 0 && s.turnNo === 3, 'and back: plain alternating turns');
  const a = C.aiAction(s, 'normal', rngFrom(1));
  assert(a.type === 'move', 'the computer answers with a move, never a draw');
}

// ---------------------------------------------------------------- 2. cards or Fusion, never neither
{
  const s = C.newGame({ seed: 3, cards: false, fusion: false });
  assert(s.pos.fusion === true, 'asking for no cards and no Fusion still gets Fusion: there is no mode with neither');
  assert(C.newGame({ seed: 3, cards: true, fusion: false }).pos.fusion === false, 'with cards, fusion can be off (Card Chess)');
  const f = C.newGame({ seed: 3, cards: false });
  C.playMove(f, mv('g1', 'f3')); C.playMove(f, mv('a7', 'a6'));
  C.playMove(f, mv('g2', 'g3')); C.playMove(f, mv('a6', 'a5'));
  C.playMove(f, mv('f1', 'g2')); C.playMove(f, mv('a5', 'a4'));
  C.playMove(f, mv('f3', 'h4')); C.playMove(f, mv('a4', 'a3'));
  assert(C.legalMoves(f.pos, 'w').some((m) => m.fuse && m.from === sq('h4') && m.to === sq('g2')), 'Fusion moves are on offer without cards (knight h4 onto the bishop g2)');
}

// ---------------------------------------------------------------- 3. how games end
{
  // Fool's mate: checkmate ends it, as in chess.
  const s = C.newGame({ seed: 3, cards: false });
  C.playMove(s, mv('f2', 'f3')); C.playMove(s, mv('e7', 'e5'));
  C.playMove(s, mv('g2', 'g4')); C.playMove(s, mv('d8', 'h4'));
  assert(s.phase === 'over' && s.winner === 1 && s.reason === 'checkmate', "fool's mate: checkmate wins");
  // A check does not end anything special here: the other side simply has to answer it.
  const c = troll('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');
  C.playMove(c, mv('a1', 'a8'));
  assert(c.turn === 1 && c.phase === 'move' && c.winner === -1, 'a check is answered on the next move');
  // A Kning in check with no move still just waits; then its knight is lost, the king survives.
  // Black makes a quiet move; White's Kning on a1 is in check from c1 with nowhere to go.
  const g = troll('k7/8/8/8/8/8/PP6/E1rr4 b - - 0 1', 'b');
  C.playMove(g, mv('a8', 'b8'));
  assert(g.winner === -1 && g.phase === 'move' && g.turn === 0 && g.note === 'guarded', 'a Kning in check with no move passes rather than losing, straight back to the other side');
  C.playMove(g, mv('c1', 'a1'));
  assert(g.phase === 'move' && g.captured.w.join() === 'N' && g.pos.b.includes('wK'), 'which then takes the knight, and the king lives on');
  // 50 moves each with no capture and no pawn move.
  const q = troll('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');
  const shuffle = [['a1', 'a2'], ['e8', 'd8'], ['a2', 'a1'], ['d8', 'e8']];
  let i = 0;
  while (q.phase !== 'over' && i < 200) { const [f, t] = shuffle[i % 4]; C.playMove(q, mv(f, t)); i++; }
  assert(q.phase === 'over' && q.winner === -1 && i === C.QUIET_LIMIT, `100 quiet moves (50 each) draw the game (${i} played)`);
}

// ---------------------------------------------------------------- 3b. a stuck Kning is taken, not waited on
{
  // From a real game: White's Kning on e4 is in check (queen d3) and every square it could go to is
  // covered, so White can only pass. Normal used to shuffle for 101 moves until the 50-move draw, because
  // it scored the stuck Kning as a knight already won. It must take the Kning at once.
  const fen = '8/8/8/3m1b2/4E3/1k1q1p2/1P5P/8 b - - 0 1';
  assert(C.legalMoves(C.fromFEN(fen.replace(' b ', ' w '), true).pos, 'w').length === 0, 'the position: White\'s Kning is in check with no legal move');
  for (const level of ['easy', 'normal', 'hard']) {
    const s = troll(fen, 'w');
    s.turn = 1;
    const a = C.aiAction(s, level, rngFrom(4));
    assert(a.type === 'move' && a.m.to === sq('e4'), `${level}: takes the stuck Kning straight away`);
    C.apply(s, a);
    assert(s.turn === 0 && s.captured.w.join() === 'N' || s.phase === 'over', `${level}: and White is back to move (or the game is over)`);
  }
}

// ---------------------------------------------------------------- 4. the computer plays it
{
  let errors = 0, finished = 0, draws = 0, worst = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const s = C.newGame({ seed, p0: seed % 2 ? 'w' : 'b', cards: false });
    const rand = rngFrom(seed);
    try {
      while (s.phase !== 'over' && s.turnNo <= 400) {
        const t = Date.now();
        C.apply(s, C.aiAction(s, seed % 3 ? 'normal' : 'easy', rand));
        worst = Math.max(worst, Date.now() - t);
      }
      if (s.phase === 'over') { finished++; if (s.winner < 0) draws++; }
    } catch (e) { errors++; console.log('     seed ' + seed + ': ' + e.message); }
  }
  assert(errors === 0, `8 no-card games, computer against computer, with every move accepted`);
  assert(finished === 8, `all 8 end (${finished - draws} decisive, ${draws} drawn): the 50-move rule stops a shuffle`);
  assert(worst < 2000, `slowest decision ${worst}ms`);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
