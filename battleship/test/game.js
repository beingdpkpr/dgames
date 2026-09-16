// Headless check of the pure game logic (no browser). Loads the logic section out of index.html and:
//  1. placement validation: overlap, out-of-bounds, both orientations, moving a ship over itself;
//  2. random placement: 500 fleets, each 17 cells, consistent with the grid, no overlap;
//  3. resolveShot: miss / hit / sunk, never the same cell twice, out-of-bounds is invalid;
//  4. AI: hunt-and-target behaviour on a fixed board, then 300 games against random fleets: never repeats a
//     cell, always finishes, and its average shots to sink the fleet is printed next to a pure-random baseline;
//  5. game-over detection.
// Run: node test/game.js
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { Math, console, Array, Map, Set, Object, Infinity, String }; ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const g = ctx.__bs;

let failures = 0;
const assert = (ok, msg) => { if (!ok) { failures++; console.log('FAIL', msg); } };
// Small seeded generator so the printed averages are reproducible.
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rng = mulberry32(20260915);
const cellsOnGrid = (b) => b.grid.flat().filter(v => v >= 0).length;

// 1. Placement validation.
{
  const b = g.makeBoard();
  assert(g.canPlace(b, 0, 0, 5, true), 'carrier fits at A1 horizontal');
  assert(g.canPlace(b, 0, 5, 5, true), 'carrier fits ending at J1');
  assert(!g.canPlace(b, 0, 6, 5, true), 'carrier rejected past the right edge');
  assert(g.canPlace(b, 5, 0, 5, false), 'carrier fits vertically ending at row 10');
  assert(!g.canPlace(b, 6, 0, 5, false), 'carrier rejected past the bottom edge');
  assert(!g.canPlace(b, -1, 0, 2, true) && !g.canPlace(b, 0, -1, 2, false), 'negative coordinates rejected');
  assert(g.placeShip(b, 0, 0, 0, true), 'placeShip carrier at A1');
  assert(cellsOnGrid(b) === 5 && b.ships[0].placed, 'carrier occupies 5 grid cells');
  assert(!g.canPlace(b, 0, 2, 3, false), 'vertical cruiser crossing the carrier is rejected');
  assert(!g.placeShip(b, 1, 0, 3, true), 'battleship overlapping the carrier is rejected');
  assert(!b.ships[1].placed && cellsOnGrid(b) === 5, 'rejected placement leaves the board unchanged');
  assert(g.canPlace(b, 1, 0, 3, true), 'cruiser just below the carrier is fine');
  assert(g.placeShip(b, 0, 0, 1, true), 'moving the carrier onto its own old cells is allowed');
  assert(cellsOnGrid(b) === 5 && b.grid[0][0] === -1 && b.grid[0][5] === 0, 'moved carrier vacates A1 and takes F1');
  assert(g.placeShip(b, 2, 0, 9, false) && b.grid[2][9] === 2, 'cruiser placed vertically down column J');
  assert(g.placeShip(b, 4, 9, 8, true) && b.grid[9][9] === 4, 'destroyer placed in the bottom-right corner');
  g.removeShip(b, 0); assert(cellsOnGrid(b) === 5 && !b.ships[0].placed, 'removeShip frees its cells');
  g.clearBoard(b); assert(cellsOnGrid(b) === 0 && !g.fleetComplete(b), 'clearBoard empties the grid');
}

// 2. Random placement, 500 fleets.
{
  let bad = 0;
  for (let n = 0; n < 500; n++) {
    const b = g.makeBoard(); const ok = g.autoPlace(b, rng);
    let cells = 0, consistent = true;
    for (const [i, s] of b.ships.entries()) {
      if (!s.placed || s.cells.length !== s.length) consistent = false;
      for (const [r, c] of s.cells) { if (!g.inBounds(r, c) || b.grid[r][c] !== i) consistent = false; cells++; }
    }
    if (!ok || !consistent || cells !== g.FLEET_CELLS || cellsOnGrid(b) !== g.FLEET_CELLS || !g.fleetComplete(b)) bad++;
  }
  assert(bad === 0, 'random placement produced ' + bad + ' invalid fleets');
  console.log('random placement x500: all fleets valid, 17 cells each:', bad === 0);
}

// 3. resolveShot.
{
  const b = g.makeBoard(); g.placeShip(b, 4, 3, 3, true); // destroyer at D4-E4
  assert(g.resolveShot(b, 0, 0).result === 'miss' && b.shots[0][0] === 1, 'miss recorded');
  assert(g.resolveShot(b, 0, 0).result === 'repeat' && b.shots[0][0] === 1, 'same cell twice is a repeat');
  assert(g.resolveShot(b, 10, 0).result === 'invalid' && g.resolveShot(b, 0, -1).result === 'invalid', 'out-of-bounds is invalid');
  const h = g.resolveShot(b, 3, 3); assert(h.result === 'hit' && h.ship === b.ships[4] && !b.ships[4].sunk, 'first hit reported as hit');
  assert(g.resolveShot(b, 3, 3).result === 'repeat' && b.ships[4].hits === 1, 'repeat on a hit cell does not count again');
  const s = g.resolveShot(b, 3, 4); assert(s.result === 'sunk' && s.ship.sunk && s.ship.name === 'Destroyer', 'second hit sinks the destroyer');
  assert(g.resolveShot(b, 3, 4).result === 'repeat', 'sunk cell cannot be shot again');
}

// 4a. AI targeting on a known board.
{
  const b = g.makeBoard(); g.placeShip(b, 2, 5, 3, true); // cruiser at D6 E6 F6
  const ai = g.aiCreate();
  assert(g.aiMode(ai) === 'hunt' && g.aiCandidates(ai, b).mode === 'hunt', 'starts in hunt mode');
  assert(g.aiCandidates(ai, b).cells.every(([r, c]) => (r + c) % 3 === 0), 'hunt lattice matches the smallest ship afloat (only a cruiser: mod 3)');
  { const full = g.makeBoard(); g.autoPlace(full, rng); assert(g.aiCandidates(g.aiCreate(), full).cells.every(([r, c]) => (r + c) % 2 === 0), 'full fleet: hunt prefers parity-2 cells while the destroyer is afloat'); }
  g.aiNotify(ai, 5, 4, g.resolveShot(b, 5, 4));
  let cand = g.aiCandidates(ai, b);
  assert(cand.mode === 'target' && cand.cells.length === 4 && cand.cells.every(([r, c]) => Math.abs(r - 5) + Math.abs(c - 4) === 1), 'after one hit, targets the four neighbours');
  g.aiNotify(ai, 5, 5, g.resolveShot(b, 5, 5));
  cand = g.aiCandidates(ai, b);
  assert(cand.mode === 'line' && cand.cells.length === 2 && cand.cells.some(([r, c]) => r === 5 && c === 3) && cand.cells.some(([r, c]) => r === 5 && c === 6), 'two hits in a row: only the line ends');
  g.aiNotify(ai, 5, 6, g.resolveShot(b, 5, 6));
  cand = g.aiCandidates(ai, b);
  assert(cand.mode === 'line' && cand.cells.length === 1 && cand.cells[0][1] === 3, 'a miss at one end leaves the other end');
  const sunk = g.resolveShot(b, 5, 3); g.aiNotify(ai, 5, 3, sunk);
  assert(sunk.result === 'sunk' && ai.hits.length === 0 && g.aiMode(ai) === 'hunt', 'sinking drops its hits and returns to hunt');
}

// 4b. 300 simulated games vs random fleets, plus a pure-random baseline.
function playAI(rng) {
  const b = g.makeBoard(); g.autoPlace(b, rng); const ai = g.aiCreate(); let shots = 0;
  while (!g.allSunk(b)) {
    const cell = g.aiChoose(ai, b, rng); if (!cell) return { shots, repeat: true, done: false };
    const res = g.resolveShot(b, cell[0], cell[1]); if (res.result === 'repeat' || res.result === 'invalid') return { shots, repeat: true, done: false };
    g.aiNotify(ai, cell[0], cell[1], res); shots++;
    if (shots > 100) return { shots, repeat: false, done: false };
  }
  return { shots, repeat: false, done: true };
}
function playRandom(rng) {
  const b = g.makeBoard(); g.autoPlace(b, rng); let shots = 0;
  const cells = []; for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) cells.push([r, c]);
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  for (const [r, c] of cells) { g.resolveShot(b, r, c); shots++; if (g.allSunk(b)) break; }
  return shots;
}
{
  const N = 300; let total = 0, repeats = 0, unfinished = 0, worst = 0, best = 100;
  for (let n = 0; n < N; n++) { const r = playAI(rng); total += r.shots; if (r.repeat) repeats++; if (!r.done) unfinished++; worst = Math.max(worst, r.shots); best = Math.min(best, r.shots); }
  let rtotal = 0; for (let n = 0; n < N; n++) rtotal += playRandom(rng);
  const avg = total / N, ravg = rtotal / N;
  console.log(`AI vs random fleets x${N}: avg ${avg.toFixed(1)} shots (best ${best}, worst ${worst}); pure random avg ${ravg.toFixed(1)}`);
  assert(repeats === 0, 'AI shot a cell twice in ' + repeats + ' games');
  assert(unfinished === 0, 'AI failed to finish ' + unfinished + ' games');
  assert(worst <= 100, 'AI needed more than 100 shots');
  assert(avg < 70, 'AI average too high: ' + avg.toFixed(1));
  assert(avg < ravg - 20, 'AI not clearly better than random');
}

// 5. Game over.
{
  const b = g.makeBoard(); g.autoPlace(b, rng);
  assert(!g.allSunk(b) && g.sunkCount(b) === 0, 'fresh fleet is not sunk');
  for (const s of b.ships.slice(0, 4)) for (const [r, c] of s.cells) g.resolveShot(b, r, c);
  assert(!g.allSunk(b) && g.sunkCount(b) === 4, 'four ships down is not game over');
  for (const [r, c] of b.ships[4].cells) g.resolveShot(b, r, c);
  assert(g.allSunk(b) && g.sunkCount(b) === 5, 'all five sunk is game over');
  assert(g.accuracy({ shots: 40, hits: 17 }) === 43 && g.accuracy({ shots: 0, hits: 0 }) === 0, 'accuracy rounding');
}

console.log(failures ? failures + ' FAILURE(S)' : 'all checks passed');
process.exit(failures ? 1 : 0);
