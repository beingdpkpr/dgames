// Headless check of the chess rules and the card rules (no browser). Loads the pure section of index.html
// with node's vm -- everything above the `// ---------- UI ----------` marker -- and drives it directly.
// Run: node test/rules.js
//
// The move generator is checked with perft, the standard proof for chess engines: count every move
// sequence to a fixed depth and compare with totals everyone agrees on. A wrong castling, en passant or
// promotion rule changes those numbers.
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
const names = (list) => list.map(C.sqName).sort().join(',');
const mv = (a, b, promo) => ({ from: sq(a), to: sq(b), promo });

// A game from a FEN, with player 0 commanding `p0` and to move, and the given cards on top of the deck
// (the first one is drawn first).
function game(fen, p0 = 'w', cards = []) {
  const s = C.newGame({ seed: 5, p0 });
  s.pos = C.fromFEN(fen).pos;
  s.turn = 0;
  for (const k of cards.slice().reverse()) s.deck.push({ k, col: 'r' });
  return s;
}

// ---------------------------------------------------------------- 1. perft
{
  const t = Date.now();
  const start = C.startPos();
  assert([1, 2, 3].map((d) => C.perft(start, 'w', d)).join(',') === '20,400,8902', 'perft from the start: 20, 400, 8902');
  const kiwi = C.fromFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1').pos;
  assert([1, 2, 3].map((d) => C.perft(kiwi, 'w', d)).join(',') === '48,2039,97862', 'perft "Kiwipete" (castling, en passant, promotion, pins): 48, 2039, 97862');
  const p3 = C.fromFEN('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1').pos;
  assert([1, 2, 3, 4].map((d) => C.perft(p3, 'w', d)).join(',') === '14,191,2812,43238', 'perft position 3 (en passant that would expose the king): 14, 191, 2812, 43238');
  const p4 = C.fromFEN('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1').pos;
  assert([1, 2, 3].map((d) => C.perft(p4, 'w', d)).join(',') === '6,264,9467', 'perft position 4 (promotions with capture, castling under attack): 6, 264, 9467');
  console.log(`     perft took ${Date.now() - t}ms`);
}

// ---------------------------------------------------------------- 2. the deck
{
  const d = C.buildDeck();
  const count = (k) => d.filter((c) => c.k === k).length;
  assert(d.length === 40, 'the deck is 40 cards');
  assert(C.DECK_MIX.every(([k, n]) => count(k) === n), 'deck mix: ' + C.DECK_MIX.map(([k, n]) => `${n}x ${k}`).join(', '));
  const a = C.newGame({ seed: 11 }), b = C.newGame({ seed: 11 }), c = C.newGame({ seed: 12 });
  assert(JSON.stringify(a.deck) === JSON.stringify(b.deck) && JSON.stringify(a.deck) !== JSON.stringify(c.deck), 'the shuffle is reproducible from the seed, and differs between seeds');
  // draw the whole deck with Skips only (nothing on the board changes), then once more: it reshuffles
  const s = C.newGame({ seed: 3 });
  s.deck = s.deck.map(() => ({ k: 'skip', col: 'r' }));
  for (let i = 0; i < 40; i++) C.draw(s);
  assert(s.deck.length === 0 && s.discard.length === 40, '40 draws empty the deck into the discard pile');
  C.draw(s);
  assert(s.deck.length === 39 && s.discard.length === 1 && s.reshuffles === 1,'drawing from an empty deck reshuffles the discard pile into it');
  const w = C.newGame({ seed: 1, p0: 'w' }), bl = C.newGame({ seed: 1, p0: 'b' });
  assert(C.myCol(w) === 'w' && w.turn === 0 && C.myCol(bl) === 'w' && bl.turn === 1, 'White moves first, whichever player commands it');
}

// ---------------------------------------------------------------- 3. number cards
{
  const s = game('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'w', ['3', '1']);
  assert(throws(() => C.playMove(s, mv('e2', 'e4'))), 'no move before drawing');
  C.draw(s);
  assert(s.phase === 'move' && s.movesLeft === 3, 'a 3 gives three moves');
  assert(throws(() => C.endEarly(s)), 'cannot end the turn before the first move');
  C.playMove(s, mv('e2', 'e4')); C.playMove(s, mv('d2', 'd4'));
  assert(s.turn === 0 && s.movesLeft === 1, 'the same player keeps moving, with any pieces');
  assert(throws(() => C.playMove(s, mv('e7', 'e5'))), "the opponent's pieces can't be moved");
  C.playMove(s, mv('g1', 'f3'));
  assert(s.turn === 1 && s.phase === 'draw', 'the third move ends the turn');
  C.draw(s); C.playMove(s, mv('e7', 'e5'));
  assert(s.turn === 0 && s.phase === 'draw', 'a 1 is one move');

  const e = game('4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'w', ['2']);
  C.draw(e); C.playMove(e, mv('e1', 'e2')); C.endEarly(e);
  assert(e.turn === 1 && e.phase === 'draw', 'a 2 can be ended after one move');

  const k = game('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'w', ['3']);
  C.draw(k); const r = C.playMove(k, mv('a1', 'a8'));
  assert(r.check && k.turn === 1 && k.note === 'check', 'giving check ends the turn, with moves still unused');

  const own = game('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1', 'w', ['1']);
  C.draw(own);
  assert(throws(() => C.playMove(own, mv('e1', 'f2'))), 'a king in check may not step onto another attacked square (Kf2)');
  C.playMove(own, mv('e1', 'd1'));
  assert(own.turn === 1, 'and does get out of it (Kd1)');
  const pin = game('4k3/4r3/8/8/8/8/4B3/4K3 w - - 0 1', 'w', ['1']);
  C.draw(pin);
  assert(throws(() => C.playMove(pin, mv('e2', 'd3'))), 'a pinned piece cannot leave the pin line');
}

// ---------------------------------------------------------------- 4. winning
{
  // Fool's mate: White is in check with no legal move and draws a number card.
  const fool = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
  const m = game(fool, 'w', ['1']);
  C.draw(m);
  assert(m.phase === 'over' && m.winner === 1 && m.reason === 'checkmate', 'a number card in checkmate loses');
  // The same position with a Skip: White cannot answer, and Black takes the king.
  const k = game(fool, 'w', ['skip', '1']);
  C.draw(k);
  assert(k.phase === 'draw' && k.turn === 1 && k.note === 'skip', 'Skip passes the turn, even in check');
  C.draw(k);
  assert(C.legalMoves(k.pos, 'b').some((x) => x.from === sq('h4') && x.to === sq('e1')), 'taking the king is a legal move when it was left in check');
  C.playMove(k, mv('h4', 'e1'));
  assert(k.phase === 'over' && k.winner === 1 && k.reason === 'king', 'capturing the king wins');
  // Stalemate: no move and not in check. The turn passes; nobody wins.
  const st = game('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', 'b', ['2']);
  C.draw(st);
  assert(st.phase === 'draw' && st.turn === 1 && st.note === 'nomove' && st.winner === -1, 'no legal move and no check: the turn passes');
}

// ---------------------------------------------------------------- 5. Skip and Reverse
{
  const s = game('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'w', ['skip']);
  const before = JSON.stringify(s.pos);
  C.draw(s);
  assert(s.turn === 1 && JSON.stringify(s.pos) === before, 'Skip: the board is untouched and the turn passes');

  const r = game('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'w', ['rev', '1', '1']);
  C.draw(r);
  assert(r.army[0] === 'b' && r.army[1] === 'w' && r.turn === 1 && r.note === 'rev', 'Reverse: the armies swap and the turn ends');
  assert(C.myCol(r) === 'w', 'the next player now commands White');
  C.draw(r); C.playMove(r, mv('e2', 'e4'));
  assert(r.turn === 0 && C.myCol(r) === 'b', 'and the player who drew Reverse now plays Black');
  C.draw(r);
  assert(throws(() => C.playMove(r, mv('d2', 'd4'))) && !throws(() => C.playMove(r, mv('e7', 'e5'))), 'they can move Black pieces and not White ones');
}

// ---------------------------------------------------------------- 6. Draw 2
{
  // Black king on e8: top half, right half. The quarter diagonally opposite is a1-d4.
  const s = game('4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'w', ['d2']);
  s.captured.w = ['Q', 'N', 'P'];
  C.draw(s);
  assert(s.phase === 'revive' && s.revivesLeft === 2, 'Draw 2 starts the revive phase');
  const quad = names(C.quadrantOf(s));
  assert(quad === names(['a1', 'b1', 'c1', 'd1', 'a2', 'b2', 'c2', 'd2', 'a3', 'b3', 'c3', 'd3', 'a4', 'b4', 'c4', 'd4'].map(sq)), 'king on e8: the revive quarter is a1-d4');
  const q = C.reviveTargets(s, 'Q');
  assert(q.every((x) => C.quadrantOf(s).includes(x) && !s.pos.b[x]), 'every revive square is empty and inside the quarter');
  assert(!q.includes(sq('a4')), 'a queen may not go on a4, where it would attack e8 along the diagonal');
  assert(q.every((x) => { const t = { b: s.pos.b.slice(), castle: '', ep: -1 }; t.b[x] = 'wQ'; return !C.inCheck(t, 'b'); }), 'no revived queen ever gives check');
  assert(throws(() => C.revive(s, 'Q', sq('a4'))) && throws(() => C.revive(s, 'Q', sq('h1'))), 'reviving outside the allowed squares is refused');
  assert(throws(() => C.revive(s, 'R', sq('a1'))), 'only pieces that were actually captured come back');
  C.revive(s, 'Q', sq('b2'));
  assert(s.pos.b[sq('b2')] === 'wQ' && s.captured.w.join() === 'N,P' && s.phase === 'revive', 'the first revive places the piece and leaves one more');
  C.revive(s, 'N', sq('c3'));
  assert(s.phase === 'draw' && s.turn === 1 && s.captured.w.join() === 'P', 'two revives end the turn');

  const none = game('4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'w', ['d2']);
  C.draw(none);
  assert(none.phase === 'draw' && none.turn === 1 && none.note === 'nocaptured', 'with nothing captured, Draw 2 just ends the turn');

  const early = game('4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'w', ['d2']);
  early.captured.w = ['R', 'B'];
  C.draw(early); C.revive(early, 'R', sq('a1')); C.reviveDone(early);
  assert(early.turn === 1 && early.captured.w.join() === 'B', 'a player may stop after one revive');

  // Black king on h1: the quarter is a8-d5, which holds White's last rank. Pawns go no further than the 7th.
  const p = game('8/8/8/8/8/8/8/K6k w - - 0 1', 'w', ['d2']);
  p.captured.w = ['P'];
  C.draw(p);
  const pt = C.reviveTargets(p, 'P');
  assert(pt.length && pt.every((x) => (x >> 3) !== 0) && pt.includes(sq('a7')), "a pawn is never revived on its last rank; the 7th is fine");
  assert(C.reviveTargets(p, 'R').some((x) => (x >> 3) === 0), 'other pieces may use that rank');

  // No room: every square of the quarter full or attacking the king.
  const full = game('4k3/8/8/8/PPPP4/PPPP4/PPPP4/PPPPK3 w - - 0 1', 'w', ['d2']);
  full.captured.w = ['Q'];
  C.draw(full);
  assert(full.turn === 1 && full.note === 'noroom', 'with no square free, the piece cannot be revived and the turn ends');

  // A captured promoted piece goes back to the pool as a pawn.
  const pr = game('4k3/8/8/8/8/8/8/4K3 b - - 0 1', 'b', ['1']);
  pr.pos.b[sq('d7')] = 'wQ+'; pr.pos.b[sq('c8')] = 'bB';
  C.draw(pr); C.playMove(pr, mv('c8', 'd7'));
  assert(pr.captured.w.join() === 'P', 'a promoted queen, once captured, comes back as a pawn');
  const kn = game('4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'w');
  kn.pos.b[sq('f6')] = 'wN+';
  assert(C.inCheck(kn.pos, 'b'), 'a promoted knight still gives check');
}

// ---------------------------------------------------------------- 7. Wild
{
  // The bishop on e2 is pinned by the rook on e8 and must stay on the e-file; e4 would check a8.
  const s = game('k3r3/8/8/8/8/8/4B3/4K3 w - - 0 1', 'w', ['wild']);
  C.draw(s);
  assert(s.phase === 'wild', 'Wild starts the placement phase');
  assert(names(C.wildTargets(s, sq('e2'))) === names(['e3', 'e5', 'e6', 'e7'].map(sq)), 'a pinned bishop may only go along the pin, and not where it checks the king (e3, e5, e6, e7)');
  assert(throws(() => C.wild(s, sq('e2'), sq('a6'))), 'a Wild that exposes your own king is refused');
  const kt = C.wildTargets(s, sq('e1'));
  assert(kt.length > 0 && !kt.includes(sq('e7')) && !kt.includes(sq('b7')), 'the king itself can be moved, never onto an attacked square');
  C.wild(s, sq('e2'), sq('e6'));
  assert(s.pos.b[sq('e6')] === 'wB' && !s.pos.b[sq('e2')] && s.turn === 1, 'the piece moves and the turn ends');

  const d = game('4k3/8/8/8/8/8/8/R3KB2 w Q - 0 1', 'w', ['wild']);
  C.draw(d);
  const rt = C.wildTargets(d, sq('a1'));
  assert(rt.length > 0 && rt.every((x) => (x & 7) !== 4 && (x >> 3) !== 0), 'a rook may not go to the e-file or the 8th rank, where it would check e8');
  C.wild(d, sq('a1'), sq('b3'));
  assert(!d.pos.castle.includes('Q'), 'a rook moved by a Wild loses its castling right');

  const disc = game('4k3/8/8/8/8/8/4N3/4R2K w - - 0 1', 'w', ['wild']);
  C.draw(disc);
  const dt = C.wildTargets(disc, sq('e2'));
  assert(dt.length > 0 && dt.every((x) => (x & 7) === 4),'a piece that blocks a check on the enemy king may not step off the line (no discovered check)');

  const pw = game('4k3/8/8/8/8/8/P7/7K w - - 0 1', 'w', ['wild']);
  C.draw(pw);
  assert(C.wildTargets(pw, sq('a2')).every((x) => (x >> 3) !== 0), 'a pawn is never put on its last rank');
  C.wildPass(pw);
  assert(pw.turn === 1, 'a Wild can be declined');
}

// ---------------------------------------------------------------- 8. castling and en passant inside a turn
{
  const s = game('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'w', ['2']);
  C.draw(s);
  C.playMove(s, { from: sq('e1'), to: sq('g1') });
  assert(s.pos.b[sq('g1')] === 'wK' && s.pos.b[sq('f1')] === 'wR' && !s.pos.castle.includes('K') && !s.pos.castle.includes('Q'), 'castling moves the rook and spends both rights');
  const ep = game('4k3/8/8/8/5p2/8/4P3/4K3 w - - 0 1', 'w', ['1', '1']);
  C.draw(ep); C.playMove(ep, mv('e2', 'e4'));
  C.draw(ep); C.playMove(ep, mv('f4', 'e3'));
  assert(!ep.pos.b[sq('e4')] && ep.pos.b[sq('e3')] === 'bP' && ep.captured.w.join() === 'P', 'en passant across a turn boundary works');
  const late = game('4k3/8/8/8/5p2/8/4P3/4K3 w - - 0 1', 'w', ['2', '1']);
  C.draw(late); C.playMove(late, mv('e2', 'e4')); C.playMove(late, mv('e1', 'd1'));
  C.draw(late);
  assert(!C.legalMoves(late.pos, 'b').some((x) => x.ep), 'en passant expires once any other move is made, even by the same player');
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
