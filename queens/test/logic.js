// Headless check of the puzzle logic (no browser). Lifts the pure section of index.html -- everything
// above the `// ---------- UI ----------` marker -- into node's vm and drives it directly.
// Run: node test/logic.js        (QUEENS_SEEDS=50 node test/logic.js for a quicker pass)
//
// What it holds the generator to, for every size 5..10 over 200 seeds each:
//   - n regions, every one non-empty and in one connected piece;
//   - exactly one solution, counted by an independent brute force written here, not the game's solver;
//   - the human-style deduction solver alone reaches that solution, and every step it takes is true;
//   - the hint loop, played from an empty board, only ever marks true things and finishes the puzzle.
// Plus conflict detection on hand-made boards, Daily determinism, glyph contrast, and that the two
// shared snippets are still byte-identical to tetris's copies.
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const { performance } = require('perf_hooks');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const store = new Map();
const ctx = {
  Math, console, Array, Object, Number, String, JSON, Set, Map, Date, Infinity, Uint8Array, Int32Array,
  localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
};
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const Q = ctx.__queens;
const { EMPTY, CROSS, QUEEN } = Q;

let failures = 0, checks = 0;
const assert = (ok, msg) => { checks++; if (!ok) { failures++; console.log('FAIL ' + msg); } return ok; };
const ok = (cond, msg) => { if (assert(cond, msg)) console.log('ok   ' + msg); };
const SEEDS = +process.env.QUEENS_SEEDS || 200;

// Independent brute force: row by row, every column, no pruning beyond the rules themselves.
function bruteCount(n, regions, cap = 2) {
  let count = 0; const col = [];
  const rec = (r, usedC, usedR) => {
    if (r === n) { count++; return count >= cap; }
    for (let c = 0; c < n; c++) {
      const g = regions[r * n + c];
      if (usedC & (1 << c) || usedR & (1 << g)) continue;
      if (r > 0 && Math.abs(col[r - 1] - c) <= 1) continue;
      col[r] = c;
      if (rec(r + 1, usedC | (1 << c), usedR | (1 << g))) return true;
    }
    return false;
  };
  rec(0, 0, 0);
  return count;
}
const boardFrom = (n, queens, crosses = []) => { const b = new Uint8Array(n * n); for (const [r, c] of queens) b[r * n + c] = QUEEN; for (const [r, c] of crosses) b[r * n + c] = CROSS; return b; };

// ------------------------------------------------------------ 1. conflict detection on crafted boards
{
  // 5x5, regions:   0 0 1 1 1
  //                 0 2 2 1 1
  //                 0 2 3 3 1
  //                 4 4 3 3 1
  //                 4 4 4 3 3
  const n = 5, regions = [0, 0, 1, 1, 1, 0, 2, 2, 1, 1, 0, 2, 3, 3, 1, 4, 4, 3, 3, 1, 4, 4, 4, 3, 3];
  let c = Q.findConflicts(n, regions, boardFrom(n, [[0, 0], [0, 3]]));
  ok(c.rows.length === 1 && c.rows[0] === 0 && c.queens.length === 2 && !c.cols.length, 'two queens in row 1: the row is flagged and both queens are red');
  c = Q.findConflicts(n, regions, boardFrom(n, [[0, 4], [3, 4]]));
  ok(c.cols.length === 1 && c.cols[0] === 4 && c.queens.length === 2, 'two queens in column 5: the column is flagged');
  c = Q.findConflicts(n, regions, boardFrom(n, [[0, 0], [2, 0]]));
  ok(c.regions.length === 1 && c.regions[0] === 0 && c.cols.length === 1, 'two queens in one region and column: both flagged');
  c = Q.findConflicts(n, regions, boardFrom(n, [[0, 2], [2, 4]]));
  ok(c.regions.length === 1 && c.regions[0] === 1 && !c.rows.length && !c.cols.length && !c.touching.length, 'two queens in one region, different rows and columns, not touching: only the region is flagged');
  c = Q.findConflicts(n, regions, boardFrom(n, [[1, 1], [2, 2]]));
  ok(c.touching.length === 1 && c.queens.length === 2 && !c.rows.length && !c.cols.length, 'diagonal neighbours touch: flagged as touching');
  c = Q.findConflicts(n, regions, boardFrom(n, [[1, 1], [3, 3]]));
  ok(!c.any, 'two queens two steps apart on a diagonal do not touch: queens do not attack along diagonals');
  c = Q.findConflicts(n, regions, boardFrom(n, [[0, 0]], [[0, 1], [0, 2], [1, 0]]));
  ok(!c.any && c.count === 1, 'X marks never conflict with anything');
  const sols = Q.solveExact(n, regions, 5);
  ok(sols.length >= 1, 'the crafted 5x5 has a solution (' + sols.length + ' found)');
  const b = boardFrom(n, sols[0].map((col, r) => [r, col]));
  ok(Q.isSolved(n, regions, b), 'a board holding a solution is solved');
  b[0 * n + sols[0][0]] = EMPTY;
  ok(!Q.isSolved(n, regions, b), 'one queen short is not solved');
}

// ------------------------------------------------------------ 2. colours
{
  let worst = Infinity, who = '';
  for (const p of Q.PALETTE) { const c = Q.contrast(p.hex, Q.INK); if (c < worst) { worst = c; who = p.name; } }
  ok(worst >= 4.5, `queen and X ink on every region colour >= 4.5:1 (worst ${worst.toFixed(2)}:1 on ${who})`);
  const clash = Q.contrast(Q.CLASH, '#ffffff');
  ok(clash >= 4.5, `a clashing queen (red, white outline) >= 4.5:1 against its outline (${clash.toFixed(2)}:1)`);
  ok(new Set(Q.PALETTE.map((p) => p.hex)).size === 10 && new Set(Q.PALETTE.map((p) => p.name)).size === 10, 'ten distinct, distinctly named region colours');
}

// ------------------------------------------------------------ 3. the generator, every size, many seeds
const q = (a, f) => a[Math.min(a.length - 1, Math.floor(a.length * f))];
const ruleUse = {};
const timing = [];
for (let n = 5; n <= 10; n++) {
  const times = [], attempts = [], grades = {}, minDist = [];
  let bad = { regions: 0, contiguous: 0, unique: 0, logic: 0, sound: 0, hintSound: 0, hintDone: 0, solutionMatch: 0 };
  for (let s = 1; s <= SEEDS; s++) {
    const seed = (n * 100003 + s * 7919) >>> 0;
    const t0 = performance.now();
    const p = Q.randomPuzzle(n, seed);
    times.push(performance.now() - t0);
    if (!p) { bad.unique++; continue; }
    attempts.push(p.attempts); grades[p.grade.label] = (grades[p.grade.label] || 0) + 1; minDist.push(p.minAdjacentDistance);
    const counts = new Array(n).fill(0);
    for (const g of p.regions) if (g >= 0 && g < n) counts[g]++;
    if (p.regions.length !== n * n || counts.some((k) => k === 0)) bad.regions++;
    if (!Q.regionsContiguous(n, p.regions)) bad.contiguous++;
    if (bruteCount(n, p.regions, 2) !== 1) bad.unique++;
    // the recorded solution really is one
    const sb = boardFrom(n, p.solution.map((c, r) => [r, c]));
    if (!Q.isSolved(n, p.regions, sb)) bad.solutionMatch++;
    const solCell = new Uint8Array(n * n); p.solution.forEach((c, r) => { solCell[r * n + c] = 1; });
    // deduction solver: solves it, and every step is true
    const G = Q.geometry(n, p.regions, p.names), L = Q.solveLogic(G);
    if (!L.solved || L.queens.some((i) => !solCell[i])) bad.logic++;
    for (const st of L.steps) {
      ruleUse[st.rule] = (ruleUse[st.rule] || 0) + 1;
      if ((st.kind === 'x' && st.cells.some((i) => solCell[i])) || (st.kind === 'queen' && st.cells.some((i) => !solCell[i]))) { bad.sound++; break; }
    }
    // hints, played exactly as the UI applies them, from an empty board to the end
    const cells = new Uint8Array(n * n);
    let guard = 0, soundHints = true;
    while (!Q.isSolved(n, p.regions, cells) && guard++ < 4 * n * n) {
      const h = Q.hintFor(p, cells);
      if (!h || h.kind === 'mistake') { soundHints = false; break; }
      if (h.kind === 'x') for (const i of h.cells) { if (solCell[i]) soundHints = false; if (cells[i] === EMPTY) cells[i] = CROSS; }
      if (h.kind === 'queen') for (const i of h.cells) { if (!solCell[i]) soundHints = false; cells[i] = QUEEN; }
      if (h.rule === 'reveal') soundHints = false; // the fallback must never be needed
    }
    if (!soundHints) bad.hintSound++;
    if (!Q.isSolved(n, p.regions, cells)) bad.hintDone++;
  }
  times.sort((a, b) => a - b); attempts.sort((a, b) => a - b);
  const total = Object.values(bad).reduce((a, b) => a + b, 0);
  ok(bad.regions === 0 && bad.contiguous === 0, `${n}x${n}: ${SEEDS} puzzles, each with ${n} non-empty, connected regions`);
  ok(bad.unique === 0 && bad.solutionMatch === 0, `${n}x${n}: every one has exactly one solution (independent brute force, capped at 2), and it is the recorded one`);
  ok(bad.logic === 0 && bad.sound === 0, `${n}x${n}: the deduction solver alone reaches it, and never takes a false step`);
  ok(bad.hintSound === 0 && bad.hintDone === 0, `${n}x${n}: hints from an empty board are all true and carry the puzzle to the end`);
  void total;
  timing.push({ n, med: q(times, 0.5), p95: q(times, 0.95), max: times[times.length - 1], att: q(attempts, 0.5), attMax: attempts[attempts.length - 1], grades,
    minDist: Math.min(...minDist) });
}
console.log('\ngeneration time per puzzle (ms, this machine, one attempt loop, no slicing):');
for (const t of timing) console.log(`  ${t.n}x${t.n}  median ${t.med.toFixed(1)}  p95 ${t.p95.toFixed(1)}  max ${t.max.toFixed(1)}   attempts median ${t.att} max ${t.attMax}   grades ${JSON.stringify(t.grades)}   closest touching colours ${t.minDist.toFixed(3)}`);
console.log('deduction rule use across all puzzles: ' + JSON.stringify(ruleUse) + '\n');
ok(ruleUse.subset2 > 0 && ruleUse.lookahead > 0 && ruleUse.confine > 0, 'the corpus exercises confinement, look-ahead and the k-regions-in-k-lines rule');

// ------------------------------------------------------------ 4. hints from boards a player could have
{
  let wrongQueen = 0, wrongCross = 0, partialSound = 0, partialTotal = 0, clashCaught = 0;
  const rng = Q.mulberry32(99);
  for (let s = 1; s <= 60; s++) {
    const n = 5 + (s % 6), p = Q.randomPuzzle(n, 5000 + s), N = n * n;
    const solCell = new Uint8Array(N); p.solution.forEach((c, r) => { solCell[r * n + c] = 1; });
    for (let trial = 0; trial < 10; trial++) {
      // a random correct partial board: some solution queens, some true Xs
      const cells = new Uint8Array(N);
      for (let i = 0; i < N; i++) { const x = rng(); if (solCell[i] && x < 0.3) cells[i] = QUEEN; else if (!solCell[i] && x < 0.35) cells[i] = CROSS; }
      if (Q.isSolved(n, p.regions, cells)) continue;
      const h = Q.hintFor(p, cells);
      partialTotal++;
      if (h && h.kind !== 'mistake' && h.rule !== 'reveal' && (h.kind === 'x' ? h.cells.every((i) => !solCell[i] && cells[i] === EMPTY) : h.cells.every((i) => solCell[i] && cells[i] !== QUEEN)) && h.cells.length) partialSound++;
    }
    // a wrong queen that clashes with nothing is still caught
    const wrong = [...Array(N).keys()].find((i) => !solCell[i]);
    let h = Q.hintFor(p, (() => { const b = new Uint8Array(N); b[wrong] = QUEEN; return b; })());
    if (h.kind === 'mistake' && h.cells.includes(wrong)) wrongQueen++;
    const right = p.solution[0];
    h = Q.hintFor(p, (() => { const b = new Uint8Array(N); b[right] = CROSS; return b; })());
    if (h.kind === 'mistake' && h.cells[0] === right) wrongCross++;
    const b2 = new Uint8Array(N); b2[0] = QUEEN; b2[1] = QUEEN;
    h = Q.hintFor(p, b2);
    if (h.kind === 'mistake' && h.cells.includes(0) && h.cells.includes(1)) clashCaught++;
  }
  ok(partialSound === partialTotal, `hints on ${partialTotal} random correct partial boards: every one changes an open cell and is true (${partialSound})`);
  ok(wrongQueen === 60 && wrongCross === 60 && clashCaught === 60, 'a wrong queen, an X over a solution cell, and two clashing queens are each pointed out instead of "deduced" from');
}

// ------------------------------------------------------------ 5. a few hand checks of single rules
{
  // A 1-cell region must be its own queen, and that must be the first thing a hint says.
  const p = Q.randomPuzzle(8, 4242), n = 8, G = Q.geometry(n, p.regions, p.names);
  const st = Q.newState(G);
  const first = Q.nextStep(G, st);
  ok(first && (first.kind === 'queen' || first.kind === 'x') && typeof first.reason === 'string' && first.reason.length > 20, 'the first step of a fresh puzzle comes with a plain-English reason: "' + (first && first.reason) + '"');
  const cells = new Uint8Array(n * n), i = 0;
  cells[i] = QUEEN;
  const ax = Q.autoCrosses(p, cells, i);
  ok(ax.length > 0 && ax.every((j) => G.kill[i][j] && cells[j] === EMPTY) && !ax.includes(i), 'auto-X marks exactly the empty cells a queen rules out');
}

// ------------------------------------------------------------ 6. Daily
{
  const a = Q.dailyPuzzle('2026-09-28'), b = Q.dailyPuzzle('2026-09-28');
  ok(JSON.stringify(a) === JSON.stringify(b), 'the Daily for a date is identical every time it is generated');
  const seen = new Set(); let dup = 0;
  for (let d = 1; d <= 30; d++) { const ds = '2026-11-' + String(d).padStart(2, '0'); const k = Q.dailyPuzzle(ds).regions.join(''); if (seen.has(k)) dup++; seen.add(k); }
  ok(dup === 0, 'thirty consecutive Dailies are all different');
  ok(Q.dailySize('2026-09-28') === 6 && Q.dailySize('2026-09-27') === 10 && Q.dailySize('2026-10-03') === 9, 'Daily size follows the weekday: Monday 6x6, Saturday 9x9, Sunday 10x10');
  // The UI generates in slices of steps; the result must be the same puzzle as the one-shot call.
  const gen = Q.makeGenerator(Q.dailySize('2026-09-28'), Q.dailyRng('2026-09-28'));
  let p = null; while (!p) p = gen.step();
  ok(p.regions.join() === a.regions.join() && p.solution.join() === a.solution.join(), 'stepping the generator gives the same Daily as generating it in one go');
}

// ------------------------------------------------------------ 7. the shared snippets are still verbatim
{
  const tetris = fs.readFileSync(path.join(__dirname, '..', '..', 'tetris', 'index.html'), 'utf8');
  const hsBlock = (s) => { const a = s.indexOf('// ---------- dgames high scores ----------'); const f = s.indexOf('function makeHiScores(', a); return s.slice(a, s.indexOf('\n}\n', f) + 3); };
  const backBlock = (s) => { const a = s.lastIndexOf('<style>', s.indexOf('/* dgames: the way back')); const e = s.indexOf('</a>', s.indexOf('<a class="dg-home"')); return s.slice(a, e + 4); };
  ok(hsBlock(html) === hsBlock(tetris) && hsBlock(html).length > 4000, 'high-score module is byte-identical to tetris (' + hsBlock(html).length + ' bytes)');
  ok(backBlock(html) === backBlock(tetris) && backBlock(html).length > 800, 'back button is byte-identical to tetris (' + backBlock(html).length + ' bytes)');
  const hs = vm.runInContext("makeHiScores({ key: 'queens-7', order: 'asc', max: 3 })", ctx);
  hs.add(9000, 'A'); hs.add(7000, 'B'); hs.add(8000, 'C');
  ok(hs.list().map((e) => e.value).join() === '7000,8000,9000' && hs.rank(7500) === 1 && hs.rank(9500) === -1, 'best times sort fastest first (order asc) and a slower time misses a full table');
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
