// Headless check of the rules (no browser). Lifts the pure section of index.html -- everything above the
// `// ---------- UI ----------` marker -- into node's vm and plays positions built by hand.
// Run: node test/rules.js
//
// Covers: captures (one stone, two chains at once), suicide illegal but capture-first legal, the plain ko,
// positional superko on a triple ko that the one-move ko rule cannot see, two passes ending the game,
// area scoring of finished boards with known results (dead stones marked or not, and a seki whose shared
// liberties must count for nobody), handicap placement, undo restoring the Zobrist key and the superko
// history, the board's O(1) atari bookkeeping against a brute-force liberty count over random games,
// SGF output, and the back button being byte-identical to tetris's copy.
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { Math, console, Array, Object, Number, String, JSON, Set, Map, Date, Infinity, Uint8Array, Int8Array, Int16Array, Int32Array, Float32Array, Float64Array };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const G = ctx.__go;
const { BLACK, WHITE, EMPTY, PASS } = G;

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) failures++; };

// rows of 'B' / 'W' / '.', top row first. Returns a Game whose setup is that position.
function position(rows, toMove) {
  const N = rows.length, setup = [];
  rows.forEach((r, y) => [...r.replace(/ /g, '')].forEach((ch, x) => { if (ch === 'B') setup.push([G.toPt(N, x, y), BLACK]); else if (ch === 'W') setup.push([G.toPt(N, x, y), WHITE]); }));
  return new G.Game(N, { setup, toMove: toMove || BLACK });
}
const P = (g, x, y) => G.toPt(g.N, x, y);
const at = (g, x, y) => g.board.c[P(g, x, y)];

// ------------------------------------------------------------ captures
{
  const g = position([
    'B W B . .',
    '. B . . .',
    '. . . . .',
    '. . . . .',
    '. . . . .']);
  ok(g.play(P(g, 1, 1)) === 'occupied', 'a stone cannot go on a stone');
}
{
  const g = position([
    'B . B . .',
    '. W B . .',
    '. B . . .',
    '. . . . .',
    '. . . . .'], WHITE);
  ok(g.play(P(g, 1, 0)) === null && at(g, 1, 0) === WHITE, 'white connects up to (1,0)');
  // White chain (1,0)+(1,1) now has a single liberty at (0,1).
  ok(g.board.inAtari(g.board.head[P(g, 1, 1)]), 'the two-stone white chain is in atari');
  ok(g.play(P(g, 0, 1)) === null, 'black plays the last liberty');
  ok(at(g, 1, 0) === EMPTY && at(g, 1, 1) === EMPTY && g.board.caps[BLACK] === 2 && g.lastCaptured === 2, 'both white stones are captured and counted (captures: black 2)');
}
{
  // One black move takes two separate white chains -- the stone at (1,0) and the pair (3,0)+(3,1) --
  // because (2,0) is the last liberty of both.
  const g = position([
    'B W . W B .',
    '. B B W B .',
    '. . . B . .',
    '. . . . . .',
    '. . . . . .',
    '. . . . . .']);
  ok(g.play(P(g, 2, 0)) === null, 'black plays (2,0), the last liberty of two different white chains');
  ok(at(g, 1, 0) === EMPTY && at(g, 3, 0) === EMPTY && at(g, 3, 1) === EMPTY && g.board.caps[BLACK] === 3, 'multi-group capture: the single stone and the two-stone chain both come off (3 captures)');
}

// ------------------------------------------------------------ suicide, and capture before suicide
{
  const g = position([
    '. W . . .',
    'W . . . .',
    '. . . . .',
    '. . . . .',
    '. . . . .']);
  ok(g.play(P(g, 0, 0)) === 'suicide' && at(g, 0, 0) === EMPTY, 'black into the corner between two healthy white stones is suicide, and refused');
  const g2 = position([
    '. B W . .',
    'B W W . .',
    'W . . . .',
    '. . . . .',
    '. . . . .'], BLACK);
  // black (0,0)+(1,0)? -- the multi-stone version: B at (1,0) and (0,1) are separate, playing (0,0)
  // would join them into a chain with no liberty and capture nothing.
  ok(g2.play(P(g2, 0, 0)) === 'suicide', 'a move that joins two chains into one with no liberties is suicide too');
  const g3 = position([
    '. W B . .',
    'W B . . .',
    '. . . . .',
    '. . . . .',
    '. . . . .']);
  ok(g3.board.isSuicide(P(g3, 0, 0), BLACK) === false, 'capture-first: (0,0) has no liberty of its own but takes the white stone at (1,0)');
  ok(g3.play(P(g3, 0, 0)) === null && at(g3, 1, 0) === EMPTY && at(g3, 0, 0) === BLACK, 'so it is legal, and the white stone is removed before black is checked for liberties');
}

// ------------------------------------------------------------ ko and positional superko
// A ko, three times over. Each block (rows r..r+2) is
//    . B W .
//    B W . W      (state "W": black can take at x=2)
//    . B W .
// or, in state "B", with the black stone at x=2 and x=1 empty (white can take back at x=1).
function kos(states) {
  const rows = Array.from({ length: 9 }, () => '.........'.split(''));
  states.forEach((st, k) => {
    const r = k * 3;
    rows[r][1] = 'B'; rows[r][2] = 'W'; rows[r + 1][0] = 'B'; rows[r + 1][3] = 'W'; rows[r + 2][1] = 'B'; rows[r + 2][2] = 'W';
    if (st === 'W') rows[r + 1][1] = 'W'; else rows[r + 1][2] = 'B';
  });
  return rows.map((r) => r.join(''));
}
{
  const g = position(kos(['W', 'W', 'W']));
  ok(g.play(P(g, 2, 1)) === null && at(g, 1, 1) === EMPTY, 'black takes the ko');
  ok(g.play(P(g, 1, 1)) === 'ko', 'white may not retake at once (simple ko)');
  ok(g.play(P(g, 8, 8)) === null && g.play(P(g, 8, 7)) === null, 'a ko threat and answer elsewhere');
  ok(g.play(P(g, 1, 1)) === null && at(g, 2, 1) === EMPTY, 'now white retakes');
}
{
  // Triple ko. Start: ko1 black-can-take, ko2 white-can-take, ko3 black-can-take, black to move.
  // B takes 1, W takes 2, B takes 3, W retakes 1, B retakes 2, W retakes 3 -> every ko has flipped twice
  // and the whole board is back where it started. No move in that cycle retakes the ko just taken, so the
  // simple ko rule allows all six; positional superko must refuse the sixth.
  const g = position(kos(['W', 'B', 'W']));
  const start = g.board.key();
  const seq = [[2, 1], [1, 4], [2, 7], [1, 1], [2, 4]];
  const res = seq.map(([x, y]) => g.play(P(g, x, y)));
  ok(res.every((r) => r === null), 'triple ko: the first five takes are all legal (' + res.join(',') + ')');
  const sixth = P(g, 1, 7);
  ok(g.board.isLegal(sixth), 'the sixth take is legal under the simple ko rule alone');
  ok(g.illegal(sixth) === 'superko' && g.play(sixth) === 'superko', 'positional superko refuses it: it would recreate the starting position');
  g.board.play(sixth);
  ok(g.board.key() === start, '(and that position really is the start, by Zobrist key)');
}

// ------------------------------------------------------------ passes end the game
{
  const g = new G.Game(9);
  g.pass(); ok(!g.ended(), 'one pass does not end the game');
  g.play(P(g, 4, 4)); g.pass(); ok(!g.ended(), 'pass, move, pass does not either');
  g.pass(); ok(g.ended(), 'two consecutive passes end it');
  g.undo(); ok(!g.ended() && g.board.toMove === WHITE, 'undoing the second pass resumes play with the right side to move');
}

// ------------------------------------------------------------ area scoring
{
  // Black owns columns 0-4 (wall on 4), white 5-8 (wall on 5): 45 to 36, komi 7.5 -> B+1.5.
  const rows = Array.from({ length: 9 }, () => '....BW...');
  const g = position(rows);
  const s = G.scoreArea(g.board, null, 7.5);
  ok(s.black.stones === 9 && s.black.territory === 36 && s.black.total === 45, 'black: 9 stones + 36 territory = 45');
  ok(s.white.stones === 9 && s.white.territory === 27 && s.white.total === 43.5, 'white: 9 + 27 + 7.5 komi = 43.5');
  ok(s.winner === BLACK && s.margin === 1.5 && G.resultString({ winner: s.winner, margin: s.margin }) === 'B+1.5', 'black wins by 1.5 (B+1.5)');
  // A dead white stone inside black's area: unmarked it spoils the whole region; marked, it is a prisoner
  // and its point is black territory.
  const rows2 = rows.slice(); rows2[1] = '.W..BW...';
  const g2 = position(rows2);
  const raw = G.scoreArea(g2.board, null, 7.5);
  ok(raw.black.territory === 0 && raw.dame === 35 && raw.white.stones === 10, 'unmarked, a white stone in black\'s area makes the region neutral (35 dame)');
  const dead = new Uint8Array(g2.board.g.S); dead[P(g2, 1, 1)] = 1;
  const m = G.scoreArea(g2.board, dead, 7.5);
  ok(m.black.total === 45 && m.white.total === 43.5 && m.white.dead === 1 && m.owner[P(g2, 1, 1)] === BLACK, 'marked dead, it is removed and the point counts for black: 45 to 43.5 again');
  // Seki. x=0 white territory, x=1 white wall, x=2 + x=3 below row 1 an inner black chain, x=4 an inner
  // white chain, x=5 black wall, x=6-8 black territory. The inner chains share their only two liberties
  // (3,0) and (3,1): whoever plays one is captured, so neither does. Both inner chains live, and the two
  // shared liberties are dame.
  const seki = [
    '.WB.WB...',
    '.WB.WB...',
    '.WBBWB...',
    '.WBBWB...',
    '.WBBWB...',
    '.WBBWB...',
    '.WBBWB...',
    '.WBBWB...',
    '.WBBWB...'];
  const gs = position(seki);
  const ib = gs.board.head[P(gs, 2, 0)], iw = gs.board.head[P(gs, 4, 0)];
  ok(gs.board.chainLibs(P(gs, 2, 0)) === 2 && gs.board.chainLibs(P(gs, 4, 0)) === 2 && ib !== iw, 'seki set-up: both inner chains have exactly the two shared liberties');
  ok(gs.illegal(P(gs, 3, 0)) === null, '(either side may play there, it is just self-atari)');
  const ss = G.scoreArea(gs.board, null, 7.5);
  ok(ss.dame === 2 && ss.owner[P(gs, 3, 0)] === EMPTY && ss.owner[P(gs, 3, 1)] === EMPTY, 'seki: the shared liberties count for nobody');
  ok(ss.black.total === 52 && ss.white.total === 34.5 && ss.margin === 17.5, 'seki: black 25 stones + 27 = 52, white 18 stones + 9 + 7.5 = 34.5, B+17.5');
  // The end-of-game proposal (ownership from playouts) must leave a seki alive. Playouts that may put a
  // multi-stone chain in self-atari rate both inner chains ~0.00 here; with that move banned, ~0.9+.
  for (const tm of [BLACK, WHITE]) {
    const gp = position(seki, tm), own = G.estimateOwnership(gp.board, 1500, 5), dead = G.deadFromOwnership(gp.board, own);
    const ibo = own[P(gp, 2, 0)], iwo = -own[P(gp, 4, 0)];
    ok(dead.every((v) => !v) && ibo > 0.6 && iwo > 0.6, 'dead-stone proposal on the seki (' + (tm === BLACK ? 'black' : 'white') + ' to move): nothing dead, inner chains owned ' + ibo.toFixed(2) + ' / ' + iwo.toFixed(2));
  }
  // A finished board: black owns a two-column strip (wall on x=2), white the rest, and one white stone sits
  // inside black's strip. (In the 35-point open area above, white really could still live: the playouts
  // give that stone +0.19, i.e. undecided, so it is not a fair question for the proposal.)
  const fin = Array.from({ length: 9 }, () => '..BW.....'); fin[4] = 'W.BW.....';
  const gd = position(fin), dd = G.deadFromOwnership(gd.board, G.estimateOwnership(gd.board, 1500, 6));
  ok(dd[P(gd, 0, 4)] === 1 && dd.reduce((a, b) => a + b, 0) === 1, 'and it proposes the white stone inside black\'s finished area as dead, and nothing else');
}

// ------------------------------------------------------------ handicap
{
  const names = (N, k) => G.handicapPoints(N, k).map((p) => G.ptName(N, p)).sort().join(' ');
  ok(names(19, 2) === 'D4 Q16', '19x19, 2 stones: the two opposite star points (D4, Q16)');
  ok(names(19, 4) === 'D16 D4 Q16 Q4', '19x19, 4 stones: the four corner star points');
  ok(names(19, 5) === 'D16 D4 K10 Q16 Q4', '19x19, 5 stones: corners + tengen');
  ok(names(19, 6) === 'D10 D16 D4 Q10 Q16 Q4', '19x19, 6 stones: corners + the two side star points');
  ok(names(19, 9).split(' ').length === 9 && names(13, 9).includes('G7'), 'nine stones: every star point (13x13 includes G7)');
  ok(names(13, 4) === 'D10 D4 K10 K4', '13x13, 4 stones on the 4-4 points');
  const g = new G.Game(19, { handicap: 4 });
  ok(g.board.toMove === WHITE && g.komi === 0.5, 'with a handicap, white moves first and komi drops to 0.5');
  ok(g.board.c.filter((c) => c === BLACK).length === 4, 'the four stones are on the board');
  ok(new G.Game(9, { handicap: 4 }).handicap === 0, '9x9 takes no handicap stones');
  g.play(G.toPt(19, 10, 10)); g.undo();
  ok(g.board.c.filter((c) => c === BLACK).length === 4 && g.board.toMove === WHITE, 'undo keeps the handicap stones and white to move');
  ok(G.starPoints(9).length === 5 && G.starPoints(13).length === 5 && G.starPoints(19).length === 9, 'star points: 5 on 9x9 and 13x13, 9 on 19x19');
}

// ------------------------------------------------------------ undo restores hashes and the superko record
{
  const g = new G.Game(9), rng = G.rngFrom(42), keys = [g.board.key()], seenSizes = [g.seen.size];
  let caps = 0;
  for (let i = 0; i < 150 && !g.ended(); i++) {
    const legal = g.legalMoves().filter((p) => !g.board.isEye(p, g.board.toMove));
    if (!legal.length) g.pass(); else { g.play(legal[(rng() * legal.length) | 0]); caps += g.lastCaptured; }
    keys.push(g.board.key()); seenSizes.push(g.seen.size);
  }
  ok(caps > 5, 'the random game had captures in it (' + caps + ' stones)');
  let good = true;
  for (let i = keys.length - 1; i > 0; i--) { g.undo(); if (g.board.key() !== keys[i - 1] || g.seen.size !== seenSizes[i - 1]) good = false; }
  ok(good && g.moves.length === 0, 'undoing all ' + (keys.length - 1) + ' moves passes back through every earlier key, and the superko record shrinks with it');
  // After undoing a ko capture, the retake that superko would have forbidden is legal again.
  const k = position(kos(['W', 'W', 'W']));
  k.play(P(k, 2, 1)); k.play(P(k, 8, 8)); k.play(P(k, 8, 7));
  ok(k.play(P(k, 1, 1)) === null, 'ko retaken after an exchange');
  k.undo();
  ok(k.board.c[P(k, 2, 1)] === BLACK && k.illegal(P(k, 1, 1)) === null, 'undo puts the black stone back and the retake is available again');
}

// ------------------------------------------------------------ the O(1) bookkeeping against brute force
{
  let bad = 0, chains = 0, zbad = 0;
  for (const N of [9, 13, 19]) {
    for (let seed = 1; seed <= 6; seed++) {
      const g = new G.Game(N), rng = G.rngFrom(seed * 97 + N);
      for (let i = 0; i < N * N * 2 && !g.ended(); i++) {
        const b = g.board, p = b.randomMove(rng);
        if (p === PASS) g.pass(); else if (g.play(p)) g.pass();
        if (i % 7) continue;
        const seen = new Set();
        for (const q of b.g.pts) {
          if (b.c[q] !== BLACK && b.c[q] !== WHITE) continue;
          const h = b.head[q]; if (seen.has(h)) continue; seen.add(h); chains++;
          const libs = b.chainLibs(q);
          if (libs === 0 || b.inAtari(h) !== (libs === 1) || b.chainStones(q).length !== b.sz[h]) bad++;
        }
        const fresh = new G.Board(N);
        for (const q of b.g.pts) if (b.c[q] === BLACK || b.c[q] === WHITE) fresh.setStone(q, b.c[q]);
        if (fresh.key() !== b.key()) zbad++;
      }
    }
  }
  ok(bad === 0, 'pseudo-liberty atari test agrees with a brute-force liberty count on all ' + chains + ' chains sampled from random 9/13/19 games');
  ok(zbad === 0, 'the incrementally kept Zobrist key equals one rebuilt from scratch every time');
}

// ------------------------------------------------------------ SGF
{
  const g = new G.Game(13, { handicap: 2 });
  g.play(G.toPt(13, 2, 2)); g.pass(); g.play(G.toPt(13, 10, 9));
  g.result = { winner: WHITE, reason: 'resign' };
  const s = G.toSGF(g, { black: 'You', white: 'Computer', date: '2026-10-01' });
  ok(s.startsWith('(;GM[1]FF[4]') && s.includes('SZ[13]') && s.includes('KM[0.5]') && s.includes('HA[2]AB[jd][dj]') && s.includes('RE[W+R]'), 'SGF header: size, komi, handicap stones, result');
  ok(s.includes(';W[cc]') && s.includes(';B[]') && s.includes(';W[kj]') && s.trim().endsWith(')'), 'SGF moves: white first after handicap, a pass as B[]');
}

// ------------------------------------------------------------ the shared back button is still verbatim
{
  const tetris = fs.readFileSync(path.join(__dirname, '..', '..', 'tetris', 'index.html'), 'utf8');
  const backBlock = (s) => { const a = s.lastIndexOf('<style>', s.indexOf('/* dgames: the way back')); const e = s.indexOf('</a>', s.indexOf('<a class="dg-home"')); return s.slice(a, e + 4); };
  ok(backBlock(html) === backBlock(tetris) && backBlock(html).length > 800, 'back button is byte-identical to tetris (' + backBlock(html).length + ' bytes)');
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
