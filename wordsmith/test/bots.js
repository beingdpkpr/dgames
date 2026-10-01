// Report only (listed under dgames.reportOnly in the root package.json, so the default suite skips it):
// long level-against-level matches with win rates, average scores and per-move think times. Asserts nothing
// and always exits 0. Run: node test/bots.js        (WS_BOTS=100 node test/bots.js for more games a pair)
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const { performance } = require('perf_hooks');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { console, Math, Map, Set, Uint32Array, Int32Array, Int8Array, Uint8Array, Uint16Array, Array, Object, String, JSON, Number, Error, performance };
ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
const W = ctx.__ws;
const wctx = {}; vm.createContext(wctx); vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'words.js'), 'utf8'), wctx);
const D = W.makeDict(W.unpackDawg(zlib.gunzipSync(Buffer.from(wctx.WORDSMITH_DICT.gz, 'base64'))));
const GAMES = +process.env.WS_BOTS || 40;
const think = { easy: [], medium: [], hard: [] };

function game(levels, seed) {
  const st = W.newGame({ seed, players: levels.map((l, i) => ({ name: 'p' + i, kind: 'cpu', level: l })) });
  let turns = 0, bingos = [0, 0];
  while (!st.over && turns < 400) {
    const idx = st.turn, p = st.players[idx];
    const t = performance.now();
    const d = W.computerDecide(D, st, idx, seed * 7919 + turns);
    think[p.level].push(performance.now() - t);
    if (d.type === 'play' && d.move.tiles.length === 7) bingos[idx]++;
    W.applyDecision(st, d); W.endTurn(st); turns++;
  }
  return { scores: st.players.map((p) => p.score), turns, bingos, over: st.over };
}
const pct = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
console.log('Wordsmith level v level, ' + GAMES + ' games a pair, seats alternating\n');
for (const [a, b] of [['hard', 'easy'], ['hard', 'medium'], ['medium', 'easy'], ['hard', 'hard'], ['easy', 'easy']]) {
  let wa = 0, ties = 0, sa = 0, sb = 0, turns = 0, ba = 0, bb = 0, unfinished = 0;
  const t0 = performance.now();
  for (let g = 0; g < GAMES; g++) {
    const swap = g % 2 === 1;
    const r = game(swap ? [b, a] : [a, b], 5000 + g);
    const [x, y] = swap ? [r.scores[1], r.scores[0]] : r.scores;
    const [bx, by] = swap ? [r.bingos[1], r.bingos[0]] : r.bingos;
    if (x > y) wa++; else if (x === y) ties++;
    sa += x; sb += y; turns += r.turns; ba += bx; bb += by; if (!r.over) unfinished++;
  }
  console.log(`${(a + ' v ' + b).padEnd(16)} ${a} wins ${wa}/${GAMES} (${(100 * wa / GAMES).toFixed(0)}%), ties ${ties}; avg ${(sa / GAMES).toFixed(0)} - ${(sb / GAMES).toFixed(0)}; bingos/game ${(ba / GAMES).toFixed(2)} - ${(bb / GAMES).toFixed(2)}; ${(turns / GAMES).toFixed(0)} turns/game; unfinished ${unfinished}; ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}
console.log('\nthink time per move in node (generate + choose), ms:');
for (const lv of ['easy', 'medium', 'hard']) {
  const a = think[lv];
  console.log(`  ${lv.padEnd(7)} n=${a.length}  median ${pct(a, 0.5).toFixed(1)}  p95 ${pct(a, 0.95).toFixed(1)}  max ${Math.max(...a).toFixed(1)}`);
}
process.exit(0);
