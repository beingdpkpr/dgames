// Report, not a test: seeded 9x9 matches of every computer level against a random mover, and of each level
// against the one below it. Asserts nothing and always exits 0 (listed under dgames.reportOnly in
// package.json) -- at ~0.3 s a move for Medium and ~1-5 s for Hard, a statistically useful run takes
// tens of minutes, which is no place for a gate. test/ai.js gates the fast part (tactics, Easy vs random).
// Run: node test/matches.js [games vs random per level, default 20] [games per level pair, default 10]
//
// The random mover plays uniformly among legal moves that do not fill its own eye, and passes when it has
// none. Colours alternate game to game. A game the computer has not resigned is counted by area scoring
// with dead stones taken from a 300-playout ownership estimate, the same way the page proposes them.
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { Math, console, Array, Object, Number, String, JSON, Set, Map, Date, Infinity, Uint8Array, Int8Array, Int16Array, Int32Array, Float32Array, Float64Array };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const G = ctx.__go;
const { BLACK, WHITE, PASS, RESIGN } = G;
const VS_RANDOM = Number(process.argv[2]) || 20, PAIRS = Number(process.argv[3]) || 10;

function play(blackP, whiteP, seed) {
  const g = new G.Game(9), rng = G.rngFrom(seed), ms = { 1: [], 2: [] };
  let n = 0, eyeFills = 0;
  while (!g.ended() && !g.result && n++ < 243) {
    const col = g.board.toMove, who = col === BLACK ? blackP : whiteP;
    let m;
    if (who === 'random') { const legal = g.legalMoves().filter((p) => !g.board.isEye(p, col)); m = legal.length ? legal[(rng() * legal.length) | 0] : PASS; }
    else { const r = G.chooseMove(g, who, seed * 977 + n); m = r.move; ms[col].push(r.ms); if (m > 0 && g.board.isEye(m, col)) eyeFills++; }
    if (m === RESIGN) { g.result = { winner: 3 - col, reason: 'resign' }; break; }
    if (m === PASS) g.pass(); else if (g.play(m)) g.pass();
  }
  let winner = g.result && g.result.winner, margin = null;
  if (!winner) { const s = G.scoreArea(g.board, G.deadFromOwnership(g.board, G.estimateOwnership(g.board, 300, seed)), g.komi); winner = s.winner; margin = s.margin; }
  return { winner, margin, moves: g.moves.length, ms, eyeFills, resigned: !!g.result };
}
function match(a, b, games, seed0) {
  let aw = 0, eye = 0, res = 0; const msA = [], msB = [];
  const t0 = Date.now();
  for (let i = 0; i < games; i++) {
    const aBlack = i % 2 === 0;
    const r = play(aBlack ? a : b, aBlack ? b : a, seed0 + i);
    if (r.winner === (aBlack ? BLACK : WHITE)) aw++;
    eye += r.eyeFills; res += r.resigned;
    msA.push(...r.ms[aBlack ? BLACK : WHITE]); msB.push(...r.ms[aBlack ? WHITE : BLACK]);
  }
  const med = (v) => { if (!v.length) return '-'; v = v.slice().sort((x, y) => x - y); return Math.round(v[v.length >> 1]) + ' ms (max ' + Math.round(v[v.length - 1]) + ')'; };
  console.log(`${a.padEnd(6)} vs ${b.padEnd(6)}  ${aw}/${games} = ${Math.round((100 * aw) / games)}%   own-eye fills ${eye}   resignations ${res}   ${a} think median ${med(msA)}${b === 'random' ? '' : `, ${b} ${med(msB)}`}   [${Math.round((Date.now() - t0) / 1000)} s]`);
}
console.log(`9x9, komi ${G.KOMI}. ${VS_RANDOM} games per level vs random, ${PAIRS} per level pair; colours alternate.`);
for (const lvl of ['easy', 'medium', 'hard']) match(lvl, 'random', VS_RANDOM, 1000);
match('medium', 'easy', PAIRS, 2000);
match('hard', 'medium', PAIRS, 3000);
match('hard', 'easy', PAIRS, 4000);
