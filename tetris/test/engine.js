// Headless engine check (no browser). Loads the pure section of index.html with node's vm -- everything
// above the `// ---------- UI ----------` marker, which is the engine plus the two shared snippets -- and
// drives it directly. Run: node test/engine.js
//
// Two design decisions make this possible and are worth protecting: gravity advances on a `dt` the caller
// supplies, and the 7-bag draws from an injected `rng`. Nothing in the engine reads a clock or calls
// Math.random, so a test can hand it exactly 0.49 seconds and assert a piece has NOT locked yet.
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const store = new Map();
const ctx = {
  Math, console, Array, Object, Number, String, JSON, Set, Map, Date, Infinity,
  localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
};
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const T = ctx.__tetris;

let failures = 0, checks = 0;
const assert = (ok, msg) => { checks++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures++; };

// A tiny seeded generator so every run is the same run.
function rngFrom(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const blank = () => T.makeBoard();
const game = (seed = 1) => T.newGame({ rng: rngFrom(seed) });
// Put a piece exactly where we want it, with a clean board underneath unless one is supplied.
function poised(type, rot, x, y, board) {
  const s = game(7);
  if (board) s.board = board;
  s.piece = { type, rot, x, y };
  s.grounded = false; s.lockTimer = 0; s.lockResets = 0; s.gravityAcc = 0;
  return s;
}

// ---------------------------------------------------------------- 1. rotation tables
{
  // Shape sanity: four rotations, four cells each, all inside the piece's own box.
  let bad = [];
  for (const t of T.TYPES) {
    for (let r = 0; r < 4; r++) {
      const c = T.ROT[t][r], n = T.SHAPES[t].box;
      if (c.length !== 4) bad.push(t + ' rot' + r + ' has ' + c.length + ' cells');
      for (const [x, y] of c) if (x < 0 || y < 0 || x >= n || y >= n) bad.push(t + ' rot' + r + ' cell ' + x + ',' + y + ' outside its ' + n + '-box');
    }
  }
  assert(bad.length === 0, 'every piece has 4 cells in every rotation, inside its box' + (bad.length ? ' -- ' + bad[0] : ''));

  // O must be rotationally identical, or it visibly wobbles.
  const key = (c) => c.map(p => p.join(',')).sort().join(' ');
  assert([1, 2, 3].every(r => key(T.ROT.O[r]) === key(T.ROT.O[0])), 'O is identical in all four rotations');

  // The I piece is the one everybody gets wrong: horizontal on row 1, vertical in column 2.
  assert(key(T.ROT.I[0]) === '0,1 1,1 2,1 3,1', 'I rot0 lies along row 1 (got ' + key(T.ROT.I[0]) + ')');
  assert(key(T.ROT.I[1]) === '2,0 2,1 2,2 2,3', 'I rot1 stands in column 2 (got ' + key(T.ROT.I[1]) + ')');

  // T nub direction per rotation: up, right, down, left.
  const nub = { 0: '1,0', 1: '2,1', 2: '1,2', 3: '0,1' };
  const off = Object.entries(nub).filter(([r, want]) => !key(T.ROT.T[+r]).split(' ').includes(want));
  assert(off.length === 0, 'T nub points up, right, down, left through rotations 0-3');
}

// ---------------------------------------------------------------- 2. kick tables
{
  const eight = ['0>1', '1>0', '1>2', '2>1', '2>3', '3>2', '3>0', '0>3'];
  for (const [name, tbl] of [['JLSTZ', T.KICK_JLSTZ], ['I', T.KICK_I]]) {
    const missing = eight.filter(k => !tbl[k]);
    assert(missing.length === 0, name + ' kick table covers all 8 transitions' + (missing.length ? ' -- missing ' + missing : ''));
    const wrong = eight.filter(k => tbl[k] && (tbl[k].length !== 5 || tbl[k][0][0] !== 0 || tbl[k][0][1] !== 0));
    assert(wrong.length === 0, name + ' every transition offers 5 offsets starting at (0,0)' + (wrong.length ? ' -- ' + wrong : ''));
  }

  // In open space nothing should need a kick: offset 0 fits, so the piece must not shift.
  let shifted = [];
  for (const t of T.TYPES) {
    if (t === 'O') continue;
    for (let r = 0; r < 4; r++) {
      const s = poised(t, r, 3, 8);
      const before = { x: s.piece.x, y: s.piece.y };
      T.tryRotate(s, 1);
      if (s.piece.x !== before.x || s.piece.y !== before.y) shifted.push(t + ' rot' + r);
      if (s.lastKick !== 0) shifted.push(t + ' rot' + r + ' used kick ' + s.lastKick);
    }
  }
  assert(shifted.length === 0, 'rotating in open space never kicks' + (shifted.length ? ' -- ' + shifted[0] : ''));

  // A real kick: I standing in column 0, rotated flat, must be pushed right to fit.
  {
    const s = poised('I', 1, -2, 5);
    const ok = T.tryRotate(s, 1);
    assert(ok && s.piece.x === 0, 'I against the left wall kicks clear (x -2 -> ' + s.piece.x + ', kick ' + s.lastKick + ')');
  }
  // T against the right wall.
  {
    const s = poised('T', 0, 8, 5);
    const ok = T.tryRotate(s, 1);
    assert(ok && s.piece.x === 7, 'T against the right wall kicks left (x 8 -> ' + s.piece.x + ')');
  }
  // A rotation that must FAIL: a flat T in a pocket three wide and two tall has nowhere to stand up.
  {
    const b = blank();
    for (let y = 0; y < T.ROWS; y++) for (let x = 0; x < T.COLS; x++) b[y][x] = (x >= 4 && x <= 6 && y >= 10 && y <= 11) ? 0 : 1;
    const s = poised('T', 0, 4, 10, b);
    assert(T.tryRotate(s, 1) === false, 'a T boxed into 3x2 refuses to rotate after all 5 kicks');
    assert(s.piece.rot === 0 && s.piece.x === 4, 'a refused rotation leaves the piece exactly where it was');
  }
}

// ---------------------------------------------------------------- 3. the 7-bag
{
  const s = game(42);
  // The order the player actually meets: the piece in play, then each one spawn() brings in. Reading
  // s.queue directly would double-count, because spawn() shifts off it as well as refilling it.
  const seen = [s.piece.type];
  for (let i = 0; i < 699; i++) { T.spawn(s); seen.push(s.piece.type); }
  let broken = null;
  for (let i = 0; i + 7 <= 700; i += 7) {
    const slice = seen.slice(i, i + 7).sort().join('');
    if (slice !== 'IJLOSTZ') { broken = 'bag at ' + i + ' was ' + slice; break; }
  }
  assert(broken === null, 'every 7 consecutive pieces contain all 7 shapes exactly once, over 100 bags' + (broken ? ' -- ' + broken : ''));

  // And the order genuinely varies -- a "bag" that always deals IJLOSTZ would pass the test above.
  const firsts = new Set();
  for (let i = 0; i < 700; i += 7) firsts.add(seen[i]);
  assert(firsts.size >= 4, 'bags are shuffled, not dealt in a fixed order (' + firsts.size + ' distinct openers)');

  // Seeded means reproducible.
  const a = game(99), bb = game(99);
  assert(a.queue.join('') === bb.queue.join(''), 'the same seed produces the same queue');
}

// ---------------------------------------------------------------- 4. line clearing
{
  // Two full rows with an untouched row between them, and a row with a gap that must survive.
  const b = blank();
  const R = T.ROWS;
  for (let x = 0; x < T.COLS; x++) { b[R - 1][x] = 1; b[R - 3][x] = 2; }
  for (let x = 0; x < T.COLS; x++) if (x !== 4) b[R - 2][x] = 3;   // gap at column 4
  const s = poised('I', 0, 0, 0, b);
  const n = T.clearLines(s);
  assert(n === 2, 'two full rows clear, the gapped row does not (cleared ' + n + ')');
  assert(s.board[R - 1].every((c, i) => (i === 4 ? c === 0 : c === 3)), 'the survivor falls to the bottom, gap intact');
  assert(s.board[R - 2].every(c => c === 0), 'and the row above it is empty again');
  assert(s.board.length === R, 'the board is still ' + R + ' rows after clearing (' + s.board.length + ')');
  assert(s.board[0].every(c => c === 0), 'fresh empty rows are pushed in at the top');

  // Four at once.
  const b2 = blank();
  for (let y = R - 4; y < R; y++) for (let x = 0; x < T.COLS; x++) b2[y][x] = 1;
  const s2 = poised('I', 0, 0, 0, b2);
  assert(T.clearLines(s2) === 4, 'four simultaneous rows all clear');
}

// ---------------------------------------------------------------- 5. scoring
{
  // Drop an I flat into a row that is one cell short, at level 1.
  function clearN(n, level) {
    const b = blank(), R = T.ROWS;
    for (let y = R - n; y < R; y++) for (let x = 4; x < T.COLS; x++) b[y][x] = 1;
    // leave columns 0-3 empty on those rows; an I laid flat fills them one row at a time
    const s = poised('I', 0, 0, R - n, b);
    s.level = level; s.score = 0; s.combo = -1; s.b2b = false;
    return s;
  }
  // single
  {
    const s = clearN(1, 1);
    s.piece.y = T.ROWS - 1 - 1;   // I rot0 sits on row y+1
    T.lockPiece(s);
    assert(s.lastClear.lines === 1 && s.score === T.SCORE[1], 'single scores ' + T.SCORE[1] + ' at level 1 (got ' + s.score + ')');
  }
  // tetris + level multiplier
  {
    const s = clearN(4, 1);
    s.piece = { type: 'I', rot: 1, x: 0, y: T.ROWS - 4 };   // vertical I fills 4 rows of column 2
    // vertical I occupies column 2 of its box -> x must place it in a still-empty column
    s.piece.x = 0;
    // fill the remaining empty cells so only column 2 is missing
    for (let y = T.ROWS - 4; y < T.ROWS; y++) for (let x = 0; x < T.COLS; x++) if (x !== 2) s.board[y][x] = 1;
    T.lockPiece(s);
    assert(s.lastClear.lines === 4, 'a vertical I completes four rows (got ' + s.lastClear.lines + ')');
    assert(s.score === T.SCORE[4], 'tetris scores ' + T.SCORE[4] + ' at level 1 (got ' + s.score + ')');
  }
  // level multiplies
  {
    const s = clearN(1, 5);
    s.piece.y = T.ROWS - 2;
    T.lockPiece(s);
    assert(s.score === T.SCORE[1] * 5, 'a single at level 5 scores ' + (T.SCORE[1] * 5) + ' (got ' + s.score + ')');
  }
  // hard drop pays 2 a cell, soft drop 1
  {
    const s = poised('T', 0, 4, 2);
    const from = s.piece.y, dropped = T.hardDrop(s);
    assert(dropped > 0 && s.score >= 2 * dropped, 'hard drop pays 2 per cell (' + dropped + ' cells, score ' + s.score + ')');
    const s2 = poised('T', 0, 4, 2); s2.score = 0;
    T.softDrop(s2);
    assert(s2.score === 1, 'soft drop pays 1 per cell (got ' + s2.score + ')');
  }
  // combo counts consecutive clearing pieces and resets on a piece that clears nothing
  {
    const s = game(3); s.combo = -1; s.level = 1;
    const fillOneShort = () => { const R = T.ROWS; for (let x = 1; x < T.COLS; x++) s.board[R - 1][x] = 1; };
    fillOneShort();
    s.piece = { type: 'I', rot: 1, x: -2, y: T.ROWS - 4 };   // vertical I into column 0
    T.lockPiece(s);
    assert(s.combo === 0, 'the first clearing piece sets combo 0 (got ' + s.combo + ')');
    fillOneShort();
    s.piece = { type: 'I', rot: 1, x: -2, y: T.ROWS - 4 };
    const before = s.score;
    T.lockPiece(s);
    assert(s.combo === 1, 'a second clearing piece in a row makes combo 1 (got ' + s.combo + ')');
    assert(s.score - before > T.SCORE[1] * s.level, 'the combo adds on top of the line score (+' + (s.score - before) + ')');
    s.piece = { type: 'O', rot: 0, x: 4, y: T.ROWS - 6 };   // well inside the visible well
    T.lockPiece(s);
    assert(s.combo === -1, 'a piece that clears nothing breaks the combo (got ' + s.combo + ')');
  }
  // back-to-back: a tetris after a tetris is worth half again
  {
    const mk = () => {
      const s = game(5); s.level = 1; s.score = 0; s.combo = -1;
      for (let y = T.ROWS - 4; y < T.ROWS; y++) for (let x = 0; x < T.COLS; x++) if (x !== 2) s.board[y][x] = 1;
      s.piece = { type: 'I', rot: 1, x: 0, y: T.ROWS - 4 };
      return s;
    };
    const first = mk(); T.lockPiece(first);
    const plain = first.score;
    const second = mk(); second.b2b = true; T.lockPiece(second);
    assert(second.score === Math.floor(plain * 1.5), 'a back-to-back tetris scores 1.5x (' + plain + ' -> ' + second.score + ')');
    assert(first.b2b === true, 'a tetris arms back-to-back for the next one');
  }
}

// ---------------------------------------------------------------- 6. T-spin detection
{
  // The 3-corner rule, tested directly: three filled corners around a T that ARRIVED BY ROTATION.
  const corners = (filled) => {
    const b = blank();
    const px = 4, py = 10;
    const spots = [[0, 0], [2, 0], [0, 2], [2, 2]];
    spots.forEach(([cx, cy], i) => { if (filled[i]) b[py + cy][px + cx] = 1; });
    const s = poised('T', 2, px, py, b);
    s.lastWasRotate = true; s.lastKick = 0;
    return s;
  };
  assert(T.tspinKind(corners([1, 1, 1, 1])) === 'tspin', 'four filled corners is a T-spin');
  assert(T.tspinKind(corners([1, 1, 1, 0])) !== null, 'three filled corners registers as a spin');
  assert(T.tspinKind(corners([1, 1, 0, 0])) === null, 'two filled corners is not a spin');
  {
    const s = corners([1, 1, 1, 1]);
    s.lastWasRotate = false;
    assert(T.tspinKind(s) === null, 'a T that was moved rather than rotated into place is not a spin');
  }
  {
    // rot 2 points the nub down, so the front corners are the lower pair; filling only the back pair
    // is the mini case -- unless the last kick offset was used.
    const s = corners([1, 1, 1, 0]);
    const kind = T.tspinKind(s);
    const s2 = corners([1, 1, 1, 0]); s2.lastKick = 4;
    assert(T.tspinKind(s2) === 'tspin', 'the last kick offset always counts as a full T-spin (plain case was "' + kind + '")');
  }
  // Only the T spins.
  {
    const b = blank();
    for (const [cx, cy] of [[0, 0], [2, 0], [0, 2], [2, 2]]) b[10 + cy][4 + cx] = 1;
    const s = poised('L', 2, 4, 10, b); s.lastWasRotate = true;
    assert(T.tspinKind(s) === null, 'an L in the same hole is not a T-spin');
  }
}

// ---------------------------------------------------------------- 7. lock delay
{
  const onFloor = () => {
    const s = game(11);
    s.piece = { type: 'O', rot: 0, x: 4, y: T.ROWS - 2 };
    s.grounded = false; s.lockTimer = 0; s.lockResets = 0; s.gravityAcc = 0; s.level = 1;
    return s;
  };
  {
    const s = onFloor();
    T.tick(s, 0.3, false);
    assert(s.piece && s.piece.type === 'O' && s.grounded, 'a grounded piece has not locked after 0.3s');
    T.tick(s, 0.3, false);
    assert(s.pieces === 1, 'it locks once the 0.5s delay is exceeded (pieces=' + s.pieces + ')');
  }
  {
    // Moving refreshes the delay.
    const s = onFloor();
    T.tick(s, 0.4, false);
    T.tryMove(s, -1, 0);
    assert(s.lockTimer === 0, 'a successful move resets the lock timer');
    T.tick(s, 0.4, false);
    assert(s.pieces === 0, 'so the piece is still falling 0.8s after landing');
  }
  {
    // ...but only so many times, or a piece could be stalled for ever.
    const s = onFloor();
    T.tick(s, 0.1, false);
    for (let i = 0; i < 40; i++) { T.tryMove(s, i % 2 ? -1 : 1, 0); T.tick(s, 0.1, false); }
    assert(s.lockResets <= T.LOCK_RESET_CAP, 'resets are capped at ' + T.LOCK_RESET_CAP + ' (used ' + s.lockResets + ')');
    assert(s.pieces >= 1, 'shuffling sideways for ever cannot prevent the lock (pieces=' + s.pieces + ')');
  }
}

// ---------------------------------------------------------------- 8. gravity is driven by dt
{
  const s = game(13);
  s.piece = { type: 'O', rot: 0, x: 4, y: 2 }; s.level = 1; s.gravityAcc = 0;
  const y0 = s.piece.y;
  T.tick(s, 0.99, false);
  assert(s.piece.y === y0, 'at level 1 the piece has not fallen after 0.99s (y ' + s.piece.y + ')');
  T.tick(s, 0.02, false);
  assert(s.piece.y === y0 + 1, 'and falls exactly one cell as 1.0s passes (y ' + s.piece.y + ')');
  assert(T.gravityFor(1) === 1 && T.gravityFor(20) > 0, 'gravity is 1.0s at level 1 and stays positive at 20');
  assert(T.gravityFor(10) < T.gravityFor(5), 'gravity accelerates with level (L5 ' + T.gravityFor(5).toFixed(3) + ' -> L10 ' + T.gravityFor(10).toFixed(3) + ')');
}

// ---------------------------------------------------------------- 9. hold
{
  const s = game(21);
  const first = s.piece.type, queued = s.queue[0];
  assert(T.holdPiece(s) === true, 'the first hold is allowed');
  assert(s.hold === first, 'it stores the falling piece (' + s.hold + ')');
  assert(s.piece.type === queued, 'and brings in the next from the queue (' + s.piece.type + ')');
  assert(T.holdPiece(s) === false, 'a second hold on the same piece is refused');
  const held = s.hold, now = s.piece.type;
  T.hardDrop(s);
  assert(s.holdUsed === false, 'the next piece may hold again');
  T.holdPiece(s);
  assert(s.hold === s.hold && s.piece.type === held, 'holding again swaps the stored piece back in (' + s.piece.type + ')');
}

// ---------------------------------------------------------------- 10. ghost
{
  const s = poised('T', 0, 4, 2);
  const g = T.ghostY(s);
  assert(g > s.piece.y, 'the ghost sits below the piece on an empty board (' + s.piece.y + ' -> ' + g + ')');
  assert(T.collides(s.board, 'T', 0, 4, g + 1), 'and one cell lower would collide');
  const before = s.piece.y;
  T.hardDrop(s);
  assert(s.pieces === 1, 'hard drop locks the piece where the ghost was');
  assert(before < g, 'hard drop travelled ' + (g - before) + ' cells');
}

// ---------------------------------------------------------------- 11. top-out
{
  // Fill the well to the very top, then ask for a new piece.
  const s = game(31);
  for (let y = 0; y < T.ROWS; y++) for (let x = 0; x < T.COLS; x++) s.board[y][x] = 1;   // buffer rows too
  s.over = false;
  T.spawn(s);
  assert(s.over === true, 'spawning into a full well ends the game');
  assert(s.piece === null, 'and leaves no piece in play');
}
{
  // A piece that comes to rest entirely in the hidden rows is a lock-out.
  const s = game(33);
  for (let y = T.BUFFER; y < T.ROWS; y++) for (let x = 0; x < T.COLS; x++) s.board[y][x] = 1;
  s.over = false;
  s.piece = { type: 'O', rot: 0, x: 4, y: 0 };
  T.lockPiece(s);
  assert(s.over === true, 'a piece locking wholly above the well ends the game');
}

// ---------------------------------------------------------------- 12. DAS / ARR
{
  const st = { t: 0, charged: false };
  assert(T.stepDas(st, 0.1, true) === 0, 'no repeat before the DAS delay (' + T.DAS + 's)');
  assert(T.stepDas(st, 0.06, true) === 1, 'the first repeat fires as DAS elapses');
  const n = T.stepDas(st, 0.1, true);
  assert(n === Math.floor(0.1 / T.ARR) || n === Math.floor(0.1 / T.ARR) + 1, '100ms of hold fires about ' + Math.round(0.1 / T.ARR) + ' repeats at ' + (T.ARR * 1000) + 'ms (got ' + n + ')');
  T.stepDas(st, 0.05, false);
  assert(st.t === 0 && st.charged === false, 'releasing the key discharges DAS');
}

console.log('\n' + (failures ? failures + ' of ' + checks + ' checks FAILED' : 'all ' + checks + ' checks passed'));
process.exit(failures ? 1 : 0);
