// The computer players. Run: node test/ai.js   (WS_GAMES=20 node test/ai.js for a longer run)
//
//  - Hard beats Easy, Hard beats Medium and Medium beats Easy most of the time over seeded games, each pair
//    playing both seats; the rates are printed.
//  - Every game terminates (two, three and four players), the 100 tiles are all accounted for after every
//    turn, and no computer ever plays a word the dictionary lacks or a tile it does not hold.
//  - Easy plays small real words, keeps its blanks, and picks a middling score -- weaker by choice, not random.
//  - Hard swaps a hopeless rack while the bag allows it and never asks to swap when it does not; with no move
//    and nothing to swap, every level passes.
// The long level-against-level report is test/bots.js (report only, not in the default suite).
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

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (cond) console.log('ok   ' + msg); else { failures++; console.log('FAIL ' + msg); } };
const GAMES = +process.env.WS_GAMES || 8;

// One seeded game between computer players; checks every turn as it goes.
function play(levels, seed) {
  const st = W.newGame({ seed, players: levels.map((l, i) => ({ name: 'p' + i, kind: 'cpu', level: l })) });
  let turns = 0, problems = 0, easyStats = { plays: 0, tiles: 0, blanks: 0 };
  while (!st.over) {
    if (++turns > 400) { problems++; break; }
    const idx = st.turn, p = st.players[idx];
    const d = W.computerDecide(D, st, idx, seed * 1000 + turns);
    if (d.type === 'play') {
      const an = W.analyzePlay(st.board, d.move.tiles);
      if (!an.ok || W.badWords(D, an.words).length || !W.fromRack(p.rack, d.move.tiles)) problems++;
      if (p.level === 'easy') { easyStats.plays++; easyStats.tiles += d.move.tiles.length; easyStats.blanks += d.move.tiles.filter((t) => t.blank).length; }
    }
    if (d.type === 'exchange' && st.bag.length < 7) problems++;
    W.applyDecision(st, d);
    W.endTurn(st);
    const n = st.bag.length + st.players.reduce((a, q) => a + q.rack.length, 0) + st.board.filter((v) => v).length;
    if (n !== 100) problems++;
  }
  return { st, turns, problems, easyStats };
}
function match(a, b, games, seed0) {
  let wa = 0, ties = 0, sa = 0, sb = 0, problems = 0, maxTurns = 0;
  for (let g = 0; g < games; g++) {
    const swap = g % 2 === 1;
    const r = play(swap ? [b, a] : [a, b], seed0 + g);
    const [x, y] = swap ? [r.st.players[1].score, r.st.players[0].score] : [r.st.players[0].score, r.st.players[1].score];
    if (x > y) wa++; else if (x === y) ties++;
    sa += x; sb += y; problems += r.problems + (r.st.over ? 0 : 1); maxTurns = Math.max(maxTurns, r.turns);
  }
  return { wa, ties, avgA: sa / games, avgB: sb / games, problems, maxTurns };
}

const t0 = performance.now();
for (const [a, b, need] of [['hard', 'easy', 0.85], ['hard', 'medium', 0.7], ['medium', 'easy', 0.7]]) {
  const r = match(a, b, GAMES, a.length * 100 + b.length);
  ok(r.problems === 0, a + ' v ' + b + ': ' + GAMES + ' games all finished cleanly (longest ' + r.maxTurns + ' turns)');
  ok(r.wa / GAMES >= need, a + ' beats ' + b + ' ' + r.wa + '/' + GAMES + ' (avg ' + r.avgA.toFixed(0) + ' to ' + r.avgB.toFixed(0) + ')');
}
// more players
for (const levels of [['easy', 'medium', 'hard'], ['hard', 'hard', 'easy', 'medium']]) {
  const r = play(levels, 77);
  ok(r.st.over && r.problems === 0, levels.length + ' players (' + levels.join(', ') + '): terminates in ' + r.turns + ' turns, scores ' + r.st.players.map((p) => p.score).join('/'));
}
// Easy's style
{
  const r = play(['easy', 'easy'], 5);
  const s = r.easyStats;
  ok(s.plays > 10 && s.tiles / s.plays <= 4 && s.blanks <= 2, 'Easy plays short words: ' + (s.tiles / s.plays).toFixed(1) + ' tiles a play over ' + s.plays + ' plays, ' + s.blanks + ' blank(s) spent');
  const st = W.newGame({ seed: 8, players: [{ name: 'a', kind: 'cpu', level: 'easy' }, { name: 'b', kind: 'cpu', level: 'hard' }] });
  const gen = W.generateMoves(D, st.board, st.players[0].rack);
  const best = Math.max(...gen.map((m) => m.score));
  const picks = [0, 1, 2, 3, 4, 5].map((s) => W.chooseMove(gen, st.players[0].rack, 'easy', { bag: 86, seed: s }).move.score);
  ok(picks.every((p) => p > 0 && p < best), 'Easy picks real, middling plays: ' + picks.join(', ') + ' where the best is ' + best);
}
// exchanging and passing
{
  const rack = ['Q', 'V', 'V', 'W', 'U', 'U', 'I'];
  const st = W.newGame({ seed: 3, players: [{ name: 'a', kind: 'cpu', level: 'hard' }, { name: 'b', kind: 'cpu', level: 'hard' }] });
  // a board with one short word to play off
  [...'OX'].forEach((ch, i) => { st.board[7 * 15 + 7 + i] = ch.charCodeAt(0) - 64; });
  const gen = W.generateMoves(D, st.board, rack);
  const d = W.chooseMove(gen, rack, 'hard', { bag: 50, seed: 1 });
  ok(d.type === 'exchange' && d.tiles.includes('Q') && d.tiles.filter((c) => c === 'V').length >= 1, 'Hard swaps QVVWUUI (throws back ' + (d.tiles || []).join('') + ') rather than play ' + (gen.sort((a, b) => b.score - a.score)[0] || { word: '-' }).word);
  const d2 = W.chooseMove(gen, rack, 'hard', { bag: 5, seed: 1 });
  ok(d2.type === 'play', 'with 5 in the bag Hard plays instead of asking to swap');
  for (const lv of W.LEVELS) {
    ok(W.chooseMove([], rack, lv, { bag: 3, seed: 1 }).type === 'pass', lv + ': no move and no swap possible -> pass');
    ok(W.chooseMove([], rack, lv, { bag: 30, seed: 1 }).type === 'exchange', lv + ': no move but a full bag -> swap');
  }
  // end-game: bag empty, Hard prefers going out
  const st2 = W.newGame({ seed: 4, players: [{ name: 'a', kind: 'cpu', level: 'hard' }, { name: 'b', kind: 'cpu', level: 'hard' }] });
  [...'CAT'].forEach((ch, i) => { st2.board[7 * 15 + 6 + i] = ch.charCodeAt(0) - 64; });
  const r2 = ['S', 'H'];
  const g2 = W.generateMoves(D, st2.board, r2);
  const d3 = W.chooseMove(g2, r2, 'hard', { bag: 0, seed: 2, unseen: ['Q', 'Z', 'J'] });
  ok(d3.type === 'play' && d3.move.tiles.length === 2, 'bag empty: Hard goes out with both tiles (' + d3.move.word + ' ' + d3.move.score + ') when the opponent holds QZJ');
}
// the worker entry point
{
  const st = W.newGame({ seed: 12, players: [{ name: 'a', kind: 'cpu', level: 'hard' }, { name: 'b', kind: 'cpu', level: 'hard' }] });
  const d = W.think(D, { board: st.board, rack: st.players[0].rack, level: 'hard', bag: st.bag.length, seed: 1, unseen: [] });
  ok(d && (d.type === 'play' || d.type === 'exchange') && d.count >= 0 && d.ms >= 0, 'think() answers the worker\'s job shape (' + d.type + ', ' + d.count + ' moves, ' + d.ms.toFixed(0) + ' ms)');
  ok(JSON.parse(JSON.stringify(d)).type === d.type, 'its answer survives structured cloning as plain data');
}
console.log('  (' + ((performance.now() - t0) / 1000).toFixed(1) + ' s)');
console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
