// Headless check of the computer opponent (no browser). Same vm lift as test/rules.js.
// Run: node test/ai.js
//
// Every level, on hand-built 9x9 positions, must: take a big chain sitting in atari, pull its own chain
// out of atari when it can, and pass rather than fill its own eyes when eyes are all that is left. Then a
// few seeded Easy games against a random mover must all be won with no own-eye fills. The long matches
// (every level vs random, level vs level) are in test/matches.js, a report kept out of the default suite.
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { Math, console, Array, Object, Number, String, JSON, Set, Map, Date, Infinity, Uint8Array, Int8Array, Int16Array, Int32Array, Float32Array, Float64Array };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const G = ctx.__go;
const { BLACK, WHITE, PASS, RESIGN } = G;

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) failures++; };
function position(rows, toMove) {
  const N = rows.length, setup = [];
  rows.forEach((r, y) => [...r.replace(/ /g, '')].forEach((ch, x) => { if (ch === 'B') setup.push([G.toPt(N, x, y), BLACK]); else if (ch === 'W') setup.push([G.toPt(N, x, y), WHITE]); }));
  return new G.Game(N, { setup, toMove: toMove || BLACK });
}
const LEVELS = ['easy', 'medium', 'hard'];

// ------------------------------------------------------------ take the chain in atari
{
  // Four white stones cut into black's walled area with one liberty left, at G7. Captured, black's area is
  // 47 to white's 34 + 7.5. Allowed to extend to G7, they connect to the white wall on the right and cut
  // black's area in two -- so the capture is the move that decides the game: the search rates it ~96%
  // and every alternative near 50%, and every level plays it on 20 of 20 seeds. (Two earlier drafts had
  // an open black area; random playouts then rated every black move ~3%, and Hard picked G7 only 14/20.)
  const rows = [
    '.......BW',
    '..BBBB.BW',
    '.BWWWW.WW',
    '..BBBB.BW',
    '.......BW',
    'BBBBBBBBW',
    'WWWWWWWWW',
    '.........',
    '.........'];
  for (const lvl of LEVELS) {
    const g = position(rows), r = G.chooseMove(g, lvl, 11);
    ok(G.ptName(9, r.move) === 'G7', lvl + ': captures the four stones in atari (played ' + G.ptName(9, r.move) + ', ' + r.playouts + ' playouts, ' + Math.round(r.ms) + ' ms)');
  }
}
// ------------------------------------------------------------ save its own chain from atari
{
  // The colour-swapped position: black's four stones are the ones in atari, and G7 connects them to
  // black's wall. Black is behind either way, but the search rates the escape ~10% and everything
  // else under 8%, and plays it on 20 of 20 seeds at every level (the open-board first draft: Easy 17/20).
  const rows = [
    '.......WB',
    '..WWWW.WB',
    '.WBBBB.BB',
    '..WWWW.WB',
    '.......WB',
    'WWWWWWWWB',
    'BBBBBBBBB',
    '.........',
    '.........'];
  for (const lvl of LEVELS) {
    const g = position(rows), r = G.chooseMove(g, lvl, 12);
    let libs = 0;
    if (r.move > 0) { g.play(r.move); libs = g.board.chainLibs(G.toPt(9, 2, 2)); }
    ok(libs >= 2, lvl + ': pulls its four stones out of atari (played ' + G.ptName(9, r.move) + ', chain now has ' + libs + ' liberties)');
  }
}
// ------------------------------------------------------------ never fill its own true eye
{
  // Black owns the whole board but two single-point eyes. Every legal black move is an eye-fill that
  // would kill the group; white has no legal move at all (both points are suicide for white).
  const rows = Array.from({ length: 9 }, () => 'BBBBBBBBB'.split(''));
  rows[1][1] = '.'; rows[7][7] = '.';
  for (const lvl of LEVELS) {
    const g = position(rows.map((r) => r.join('')));
    const r = G.chooseMove(g, lvl, 13);
    ok(r.move === PASS, lvl + ': with only its own eyes left it passes instead of filling one');
  }
  // And the opposite colour's view: white sees those points as suicide, not as eyes to fill.
  const g = position(rows.map((r) => r.join('')), WHITE);
  ok(g.legalMoves().length === 0, 'white has no legal move into black\'s two eyes (suicide)');
}
// ------------------------------------------------------------ the root respects positional superko
{
  // The triple-ko start of test/rules.js, five takes in: the sixth take would repeat the start.
  const rowsK = Array.from({ length: 9 }, () => '.........'.split(''));
  ['W', 'B', 'W'].forEach((st, k) => {
    const r = k * 3;
    rowsK[r][1] = 'B'; rowsK[r][2] = 'W'; rowsK[r + 1][0] = 'B'; rowsK[r + 1][3] = 'W'; rowsK[r + 2][1] = 'B'; rowsK[r + 2][2] = 'W';
    if (st === 'W') rowsK[r + 1][1] = 'W'; else rowsK[r + 1][2] = 'B';
  });
  const g = position(rowsK.map((r) => r.join('')));
  for (const [x, y] of [[2, 1], [1, 4], [2, 7], [1, 1], [2, 4]]) g.play(G.toPt(9, x, y));
  const s = new G.Search(g, { seed: 3 });
  ok(!s.candidates.includes(G.toPt(9, 1, 7)), 'the search never considers the superko-illegal retake at the root');
}

// ------------------------------------------------------------ a few seeded games against a random mover
function vsRandom(level, games, seed0) {
  let wins = 0, eyeFills = 0, illegal = 0;
  for (let i = 0; i < games; i++) {
    const aiCol = i % 2 ? WHITE : BLACK, g = new G.Game(9), rng = G.rngFrom(seed0 + i);
    let n = 0;
    while (!g.ended() && !g.result && n++ < 243) {
      const col = g.board.toMove;
      let m;
      if (col !== aiCol) { const legal = g.legalMoves().filter((p) => !g.board.isEye(p, col)); m = legal.length ? legal[(rng() * legal.length) | 0] : PASS; }
      else { m = G.chooseMove(g, level, seed0 * 7 + n).move; if (m > 0 && g.board.isEye(m, col)) eyeFills++; }
      if (m === RESIGN) { g.result = { winner: 3 - col }; break; }
      if (m === PASS) g.pass(); else if (g.play(m)) { illegal++; g.pass(); }
    }
    let winner = g.result && g.result.winner;
    if (!winner) winner = G.scoreArea(g.board, G.deadFromOwnership(g.board, G.estimateOwnership(g.board, 300, i + 1)), g.komi).winner;
    if (winner === aiCol) wins++;
  }
  return { wins, eyeFills, illegal };
}
{
  const r = vsRandom('easy', 4, 500);
  ok(r.wins === 4, 'easy beats a random mover in 4 of 4 seeded games, as black and as white (' + r.wins + '/4)');
  ok(r.eyeFills === 0 && r.illegal === 0, 'and never fills its own eye or tries an illegal move doing it');
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
