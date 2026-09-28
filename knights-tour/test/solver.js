// Headless check of the rules and the solver (no browser). Loads the pure section of index.html with
// node's vm -- everything above the `// ---------- UI ----------` marker, which is the rules, the solver
// and the shared high-score snippet -- and drives it directly. Run: node test/solver.js
//
// The solver prunes hard (colour count, degree, connectivity), and a pruning rule that is slightly wrong
// does not crash: it quietly tells a player "no tour from here" when there is one. So every 'none' the
// solver gives below is checked against a plain exhaustive search with no pruning at all.
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const store = new Map();
const ctx = { Math, console, Array, Object, Number, String, JSON, Set, Map, Uint8Array, Int32Array, Float64Array, Infinity,
  localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) } };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const K = ctx.__kt;

let failures = 0, checks = 0;
const assert = (ok, msg) => { checks++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures++; };
function rngFrom(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const ms = (f) => { const t = process.hrtime.bigint(); const r = f(); return [r, Number(process.hrtime.bigint() - t) / 1e6]; };

// Reference: exhaustive DFS, no ordering, no pruning. Slow, but obviously right. Returns true/false, or
// null if it exceeds `cap` nodes (then the case is skipped rather than guessed).
function bruteHasTour(n, pathIn, cap = 3e6) {
  const N = n * n, nb = K.graph(n).nb, vis = new Uint8Array(N);
  for (const s of pathIn) vis[s] = 1;
  let nodes = 0, len = pathIn.length;
  const go = (here) => {
    if (len === N) return true;
    if (++nodes > cap) throw 'cap';
    for (const t of nb[here]) if (!vis[t]) { vis[t] = 1; len++; if (go(t)) return true; vis[t] = 0; len--; }
    return false;
  };
  try { return go(pathIn[pathIn.length - 1]); } catch (e) { if (e === 'cap') return null; throw e; }
}

// ---------------------------------------------------------------- 1. legal moves
{
  // Knight-graph edge counts are known: 48 on 5x5, 80 on 6x6, 120 on 7x7, 168 on 8x8 (4(n-1)(n-2)).
  for (const n of K.SIZES) {
    const deg = K.graph(n).nb.reduce((a, l) => a + l.length, 0);
    assert(deg / 2 === 4 * (n - 1) * (n - 2), `${n}x${n} knight graph has ${4 * (n - 1) * (n - 2)} edges (got ${deg / 2})`);
  }
  const lm = (n, p) => K.legalMoves(n, p).slice().sort((a, b) => a - b).join(',');
  assert(lm(8, [0]) === '10,17', 'a8 corner on 8x8 has exactly two moves (c7, b6)');
  assert(K.legalMoves(8, [27]).length === 8, 'a centre square on 8x8 has eight moves');
  assert(lm(8, [0, 10]) === '4,16,20,25,27', 'moves exclude the square already visited (c7 back to a8 is gone)');
  assert(K.legalMoves(5, [12]).every((s) => K.isKnightMove(5, 12, s)) && K.legalMoves(5, [12]).length === 8, 'centre of 5x5: eight moves, all knight moves');
  assert(K.onwardCount(8, [0], 10) === 5, 'onward count from c7 after a8 is 5 (6 neighbours minus a8)');
  assert(K.validPath(6, [0, 8, 16]) && !K.validPath(6, [0, 1]) && !K.validPath(6, [0, 8, 0]), 'validPath accepts knight steps, rejects a king step and a repeat');
  assert(K.isStuck(5, [0, 7, 14, 3]) === (K.legalMoves(5, [0, 7, 14, 3]).length === 0), 'isStuck is exactly "no legal move and board not full"');
}

// ---------------------------------------------------------------- 2. start squares, 5x5 and 6x6
for (const n of [5, 6]) {
  const [st, t] = ms(() => K.startStatus(n, 200000));
  const found = st.filter((s) => s === 'tour').length, none = st.filter((s) => s === 'none').length, unk = st.filter((s) => s === 'unknown').length;
  assert(unk === 0, `${n}x${n}: every start resolved within budget (${t.toFixed(1)}ms for all ${n * n})`);
  // Every 'tour' must be a real tour, and every 'none' must survive the exhaustive reference.
  let badTour = 0, badNone = 0;
  for (let i = 0; i < n * n; i++) {
    const r = K.solve(n, [i], 200000);
    if (st[i] === 'tour' && !(K.isComplete(n, r.tour) && r.tour[0] === i)) badTour++;
    if (st[i] === 'none' && bruteHasTour(n, [i], 5e7) !== false) badNone++;
  }
  assert(badTour === 0, `${n}x${n}: all ${found} tours found are complete and legal`);
  assert(badNone === 0, `${n}x${n}: all ${none} 'no tour' starts confirmed by exhaustive search`);
  if (n === 5) {
    const minority = [...Array(25).keys()].filter((i) => ((Math.floor(i / 5) + i % 5) & 1) === 1);
    assert(found === 13 && minority.every((i) => st[i] === 'none'), '5x5: the 13 majority-colour squares start a tour, the 12 minority squares do not');
  } else assert(found === 36, '6x6: a tour starts from all 36 squares');
}

// ---------------------------------------------------------------- 3. 7x7 and 8x8 from every start, timed
for (const n of [7, 8]) {
  const times = [], nodes = []; let ok = true;
  for (let i = 0; i < n * n; i++) {
    const [r, t] = ms(() => K.solve(n, [i], 200000));
    times.push(t); nodes.push(r.nodes);
    const majority = n % 2 === 0 || ((Math.floor(i / n) + i % n) & 1) === 0;
    if (majority ? !(r.status === 'found' && K.isComplete(n, r.tour)) : r.status !== 'none') ok = false;
  }
  const sum = times.reduce((a, b) => a + b, 0);
  assert(ok, `${n}x${n}: every start answered within a 200k-node budget (${n % 2 ? 'majority colour: tour, minority: none' : 'all 64 have a tour'})`);
  console.log(`     ${n}x${n} timings: total ${sum.toFixed(1)}ms, max ${Math.max(...times).toFixed(2)}ms, max ${Math.max(...nodes)} nodes`);
}
{
  let ok = true, max = 0;
  for (let i = 0; i < 64; i++) { const [r, t] = ms(() => K.solve(8, [i], 2e6, true)); max = Math.max(max, t); if (!(r.status === 'found' && K.isClosed(8, r.tour))) ok = false; }
  assert(ok, `8x8: a closed tour found from all 64 starts (max ${max.toFixed(1)}ms)`);
}

// ---------------------------------------------------------------- 4. dead-end detection vs exhaustive search
// Positions come two ways: pure random play, which is almost always dead, and a real tour followed for a
// while and then left by one random move, which is often still alive. Without the second kind the 6x6
// sample had no completable position in it at all, so it could not catch a rule that prunes a live one.
for (const [n, minLen, trials] of [[5, 2, 400], [6, 14, 300]]) {
  const R = rngFrom(n * 101);
  const tours = [...Array(n * n).keys()].map((i) => K.solve(n, [i], 200000).tour).filter(Boolean);
  let agree = 0, compared = 0, skipped = 0, noneSeen = 0, foundSeen = 0;
  for (let k = 0; k < trials; k++) {
    let p;
    const len = minLen + Math.floor(R() * (n * n - minLen));
    if (k % 2) {
      const t = tours[Math.floor(R() * tours.length)];
      p = t.slice(0, Math.max(1, len - 1));
      const m = K.legalMoves(n, p); if (m.length) p.push(m[Math.floor(R() * m.length)]);
    } else {
      p = [Math.floor(R() * n * n)];
      while (p.length < len) { const m = K.legalMoves(n, p); if (!m.length) break; p.push(m[Math.floor(R() * m.length)]); }
    }
    const v = K.solve(n, p, 2e6).status;
    const ref = bruteHasTour(n, p, 2e7);
    if (ref === null) { skipped++; continue; }
    compared++;
    if ((v === 'found') === ref && v !== 'unknown') agree++;
    if (v === 'none') noneSeen++; else if (v === 'found') foundSeen++;
  }
  assert(agree === compared && compared > trials * 0.8 && foundSeen > trials / 10, `${n}x${n}: dead-end verdict agrees with exhaustive search on ${agree}/${compared} random positions (${foundSeen} completable, ${noneSeen} dead; ${skipped} too big for the reference)`);
}
{
  // The sliced search the UI runs must reach the same answer as a single run.
  const R = rngFrom(42); let same = 0;
  for (let k = 0; k < 60; k++) {
    const p = [Math.floor(R() * 64)];
    while (p.length < 10 + (k % 30)) { const m = K.legalMoves(8, p); if (!m.length) break; p.push(m[Math.floor(R() * m.length)]); }
    const a = K.solve(8, p, 300000);
    const s = K.createSearch(8, p, 300000); while (s.step(97) === 'running');
    if (s.status === a.status && s.nodes === a.nodes) same++;
  }
  assert(same === 60, 'searching in 97-node slices gives the identical verdict and node count as one run (60 positions)');
  // A stuck position is a dead end by definition.
  let stuckOk = true;
  for (let k = 0; k < 200; k++) {
    const p = [Math.floor(R() * 36)];
    for (;;) { const m = K.legalMoves(6, p); if (!m.length) break; p.push(m[Math.floor(R() * m.length)]); }
    if (p.length < 36 && K.solve(6, p, 1000).status !== 'none') stuckOk = false;
  }
  assert(stuckOk, 'every position with no legal move and squares left is reported as no tour');
  // 8x8 mid-game: how often the UI budget gives up. Reported, and bounded so a regression shows.
  let unknown = 0, worst = 0; const R2 = rngFrom(9);
  // 100 positions, not more: each 'unknown' costs the full 1.5M nodes, and this is a gate, not a survey.
  for (let k = 0; k < 100; k++) {
    const p = [Math.floor(R2() * 64)];
    const len = 2 + Math.floor(R2() * 50);
    while (p.length < len) { const m = K.legalMoves(8, p); if (!m.length) break; p.push(m[Math.floor(R2() * m.length)]); }
    const [r, t] = ms(() => K.solve(8, p, 1500000));
    if (r.status === 'unknown') unknown++; worst = Math.max(worst, t);
  }
  // 5/100 measured when written (11/200 over a longer run). Random play is harsher than a person's: it leaves many positions that
  // are dead for a reason the three pruning rules cannot see, and those exhaust the budget. The bound
  // is there so that a change which weakens the solver shows up here.
  assert(unknown <= 9, `8x8 random mid-game positions: ${unknown}/100 'unknown' at the UI's 1.5M-node budget (slowest ${worst.toFixed(0)}ms; the UI runs it in 8ms slices)`);
}

// ---------------------------------------------------------------- 5. closed tours
{
  const closed = K.solve(6, [0], 1e6, true).tour;
  assert(K.isComplete(6, closed) && K.isClosed(6, closed), '6x6 closed tour: complete and closed');
  // Rotating a closed tour gives another closed tour; an open tour is complete but not closed.
  const rot = closed.slice(5).concat(closed.slice(0, 5));
  assert(K.isClosed(6, rot), 'a closed tour started from another point on the loop is still closed');
  let open = null;
  for (let i = 0; i < 36 && !open; i++) { const t = K.solve(6, [i], 1e6).tour; if (t && !K.isClosed(6, t)) open = t; }
  assert(open && K.isComplete(6, open) && !K.isClosed(6, open), 'an open 6x6 tour is complete but not closed');
  assert(!K.isClosed(6, closed.slice(0, 35)), 'a path one square short is not a closed tour');
  const bad = closed.slice(); [bad[10], bad[11]] = [bad[11], bad[10]];
  assert(!K.isClosed(6, bad), 'a tampered order (two squares swapped) is neither complete nor closed');
  let oddClosed = 0;
  for (const n of [5, 7]) for (let i = 0; i < n * n; i++) if (K.solve(n, [i], 500000, true).status === 'found') oddClosed++;
  assert(oddClosed === 0, 'no closed tour exists on 5x5 or 7x7 (odd boards), and the solver finds none');
}

// ---------------------------------------------------------------- 6. hints
{
  // From random completable positions, keep taking the hint: every hint must be a legal move, every
  // position after it must still have a tour, and following hints must finish the board.
  let ok = 0, total = 0;
  for (const n of [5, 6, 7, 8]) {
    const R = rngFrom(n * 7);
    for (let k = 0; k < 25; k++) {
      const starts = K.startStatus(n, 200000).map((s, i) => (s === 'tour' ? i : -1)).filter((i) => i >= 0);
      let p = [starts[Math.floor(R() * starts.length)]];
      // wander a little first, but only through positions the solver confirms
      for (let w = 0; w < Math.floor(R() * n * 2); w++) {
        const m = K.legalMoves(n, p).filter((s) => K.solve(n, p.concat([s]), 200000).status === 'found');
        if (!m.length) break; p.push(m[Math.floor(R() * m.length)]);
      }
      total++;
      let good = true;
      while (p.length < n * n) {
        const r = K.solve(n, p, 1500000);
        const h = K.hintFrom(p, r.tour);
        if (r.status !== 'found' || !K.legalMoves(n, p).includes(h)) { good = false; break; }
        p = p.concat([h]);
        if (p.length < n * n && K.solve(n, p, 1500000).status !== 'found') { good = false; break; }
      }
      if (good && K.isComplete(n, p)) ok++;
    }
  }
  assert(ok === total, `following hints completes the tour every time, each hint leaving a completable position (${ok}/${total}, sizes 5-8)`);
  // From a dead end, rescue names the shortest rewind that has a tour, and its move is legal there.
  const R = rngFrom(3); let rescued = 0, tried = 0;
  for (let k = 0; k < 40; k++) {
    const p = [0];
    for (;;) { const m = K.legalMoves(6, p); if (!m.length) break; p.push(m[Math.floor(R() * m.length)]); }
    if (p.length === 36) continue;
    tried++;
    const r = K.rescue(6, p, 200000), pre = p.slice(0, p.length - r.undo);
    const shorter = r.undo === 1 || K.solve(6, p.slice(0, p.length - r.undo + 1), 200000).status === 'none';
    if (r.next >= 0 && K.legalMoves(6, pre).includes(r.next) && K.solve(6, pre.concat([r.next]), 200000).status === 'found' && shorter) rescued++;
  }
  assert(rescued === tried, `rescue from ${tried} dead ends: shortest rewind, then a legal move that still completes (${rescued}/${tried})`);
}

// ---------------------------------------------------------------- 7. best times use the shared table, ascending
{
  const hs = ctx.makeHiScores({ key: 'knights-tour-6', order: 'asc', max: 10 });
  hs.add(95.2, 'A'); hs.add(61.7, 'B'); hs.add(120, 'C');
  assert(hs.list().map((e) => e.value).join(',') === '61.7,95.2,120', 'best times sort fastest first');
  assert(hs.rank(50) === 0 && hs.rank(100) === 2, 'a faster time ranks above a slower one');
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
