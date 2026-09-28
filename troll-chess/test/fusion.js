// Headless check of Fusion mode: the Knook (rook+knight), the Knishop (bishop+knight) and the Kning
// (king+knight), and a pawn dropped by a Wild being taken en passant. Loads the pure section of
// index.html (everything above `// ---------- UI ----------`). Run: node test/fusion.js
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
// A game from a FEN (Fusion unless told otherwise), player 0 commanding `p0` and to move, cards on top.
function game(fen, p0 = 'w', cards = [], fusion = true) {
  const s = C.newGame({ seed: 5, p0, fusion });
  s.pos = C.fromFEN(fen, fusion).pos;
  s.turn = 0;
  for (const k of cards.slice().reverse()) s.deck.push({ k, col: 'r' });
  return s;
}
const from = (pos, col, a) => C.legalMoves(pos, col).filter((m) => m.from === sq(a));

// ---------------------------------------------------------------- 1. how the fused pieces move
{
  assert(from(C.fromFEN('4k3/8/8/8/3M4/8/8/4K3 w - -', true).pos, 'w', 'd4').length === 22, 'Knook on d4: 14 rook moves + 8 knight moves');
  assert(from(C.fromFEN('4k3/8/8/8/3A4/8/8/4K3 w - -', true).pos, 'w', 'd4').length === 21, 'Knishop on d4: 13 bishop moves + 8 knight moves');
  const kn = from(C.fromFEN('k7/8/8/8/3E4/8/8/8 w - -', true).pos, 'w', 'd4');
  assert(kn.length === 16 && kn.every((m) => Math.max(Math.abs((m.to >> 3) - 4), Math.abs((m.to & 7) - 3)) <= 2), 'Kning on d4: one or two squares along any of the 8 king lines (16)');
  assert(!kn.some((m) => m.to === sq('e6') || m.to === sq('b3')), 'the Kning does not jump like a knight');
  assert(from(C.fromFEN('k7/8/8/3P4/3E4/8/8/8 w - -', true).pos, 'w', 'd4').length === 14, 'a piece next to the Kning blocks its second step on that line');
  const a = C.fromFEN('k7/8/8/8/8/8/8/3E4 w - -', true).pos;
  const b = C.fromFEN('k7/8/8/8/8/8/3P4/3E4 w - -', true).pos;
  assert(C.attacked(a, sq('d3'), 'w') && !C.attacked(b, sq('d3'), 'w'), 'the Kning attacks two squares away, unless something is in between');
  assert(C.attacked(C.fromFEN('k7/8/8/8/8/2M5/8/8 w - -', true).pos, sq('d5'), 'w') && C.attacked(C.fromFEN('k7/8/8/8/8/2A5/8/8 w - -', true).pos, sq('b5'), 'w'), 'Knook and Knishop attack with their knight jumps too');
}

// ---------------------------------------------------------------- 2. fusing by moving
{
  const s = game('4k3/8/8/8/8/1N6/8/R3K3 w Q - 0 1', 'w', ['3']);
  C.draw(s);
  C.playMove(s, mv('b3', 'a1'));
  assert(s.pos.b[sq('a1')] === 'wM' && !s.pos.b[sq('b3')] && !s.pos.castle.includes('Q'), 'a knight moving onto its rook makes a Knook (and the rook can no longer castle)');
  const r = game('4k3/8/8/8/8/8/8/1N1RK3 w - - 0 1', 'w', ['1']);
  C.draw(r); C.playMove(r, mv('d1', 'b1'));
  assert(r.pos.b[sq('b1')] === 'wM', 'a rook moving onto its knight makes a Knook too');
  const b = game('4k3/8/8/8/8/8/3N4/2B1K3 w - - 0 1', 'w', ['1']);
  C.draw(b); C.playMove(b, mv('c1', 'd2'));
  assert(b.pos.b[sq('d2')] === 'wA', 'a bishop moving onto its knight makes a Knishop');
  const k = game('4k3/8/8/8/8/8/3N4/4K3 w - - 0 1', 'w', ['1']);
  C.draw(k); C.playMove(k, mv('e1', 'd2'));
  assert(k.pos.b[sq('d2')] === 'wE', 'the king stepping onto its knight makes a Kning');
  const k2 = game('4k3/8/8/8/8/5N2/8/4K3 w - - 0 1', 'w', ['1']);
  C.draw(k2); C.playMove(k2, mv('f3', 'e1'));
  assert(k2.pos.b[sq('e1')] === 'wE', 'and so does the knight jumping onto its king');
  const q = C.fromFEN('4k3/8/8/8/8/8/3N4/3QK3 w - -', true).pos;
  assert(!C.legalMoves(q, 'w').some((m) => m.fuse && m.from === sq('d1')), 'a queen does not fuse');
  assert(!C.legalMoves(C.fromFEN('4k3/8/8/8/8/8/3M4/3N3K w - -', true).pos, 'w').some((m) => m.fuse), 'a fused piece does not fuse again');
  assert(!C.legalMoves(C.fromFEN('4k3/8/8/8/8/1N6/8/R3K3 w - -', false).pos, 'w').some((m) => m.fuse), 'no fusing in a classic game');
}

// ---------------------------------------------------------------- 3. capturing fused pieces
{
  const s = game('4k3/8/8/8/8/8/8/r2MK3 b - - 0 1', 'b', ['1']);
  C.draw(s); C.playMove(s, mv('a1', 'd1'));
  assert(s.captured.w.slice().sort().join() === 'N,R', 'a captured Knook goes back to the pool as a rook and a knight');
  const p = game('4k3/8/8/8/8/8/8/r2MK3 b - - 0 1', 'b', ['1']);
  p.pos.b[sq('d1')] = 'wMr';
  C.draw(p); C.playMove(p, mv('a1', 'd1'));
  assert(p.captured.w.slice().sort().join() === 'N,P', 'a Knook whose rook came from a promotion gives back a pawn and a knight');
  assert(C.partsOf('bA').slice().sort().join() === 'B,N' && C.partsOf('bE').join() === 'N', 'a Knishop splits into bishop and knight; a Kning gives up only its knight');

  // The Kning is left in check on e1 and the rook takes it: the knight is lost, the king steps to d2.
  const e = game('4k3/8/8/8/8/8/8/r3E3 b - - 0 1', 'b', ['1']);
  C.draw(e);
  const res = C.playMove(e, mv('a1', 'e1'));
  assert(e.phase !== 'over' && e.captured.w.join() === 'N' && e.pos.b[sq('d2')] === 'wK' && res.escape === sq('d2'), 'taking a Kning: the knight is captured, the king steps to the roomiest safe neighbour (d2)');
  assert(!C.attacked(e.pos, sq('d2'), 'b'), 'the square it steps to is safe');
  // A queen next to the Kning covers every neighbouring square: the king goes two squares away instead.
  const q = game('k7/8/8/8/8/8/3q4/4E3 b - - 0 1', 'b', ['1']);
  C.draw(q);
  const qr = C.playMove(q, mv('d2', 'e1'));
  const dist = Math.max(Math.abs((qr.escape >> 3) - 7), Math.abs((qr.escape & 7) - 4));
  assert(q.phase !== 'over' && qr.escape >= 0 && dist === 2 && q.pos.b[qr.escape] === 'wK' && !C.attacked(q.pos, qr.escape, 'b'),
    `taken by a queen with no safe neighbour, the king goes to a safe square two away (${C.sqName(qr.escape)})`);
  // Nothing safe within two squares: the king goes with the knight.
  const x = game('k7/8/8/8/8/1pp5/1pp5/E6r b - - 0 1', 'b', ['1']);
  C.draw(x); C.playMove(x, mv('h1', 'a1'));
  assert(x.phase === 'over' && x.winner === 0 && x.reason === 'king', 'with no safe square within two, taking the Kning takes the king and wins');
}

// ---------------------------------------------------------------- 3b. checking a Kning does not end the turn
{
  const s = game('k7/8/8/8/8/8/7r/4E3 b - - 0 1', 'b', ['2']);
  C.draw(s);
  const r = C.playMove(s, mv('h2', 'h1'));
  assert(r.check && s.turn === 0 && s.phase === 'move' && s.movesLeft === 1, 'checking a Kning with a 2 leaves the second move');
  assert(C.inCheck(s.pos, 'w'), 'the Kning still shows as in check');
  C.playMove(s, mv('h1', 'e1'));
  assert(s.pos.b[sq('e1')] === 'bR' && s.captured.w.join() === 'N' && s.pos.b.includes('wK'), 'and the second move can take it (the king escapes)');
  const k = game('k7/8/8/8/8/8/7r/4K3 b - - 0 1', 'b', ['2']);
  C.draw(k); C.playMove(k, mv('h2', 'h1'));
  assert(k.turn === 1 && k.note === 'check', 'checking a plain king still ends the turn');
}

// ---------------------------------------------------------------- 4. the Kning is not mated
{
  const g = game('k7/8/8/8/8/8/PP6/E1rr4 w - - 0 1', 'w', ['1']);
  C.draw(g);
  assert(g.phase === 'draw' && g.turn === 1 && g.note === 'guarded' && g.winner === -1, 'a Kning in check with no legal move is not checkmated: the turn passes');
  const k = game('k7/8/8/8/8/8/PP6/K1rr4 w - - 0 1', 'w', ['1']);
  C.draw(k);
  assert(k.phase === 'over' && k.winner === 1 && k.reason === 'checkmate', 'the same position with a plain king is checkmate');
}

// ---------------------------------------------------------------- 5. Draw 2 fusions
{
  // Black king on e8: the quarter is a1-d4. Rook on b2 is in it, the bishop on h1 is not, the king is on e1.
  const s = game('4k3/8/8/8/B7/8/1R6/4K2B w - - 0 1', 'w', ['d2']);
  s.captured.w = ['N', 'N'];
  C.draw(s);
  const t = C.reviveTargets(s, 'N');
  assert(t.includes(sq('b2')), 'a knight can be revived onto a rook in the quarter (making a Knook)');
  assert(t.includes(sq('e1')), 'and onto its own king, outside the quarter (making a Kning)');
  assert(!t.includes(sq('h1')), 'but not onto a bishop outside the quarter');
  assert(!t.includes(sq('a4')), 'nor onto the a4 bishop, where the Knishop would attack e8');
  assert(!C.reviveTargets(s, 'R').includes(sq('b2')), 'only a knight fuses on revival');
  C.revive(s, 'N', sq('b2')); C.revive(s, 'N', sq('e1'));
  assert(s.pos.b[sq('b2')] === 'wM' && s.pos.b[sq('e1')] === 'wE' && s.turn === 1, 'the revived knights fuse where they land');
  // Why it matters: in check, holding a Draw 2, a knight on the king is the only shield there is.
  const c = game('4k3/8/8/8/8/8/8/r3K3 w - - 0 1', 'w', ['d2', '1']);
  c.captured.w = ['N'];
  C.draw(c); C.revive(c, 'N', sq('e1'));
  C.draw(c); C.playMove(c, mv('a1', 'e1'));
  assert(c.phase !== 'over' && c.pos.b.filter((p) => p === 'wK').length === 1, 'a king in check shielded by a revived knight survives the capture');
  const classic = game('4k3/8/8/8/8/8/8/r3K3 w - - 0 1', 'w', ['d2'], false);
  classic.captured.w = ['N'];
  C.draw(classic);
  assert(!C.reviveTargets(classic, 'N').includes(sq('e1')) || classic.phase !== 'revive', 'no reviving onto the king in a classic game');
}

// ---------------------------------------------------------------- 6. a Wild pawn can be taken en passant
{
  const s = game('4k3/8/8/8/3p4/8/P7/4K3 w - - 0 1', 'w', ['wild', '1']);
  C.draw(s); C.wild(s, sq('a2'), sq('c4'));
  C.draw(s);
  const ep = C.legalMoves(s.pos, 'b').find((m) => m.from === sq('d4') && m.to === sq('c3'));
  assert(ep && ep.ep, 'a pawn dropped by a Wild beside an enemy pawn can be taken en passant');
  C.playMove(s, ep);
  assert(!s.pos.b[sq('c4')] && s.pos.b[sq('c3')] === 'bP' && s.captured.w.join() === 'P', 'and the capture removes it');
  const late = game('4k3/8/8/8/3p4/8/P7/4K3 w - - 0 1', 'w', ['wild', '2']);
  C.draw(late); C.wild(late, sq('a2'), sq('c4'));
  C.draw(late); C.playMove(late, mv('e8', 'e7'));
  assert(!C.legalMoves(late.pos, 'b').some((m) => m.ep), 'only on the very next move');
  const classic = game('4k3/8/8/8/3p4/8/P7/4K3 w - - 0 1', 'w', ['wild', '1'], false);
  C.draw(classic); C.wild(classic, sq('a2'), sq('c4')); C.draw(classic);
  assert(!C.legalMoves(classic.pos, 'b').some((m) => m.ep), 'not in a classic game');
}

// ---------------------------------------------------------------- 7. Wild fusions
{
  const s = game('4k3/8/8/8/8/8/8/R3KB1N w Q - 0 1', 'w', ['wild']);
  C.draw(s);
  const t = C.wildTargets(s, sq('h1'));
  assert(t.includes(sq('a1')) && t.includes(sq('e1')) && t.includes(sq('f1')), 'a Wild knight can land on its rook, its king or its bishop, anywhere on the board');
  assert(!C.wildTargets(s, sq('a1')).includes(sq('h1')), 'only the knight is dropped onto the other piece, not the other way round');
  C.wild(s, sq('h1'), sq('a1'));
  assert(s.pos.b[sq('a1')] === 'wM' && !s.pos.b[sq('h1')] && !s.pos.castle.includes('Q'), 'it fuses into a Knook, which cannot castle');
  // A bishop on d6 does not attack e8, but a Knishop there would, with its knight jump.
  const d6 = game('4k3/8/3B4/8/8/8/8/K6N w - - 0 1', 'w', ['wild']);
  C.draw(d6);
  assert(!C.wildTargets(d6, sq('h1')).includes(sq('d6')), 'a Wild fusion may not check the enemy king (no Knishop on d6, a knight jump from e8)');
  const classic = game('4k3/8/8/8/8/8/8/R3KB1N w - - 0 1', 'w', ['wild'], false);
  C.draw(classic);
  assert(!C.wildTargets(classic, sq('h1')).some((x) => classic.pos.b[x]), 'no Wild fusions in a classic game');
}

// ---------------------------------------------------------------- 8. the computer plays Fusion
{
  const k = game('4k3/8/8/8/8/8/8/r3E3 b - - 0 1', 'b', ['1']);
  C.draw(k);
  const a = C.aiAction(k, 'normal', rngFrom(1));
  assert(a.type === 'move', 'normal: facing a Kning it can take, it treats the capture as a knight, not a win (and still moves)');
  let errors = 0, finished = 0, fusions = 0, knings = 0, worst = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const s = C.newGame({ seed, p0: seed % 2 ? 'w' : 'b', fusion: true });
    const rand = rngFrom(seed);
    try {
      while (s.phase !== 'over' && s.turnNo <= 250) {
        const t = Date.now();
        const act = C.aiAction(s, seed % 3 ? 'normal' : 'easy', rand);
        worst = Math.max(worst, Date.now() - t);
        if (act.type === 'move' && act.m.fuse) { fusions++; if ('KE'.includes(s.pos.b[act.m.from][1]) || 'KE'.includes(s.pos.b[act.m.to][1])) knings++; }
        C.apply(s, act);
      }
      if (s.phase === 'over') finished++;
    } catch (e) { errors++; console.log('     seed ' + seed + ': ' + e.message); }
  }
  assert(errors === 0, `12 Fusion games play through with every computer action accepted (${fusions} fusions, ${knings} of them Knings)`);
  assert(finished >= 10 && fusions > 0, `${finished}/12 finish inside 250 turns; the computer does fuse pieces`);
  assert(worst < 2000, `slowest decision ${worst}ms`);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
