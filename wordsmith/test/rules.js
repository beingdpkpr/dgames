// Headless check of the rules (no browser). Lifts the pure section of index.html -- everything above the
// `// ---------- UI ----------` marker -- into node's vm and drives it directly. Run: node test/rules.js
//
// Holds the referee to hand-worked numbers: the tile set and board layout as designed, letter and word
// premiums applying only on the turn a tile covers them, cross-words scored in full, the 50-point bingo,
// blanks worth nothing; placement legality (one line, no gaps, joined to the board, centre star first);
// exchange, pass, six scoreless turns, the end-of-game rack adjustment; challenge withdrawal restoring the
// exact state; saves that are damaged or from another version coming back null instead of throwing; and the
// two shared snippets still byte-identical to tetris's copies.
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { console, Math, Map, Set, Uint32Array, Int32Array, Int8Array, Uint8Array, Uint16Array, Array, Object, String, JSON, Number, Error, performance };
ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
const W = ctx.__ws;
const wctx = {}; vm.createContext(wctx); vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'words.js'), 'utf8'), wctx);
const D = W.makeDict(W.unpackDawg(zlib.gunzipSync(Buffer.from(wctx.WORDSMITH_DICT.gz, 'base64'))));

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (cond) console.log('ok   ' + msg); else { failures++; console.log('FAIL ' + msg); } };
const eq = (a, b, msg) => ok(a === b, msg + (a === b ? '' : ' (got ' + a + ', want ' + b + ')'));
const sq = (r, c) => r * 15 + c;
const L = (ch) => ch.charCodeAt(0) - 65;
const word = (s, r, c, dir, blanks = []) => [...s].map((ch, i) => ({ sq: dir ? sq(r + i, c) : sq(r, c + i), l: L(ch), blank: blanks.includes(i) }));
const put = (board, s, r, c, dir) => { for (const t of word(s, r, c, dir)) board[t.sq] = W.cellOf(t.l, false); return board; };
const empty = () => new Array(225).fill(0);

// ------------------------------------------------------------ 1. the tile set and the board, as designed
{
  const T = W.TILESET;
  const n = Object.values(T).reduce((a, t) => a + t[0], 0), pts = Object.values(T).reduce((a, t) => a + t[0] * t[1], 0);
  eq(n, 100, 'tile set: 100 tiles');
  eq(T['?'][0], 2, 'two blanks worth 0');
  eq(pts, 203, 'tile set: 203 points in all');
  ok(T.E[0] === 12 && T.E[1] === 1 && T.Q[1] === 9 && T.Z[1] === 8 && T.S[0] === 5 && T.S[1] === 2, 'tile set: E x12 @1, Q @9, Z @8, S x5 @2 (our own distribution)');
  const count = [0, 0, 0, 0, 0];
  for (let i = 0; i < 225; i++) count[W.PREM[i]]++;
  ok(count[1] === 24 && count[2] === 12 && count[3] === 17 && count[4] === 8, 'premiums: 24 DL, 12 TL, 17 DW (with the star), 8 TW (' + count.join(',') + ')');
  let sym = true;
  for (let r = 0; r < 15; r++) for (let c = 0; c < 15; c++) {
    const v = W.PREM[sq(r, c)];
    for (const [a, b] of [[c, r], [14 - r, c], [r, 14 - c], [14 - r, 14 - c], [14 - c, r], [c, 14 - r], [14 - c, 14 - r]]) if (W.PREM[sq(a, b)] !== v) sym = false;
  }
  ok(sym, 'premium layout symmetric under all 8 rotations/reflections');
  ok(W.PREM[W.CENTER] === 3 && W.PREM[sq(0, 0)] === 1 && W.PREM[sq(0, 3)] === 4, 'centre star doubles the word; corners are DL; TW is the 4th square of an edge');
  let rowsWith = 0; for (let r = 0; r < 15; r++) { let any = false; for (let c = 0; c < 15; c++) if (W.PREM[sq(r, c)]) any = true; if (any) rowsWith++; }
  eq(rowsWith, 15, 'every row has a premium square');
}

// ------------------------------------------------------------ 2. scoring
{
  // RETAINS across row 7 from col 4: E on the (7,5) DL, I on the (7,9) DL, the star doubles the word.
  let a = W.analyzePlay(empty(), word('RETAINS', 7, 4, 0));
  ok(a.ok && a.bingo && a.score === (1 + 2 + 1 + 1 + 2 + 1 + 2) * 2 + 50, 'bingo: RETAINS at 7,4 = (10)x2 + 50 = 70 (got ' + a.score + ')');
  a = W.analyzePlay(empty(), word('RETAINS', 7, 4, 0, [6]));
  eq(a.score, (1 + 2 + 1 + 1 + 2 + 1 + 0) * 2 + 50, 'a blank scores nothing, even on a premium');
  a = W.analyzePlay(empty(), word('RETAINS', 4, 7, 1));
  eq(a.score, 70, 'the same word down scores the same (symmetric board)');
  // BAD with B on the (7,5) DL and D on the star.
  const b1 = empty();
  a = W.analyzePlay(b1, word('BAD', 7, 5, 0));
  eq(a.score, (4 * 2 + 1 + 2) * 2, 'BAD: letter premium then word premium = 22');
  put(b1, 'BAD', 7, 5, 0);
  a = W.analyzePlay(b1, word('ED', 8, 5, 1));
  ok(a.ok && a.words.length === 1 && a.words[0].word === 'BED' && a.score === 4 + 1 + 2, 'BED down from that B: the DL under B is used up, 7 points');
  a = W.analyzePlay(b1, word('ED', 8, 7, 1));
  ok(a.ok && a.words[0].word === 'DED' && a.score === 2 + 1 + 2 * 2, 'DED down through the star: the new D on the (9,7) DL doubles, the covered star does not (7)');
  // Parallel play: AT under HE makes AT, HA and ET; A sits on the (8,6) DL and counts double in both its words.
  const b2 = put(empty(), 'HE', 7, 6, 0);
  ok(W.PREM[sq(8, 6)] === 1 && W.PREM[sq(8, 7)] === 0, 'set-up: (8,6) is DL, (8,7) is plain');
  a = W.analyzePlay(b2, word('AT', 8, 6, 0));
  const ws = a.words.map((w) => w.word + '=' + w.score).sort().join(' ');
  ok(a.ok && ws === 'AT=3 ET=2 HA=4' && a.score === 9, 'cross-words: AT=3, HA=4, ET=2, total 9 (' + ws + ')');
  // One tile on a DW square making two words doubles both.
  const b3 = empty(); put(b3, 'AX', 1, 3, 1); put(b3, 'T', 3, 4, 0);
  a = W.analyzePlay(b3, word('E', 3, 3, 0));
  const w3 = a.words.map((w) => w.word + '=' + w.score).sort().join(' ');
  ok(a.ok && w3 === 'AXE=20 ET=4' && a.score === 24, 'one tile on 2W forming two words doubles both: AXE 20 + ET 4 (' + w3 + ')');
  // Triple word on the edge, triple letter.
  const b4 = put(empty(), 'O', 0, 4, 0);
  a = W.analyzePlay(b4, word('Z', 0, 3, 0));
  eq(a.score, (8 + 1) * 3, 'ZO with Z on the 3W edge square: 27');
  const b5 = put(empty(), 'A', 1, 2, 0);
  a = W.analyzePlay(b5, word('Q', 1, 1, 0));
  eq(a.score, 9 * 3 + 1, 'Q on 3L: 28');
}

// ------------------------------------------------------------ 3. placement legality
{
  const e = (b, t) => W.analyzePlay(b, t).error || 'ok';
  ok(/centre/.test(e(empty(), word('CAT', 0, 0, 0))), 'first word must cover the centre star');
  ok(/two letters/.test(e(empty(), word('A', 7, 7, 0))), 'first word needs two letters');
  ok(/one row or one column/.test(e(empty(), [{ sq: sq(7, 7), l: 0 }, { sq: sq(8, 8), l: 1 }])), 'diagonal placement refused');
  ok(/unbroken/.test(e(empty(), [{ sq: sq(7, 6), l: 0 }, { sq: sq(7, 8), l: 1 }, { sq: sq(7, 7 + 3), l: 2 }])), 'a gap in the line is refused');
  const b = put(empty(), 'CAT', 7, 6, 0);
  ok(/join/.test(e(b, word('DOG', 0, 0, 0))), 'a play not touching the board is refused');
  ok(/taken/.test(e(b, word('S', 7, 7, 0))), 'a covered square is refused');
  ok(e(b, [{ sq: sq(7, 5), l: L('S') }, { sq: sq(7, 9), l: L('S') }]) === 'ok', 'tiles either side of a word, through it, are one line');
  const a = W.analyzePlay(b, [{ sq: sq(7, 5), l: L('S') }, { sq: sq(7, 9), l: L('S') }]);
  eq(a.words[0].word, 'SCATS', 'the line through existing tiles reads SCATS');
  ok(/one row or one column/.test(e(b, [{ sq: sq(6, 6), l: 0 }, { sq: sq(8, 7), l: 0 }])), 'two tiles in different rows and columns refused');
  ok(e(b, word('S', 7, 9, 0)) === 'ok' && W.analyzePlay(b, word('S', 7, 9, 0)).words[0].word === 'CATS', 'a hook: one tile extending a word');
  ok(W.badWords(D, W.analyzePlay(b, word('X', 7, 9, 0)).words).join() === 'CATX', 'CATX is reported as not in the dictionary');
}

// ------------------------------------------------------------ 4. the game: draws, exchange, pass, end
{
  const mk = (seed) => W.newGame({ seed, players: [{ name: 'A', kind: 'human' }, { name: 'B', kind: 'cpu', level: 'hard' }] });
  const total = (st) => st.bag.length + st.players.reduce((a, p) => a + p.rack.length, 0) + st.board.filter((v) => v).length;
  const st = mk(7);
  ok(st.players.every((p) => p.rack.length === 7) && st.bag.length === 86 && total(st) === 100, 'new game: 7 tiles each, 86 in the bag');
  const st2 = mk(7);
  ok(JSON.stringify(st2.players.map((p) => p.rack)) === JSON.stringify(st.players.map((p) => p.rack)), 'the same seed deals the same racks');
  const before = st.players[0].rack.slice().sort().join('');
  const out = st.players[0].rack.slice(0, 3);
  ok(W.applyExchange(st, out).ok && st.players[0].rack.length === 7 && st.bag.length === 86 && total(st) === 100 && st.scoreless === 1, 'exchange 3: rack stays 7, bag stays 86, a scoreless turn');
  void before;
  st.bag.length = 6;
  ok(!W.applyExchange(st, st.players[0].rack.slice(0, 1)).ok, 'no exchange with fewer than 7 in the bag');
  const s3 = mk(9);
  for (let i = 0; i < 5; i++) { W.applyPass(s3); ok(W.endTurn(s3) === false, 'pass ' + (i + 1) + ' of 6: the game goes on'); }
  W.applyPass(s3);
  const rv = s3.players.map((p) => W.rackValue(p.rack));
  ok(W.endTurn(s3) === true && s3.over && s3.result.reason === 'scoreless' && s3.players[0].score === -rv[0] && s3.players[1].score === -rv[1], 'six scoreless turns end it; everyone loses their rack value (' + rv + ')');
  // Going out: bag empty, player 0 plays its last tiles and gains what the others hold.
  const s4 = mk(11);
  s4.bag = []; s4.players[0].rack = ['C', 'A', 'T']; s4.players[1].rack = ['Q', 'Z', 'E']; s4.players[0].score = 10; s4.players[1].score = 20;
  const r4 = W.applyPlay(s4, word('CAT', 7, 6, 0));
  ok(r4.ok && W.endTurn(s4) && s4.result.reason === 'out', 'playing out with the bag empty ends the game');
  eq(s4.players[0].score, 10 + 10 + (9 + 8 + 1), 'the player who went out: CAT 10 + the others\' 18');
  eq(s4.players[1].score, 20 - 18, 'the other player loses their 18');
  ok(s4.result.winners.length === 1 && s4.result.winners[0] === 0, 'winner is the higher final score');
  // three players: the one who goes out gains both other racks
  const s5 = W.newGame({ seed: 3, players: [{ name: 'A', kind: 'human' }, { name: 'B', kind: 'human' }, { name: 'C', kind: 'human' }] });
  s5.bag = []; s5.players[0].rack = []; s5.players[1].rack = ['K']; s5.players[2].rack = ['J', '?'];
  W.finish(s5, 0);
  ok(s5.result.adj.join() === '13,-5,-8', 'three players: +13 for going out, -5 and -8 (' + s5.result.adj + ')');
  ok(!W.applyPlay(mk(5), [{ sq: W.CENTER, l: L('Q') }, { sq: W.CENTER + 1, l: L('Q') }, { sq: W.CENTER + 2, l: L('Q') }]).ok, 'tiles not on the rack are refused');
}

// ------------------------------------------------------------ 5. challenge
{
  const st = W.newGame({ seed: 21, players: [{ name: 'A', kind: 'human' }, { name: 'B', kind: 'human' }], challenge: true });
  st.players[0].rack = ['X', 'Q', 'Z', 'E', 'E', 'R', 'T'];
  const snap = JSON.stringify({ board: st.board, bag: st.bag, rack: st.players[0].rack, score: st.players[0].score });
  const r = W.applyPlay(st, word('QXZ', 7, 6, 0));
  ok(r.ok && st.players[0].score > 0 && st.players[0].rack.length === 7, 'challenge mode: a phony goes down and draws');
  const c = W.challengeLast(st, D);
  ok(c.upheld && c.bad.join() === 'QXZ', 'challenging QXZ is upheld');
  ok(JSON.stringify({ board: st.board, bag: st.bag, rack: st.players[0].rack, score: st.players[0].score }) === snap, 'withdrawal restores board, bag order, rack and score exactly');
  ok(st.scoreless === 1 && st.moves[st.moves.length - 1].type === 'withdrawn', 'a withdrawn play is a scoreless turn');
  W.endTurn(st);
  st.players[1].rack = ['T', 'E', 'R', 'M', 'A', 'B', 'C'];
  W.applyPlay(st, word('TERM', 7, 5, 0));
  const sc = st.players[1].score;
  const c2 = W.challengeLast(st, D);
  ok(!c2.upheld && st.players[1].score === sc + 5 && st.last === null, 'a failed challenge of TERM gives its player 5 and closes the window');
}

// ------------------------------------------------------------ 6. save / load
{
  const st = W.newGame({ seed: 5, players: [{ name: 'A', kind: 'human' }, { name: 'B', kind: 'cpu', level: 'easy' }] });
  W.applyPlay(st, word(st.players[0].rack.slice(0, 2).join('').replace(/\?/g, 'A'), 7, 7, 0));
  const back = W.deserialize(W.serialize(st));
  ok(back && JSON.stringify(back) === JSON.stringify(st), 'save round-trips');
  eq(W.deserialize('{oops'), null, 'unparseable save -> null');
  eq(W.deserialize(JSON.stringify(Object.assign({}, st, { v: 0 }))), null, 'old version -> null');
  eq(W.deserialize(JSON.stringify(Object.assign({}, st, { bag: st.bag.slice(1) }))), null, 'a tile missing -> null');
  eq(W.deserialize(JSON.stringify(Object.assign({}, st, { board: st.board.slice(0, 100) }))), null, 'short board -> null');
  eq(W.deserialize(JSON.stringify(Object.assign({}, st, { turn: 9 }))), null, 'turn out of range -> null');
  let threw = 0;
  for (const junk of ['null', '[]', '1', '"x"', '{}', JSON.stringify({ v: 1 }), JSON.stringify({ v: 1, board: 5, players: 'x' })]) {
    try { if (W.deserialize(junk) !== null) threw++; } catch (e) { threw++; }
  }
  eq(threw, 0, 'junk saves come back null, never throw');
}

// ------------------------------------------------------------ 7. the whole page script compiles (the UI half is not run here)
{
  const all = html.slice(html.indexOf('<script id="ws-js">') + 19, html.lastIndexOf('</script>'));
  let err = '';
  try { new vm.Script(all); } catch (e) { err = e.message; }
  ok(!err && all.includes('// ---------- UI ----------'), 'the page script, UI half included, compiles' + (err ? ': ' + err : ''));
}

// ------------------------------------------------------------ 8. the shared snippets are still verbatim
{
  const tetris = fs.readFileSync(path.join(__dirname, '..', '..', 'tetris', 'index.html'), 'utf8');
  const backBlock = (s) => { const a = s.lastIndexOf('<style>', s.indexOf('/* dgames: the way back')); const e = s.indexOf('</a>', s.indexOf('<a class="dg-home"')); return s.slice(a, e + 4); };
  const hiBlock = (s) => { const a = s.indexOf('// ---------- dgames high scores ----------'); const f = s.indexOf('function makeHiScores', a); return s.slice(a, s.indexOf('\n}\n', f) + 2); };
  ok(backBlock(html) === backBlock(tetris) && backBlock(html).length > 800, 'back button is byte-identical to tetris (' + backBlock(html).length + ' bytes)');
  ok(hiBlock(html) === hiBlock(tetris) && hiBlock(html).length > 5000, 'high-score module is byte-identical to tetris (' + hiBlock(html).length + ' bytes)');
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
