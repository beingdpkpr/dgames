// The move generator (anchor squares + cross-checks over the DAWG). Run: node test/movegen.js
//
//  1. Completeness and soundness against brute force. On positions reached by real play, every placement of
//     up to 3 (full dictionary) or 4 (a small dictionary) rack tiles is enumerated the dumb way -- every line,
//     every start, every ordering of the rack, each checked by the referee and the dictionary -- and the
//     generator must produce exactly that set: nothing missed, nothing extra, no duplicates. Blanks included.
//  2. Known best moves: on an empty board with RETAINS the best play is found independently (every anagram in
//     the dictionary at every placement through the star) and the generator's best must equal it.
//  3. Fuzz: on many random positions with full racks, every generated move is legal, uses rack tiles, makes
//     only dictionary words, and carries the score the referee gives it.
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
const keyOf = (tiles) => tiles.map((t) => t.sq + ':' + t.l + (t.blank ? '*' : '')).sort().join(',');
const rngOf = (seed) => { const s = { r: seed }; return () => W.rngNext(s); };

// Every legal placement of rack tiles, the slow way.
function brute(dict, board, rack) {
  const out = new Map();
  const perms = [];
  const used = new Array(rack.length).fill(false);
  const cur = [];
  (function rec() {
    if (cur.length) perms.push(cur.slice());
    if (cur.length === rack.length) return;
    const seen = new Set();
    for (let i = 0; i < rack.length; i++) {
      if (used[i] || seen.has(rack[i])) continue;
      seen.add(rack[i]); used[i] = true;
      if (rack[i] === '?') { for (let l = 0; l < 26; l++) { cur.push({ l, blank: true }); rec(); cur.pop(); } }
      else { cur.push({ l: rack[i].charCodeAt(0) - 65, blank: false }); rec(); cur.pop(); }
      used[i] = false;
    }
  })();
  // Placements are tried square-run by square-run; a run that touches no tile (and misses the star on an
  // empty board) can never be legal, so it is skipped before any ordering is tried. The referee still
  // judges every run that remains.
  const empty = !board.some((v) => v);
  const near = (q) => { const r = (q / 15) | 0, c = q % 15; return (c > 0 && board[q - 1]) || (c < 14 && board[q + 1]) || (r > 0 && board[q - 15]) || (r < 14 && board[q + 15]); };
  for (const step of [1, 15]) {
    for (let s = 0; s < 225; s++) {
      if (board[s]) continue;
      const run = []; let q = s;
      while (run.length < rack.length && q < 225) {
        if (!board[q]) run.push(q);
        q = step === 1 ? (q % 15 === 14 ? 225 : q + 1) : q + 15;
      }
      for (let k = 1; k <= run.length; k++) {
        const sqs = run.slice(0, k);
        if (empty ? !sqs.includes(112) : !sqs.some(near)) continue;
        for (const p of perms) {
          if (p.length !== k) continue;
          const tiles = p.map((t, i) => ({ sq: sqs[i], l: t.l, blank: t.blank }));
          const an = W.analyzePlay(board, tiles);
          if (!an.ok || W.badWords(dict, an.words).length) continue;
          out.set(keyOf(tiles), an.score);
        }
      }
    }
  }
  return out;
}
function compare(dict, board, rack, label) {
  const gen = W.generateMoves(dict, board, rack);
  const g = new Map();
  let dup = 0;
  for (const m of gen) { const k = keyOf(m.tiles); if (g.has(k)) dup++; g.set(k, m.score); }
  const b = brute(dict, board, rack);
  let missing = 0, extra = 0, wrongScore = 0;
  for (const [k, v] of b) { if (!g.has(k)) missing++; else if (g.get(k) !== v) wrongScore++; }
  for (const k of g.keys()) if (!b.has(k)) extra++;
  return { ok: !dup && !missing && !extra && !wrongScore, n: b.size, dup, missing, extra, wrongScore, label };
}
// positions from real play: a seeded game between two Medium players, snapshotted every few turns
function positions(dict, seed, every, max) {
  const st = W.newGame({ seed, players: [{ name: 'a', kind: 'cpu', level: 'medium' }, { name: 'b', kind: 'cpu', level: 'medium' }] });
  const out = [st.board.slice()];
  let t = 0;
  while (!st.over && out.length < max) {
    const d = W.computerDecide(dict, st, st.turn, t);
    W.applyDecision(st, d); W.endTurn(st);
    if (++t % every === 0) out.push(st.board.slice());
  }
  return out;
}

// ------------------------------------------------------------ 1a. small dictionary, racks of 4 (one with a blank)
{
  const small = W.makeDict(W.buildDawg(('at ta tat tats cat cats act acts scat ten net nets nest sent tens tense ate eat eats tea teas seat east sat sea '
    + 'set sec etna ant ants tan tans nat cant cane canes scan scant can cans case cast tact enact sane snake ask asks sank tank tanks task neat ante ae ea es en ne na an as').split(' ')));
  let all = true, total = 0, cases = 0;
  const pos = positions(small, 4, 1, 14);
  const rnd = rngOf(99);
  const letters = 'AAEENSSTTCK';
  for (const board of pos) {
    for (let k = 0; k < 3; k++) {
      const rack = [];
      for (let i = 0; i < 4; i++) rack.push(letters[Math.floor(rnd() * letters.length)]);
      if (k === 2) rack[3] = '?';
      const r = compare(small, board, rack, rack.join(''));
      total += r.n; cases++;
      if (!r.ok) { all = false; console.log('  mismatch', r); }
    }
  }
  ok(all, 'small dictionary: generator = brute force on ' + cases + ' positions x racks (' + total + ' legal moves, blanks included)');
}
// ------------------------------------------------------------ 1b. full dictionary, racks of 3
{
  let all = true, total = 0, cases = 0;
  const t0 = performance.now();
  const rnd = rngOf(7);
  for (const seed of [1, 2]) {
    for (const board of positions(D, seed, 3, 6)) {
      const bag = Object.keys(W.TILESET).filter((c) => c !== '?');
      for (let k = 0; k < 3; k++) {
        const rack = [0, 1, 2].map(() => bag[Math.floor(rnd() * 26)]);
        if (k === 0 && cases % 4 === 0) rack[2] = '?';
        const r = compare(D, board, rack, rack.join(''));
        total += r.n; cases++;
        if (!r.ok) { all = false; console.log('  mismatch', r); }
      }
    }
  }
  ok(all, 'full dictionary: generator = brute force on ' + cases + ' positions x 3-tile racks (' + total + ' legal moves, ' + ((performance.now() - t0) / 1000).toFixed(1) + ' s)');
}

// ------------------------------------------------------------ 2. known best moves
{
  const board = new Array(225).fill(0);
  const rack = [...'RETAINS'];
  const anagrams = [];
  W.allWords(D, (w) => { if (w.length === 7 && [...w].sort().join('') === 'AEINRST') anagrams.push(w); });
  let best = 0, bestWhat = '';
  for (const w of anagrams) for (let c = 1; c <= 7; c++) {
    const tiles = [...w].map((ch, i) => ({ sq: 7 * 15 + c + i, l: ch.charCodeAt(0) - 65, blank: false }));
    const an = W.analyzePlay(board, tiles);
    if (an.ok && an.score > best) { best = an.score; bestWhat = w + '@' + c; }
  }
  const gen = W.generateMoves(D, board, rack).sort((a, b) => b.score - a.score);
  ok(anagrams.length >= 5 && gen[0].score === best && gen[0].tiles.length === 7, 'empty board, RETAINS: best is ' + best + ' (' + bestWhat + ' of ' + anagrams.join('/') + '); generator finds ' + gen[0].word + ' for ' + gen[0].score);
  // a hook position: QUA on the board; with rack D,Y the best is found and equals brute force
  const b2 = new Array(225).fill(0);
  [...'QAT'].forEach((ch, i) => { b2[7 * 15 + 6 + i] = ch.charCodeAt(0) - 64; });
  const r2 = compare(D, b2, ['S', 'H', 'E'], 'QAT+SHE');
  const g2 = W.generateMoves(D, b2, ['S', 'H', 'E']).sort((a, b) => b.score - a.score);
  ok(r2.ok, 'QAT on the board, rack SHE: generator = brute force (' + r2.n + ' moves; best ' + g2[0].word + ' ' + g2[0].score + ')');
  // nothing to play: a rack of consonants on an empty board generates nothing, and that is not an error
  ok(W.generateMoves(D, new Array(225).fill(0), ['Q', 'X', 'Z']).length === 0, 'rack QXZ on an empty board: no moves');
}

// ------------------------------------------------------------ 3. fuzz: full racks, full dictionary, many positions
{
  let moves = 0, bad = 0, positionsSeen = 0, slow = 0;
  const t0 = performance.now();
  for (let seed = 100; seed < 106; seed++) {
    const st = W.newGame({ seed, players: [{ name: 'a', kind: 'cpu', level: 'hard' }, { name: 'b', kind: 'cpu', level: 'easy' }] });
    let t = 0;
    while (!st.over && t < 80) {
      const p = W.cur(st);
      const t1 = performance.now();
      const gen = W.generateMoves(D, st.board, p.rack);
      slow = Math.max(slow, performance.now() - t1);
      positionsSeen++;
      for (const m of gen) {
        moves++;
        const an = W.analyzePlay(st.board, m.tiles);
        if (!an.ok || an.score !== m.score || W.badWords(D, an.words).length || !W.fromRack(p.rack, m.tiles) || an.words[0].word !== m.word) {
          bad++; if (bad < 5) console.log('  bad move', m.word, m.score, an.ok ? an.score : an.error);
        }
      }
      W.applyDecision(st, W.chooseMove(gen, p.rack, p.level, { bag: st.bag.length, seed: t, unseen: W.unseenFor(st, st.turn) }));
      W.endTurn(st); t++;
    }
  }
  ok(bad === 0 && moves > 50000, 'fuzz: ' + moves + ' generated moves on ' + positionsSeen + ' positions, every one legal, scored right, all words in the dictionary (' + ((performance.now() - t0) / 1000).toFixed(1) + ' s; slowest position ' + slow.toFixed(0) + ' ms)');
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
