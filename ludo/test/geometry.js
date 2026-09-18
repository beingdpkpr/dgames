// Headless board-geometry check (no browser). The rules tests prove the game obeys its own rules; this
// one proves the board those rules run on is actually shaped like a Ludo board — that the ring closes,
// the home runs meet it, and a token never gets told to stand somewhere off the grid or inside another
// player's colour. Run: node test/geometry.js
//
// Two slices, because the geometry straddles the UI boundary. The constants and the ring live in the
// pure section and come out of `globalThis.__ludo` the way rules.js takes them. `quadrantOf` and
// `spotOf` sit in the UI half and are not exported, so they are cut by their own landmarks — from the
// `function quadrantOf(` header to the `function render()` that follows `spotOf` — and evaluated in the
// same context as the pure section, which is where the names they reference (RING, HOME_RUN, YARD_AT,
// ringIndexOf, YARD, HOME, LAST_RING) are defined.
//
// spotOf's home-wedge coordinates are the reason this file exists: they are hand-placed magic numbers,
// the only part of the board nothing else checks, and the thing most likely to put a finished token on
// someone else's colour.
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const pure = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const geomStart = html.indexOf('function quadrantOf(');
const geomEnd = html.indexOf('\nfunction render()', geomStart);
if (geomStart < 0 || geomEnd < 0) { console.log('FAIL could not locate quadrantOf/spotOf in index.html'); process.exit(1); }
const geom = html.slice(geomStart, geomEnd);

const ctx = { Math, console, Array, Object, Number, String, Infinity, Map, Set, JSON,
  localStorage: { getItem: () => null, setItem: () => {} } };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(pure + '\n' + geom + '\nglobalThis.__geom = { quadrantOf, spotOf };', ctx);

const L = ctx.__ludo, G = ctx.__geom;
const { YARD, HOME, RING_LEN, LAST_RING, TOKENS, RING, START, HOME_RUN, YARD_AT, SAFE, ringIndexOf } = L;
const { quadrantOf, spotOf } = G;
const N = 15, PLAYERS = START.length, YARD_SIZE = 6, CENTRE_LO = 6, CENTRE_HI = 8;

let failures = 0;
const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures++; };
const key = ([c, r]) => c + ',' + r;
const inGrid = ([c, r]) => c >= 0 && c < N && r >= 0 && r < N;
const stepOf = (a, b) => [Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])];
const orthogonal = (a, b) => { const [dc, dr] = stepOf(a, b); return dc + dr === 1; };
const diagonal = (a, b) => { const [dc, dr] = stepOf(a, b); return dc === 1 && dr === 1; };

// 1. the ring: one closed loop of 52 squares
{
  assert(RING.length === RING_LEN, `the ring is ${RING.length} squares, RING_LEN says ${RING_LEN}`);
  const off = RING.filter((c) => !inGrid(c));
  assert(off.length === 0, `every ring square is inside the 15x15 grid (${off.length} outside${off.length ? ': ' + off.map(key).join(' ') : ''})`);
  const seen = new Set(RING.map(key));
  assert(seen.size === RING.length, `no ring square is listed twice (${RING.length} entries, ${seen.size} distinct)`);

  // The track turns the corner diagonally because the corner square itself belongs to the centre cross.
  // There should be exactly four such steps and they should be the four arm joins, not scattered.
  const diag = [], bad = [];
  for (let i = 0; i < RING.length; i++) {
    const a = RING[i], b = RING[(i + 1) % RING.length];
    if (diagonal(a, b)) diag.push(i);
    else if (!orthogonal(a, b)) bad.push(`${i}:${key(a)}->${key(b)}`);
  }
  assert(bad.length === 0, `every step is one square, orthogonal or diagonal (${bad.length} broken${bad.length ? ': ' + bad.join(' ') : ''})`);
  assert(diag.length === 4, `exactly four diagonal steps, one per corner (found ${diag.length} at [${diag}])`);
  const armLen = RING.length / 4;
  const atJoins = diag.every((i) => (i + 1) % armLen === 0);
  assert(atJoins, `the diagonals are the four arm joins at [${[armLen - 1, armLen * 2 - 1, armLen * 3 - 1, armLen * 4 - 1]}], not scattered (found [${diag}])`);
}

// 2. the home runs meet the ring and lead inward
{
  const all = [];
  for (let p = 0; p < PLAYERS; p++) {
    const run = HOME_RUN[p];
    assert(run.length === 5, `player ${p} has a five-square home run (has ${run.length})`);
    const off = run.filter((c) => !inGrid(c));
    assert(off.length === 0, `player ${p}'s home run is on the board (${off.length} off${off.length ? ': ' + off.map(key).join(' ') : ''})`);
    const onRingToo = run.filter((c) => RING.some((rc) => key(rc) === key(c)));
    assert(onRingToo.length === 0, `player ${p}'s home run never reuses a ring square (${onRingToo.map(key).join(' ') || 'none does'})`);
    let joined = true, breakAt = '';
    for (let i = 1; i < run.length; i++) if (!orthogonal(run[i - 1], run[i])) { joined = false; breakAt = `${key(run[i - 1])}->${key(run[i])}`; }
    assert(joined, `player ${p}'s home run is a connected line${joined ? '' : ', broken at ' + breakAt}`);

    // The join: the last square of the lap must sit next to the first square of the home run, or a token
    // on 50 could never step onto 51.
    const last = RING[ringIndexOf(p, LAST_RING)];
    assert(orthogonal(last, run[0]), `player ${p} steps from its last lap square ${key(last)} straight onto ${key(run[0])}`);
    all.push(...run.map(key));
  }
  assert(new Set(all).size === all.length, `no two players share a home-run square (${all.length} squares, ${new Set(all).size} distinct)`);
}

// 3. starts and safe squares
{
  const bad = START.filter((i) => !(Number.isInteger(i) && i >= 0 && i < RING_LEN));
  assert(bad.length === 0, `every start is a ring index 0..${RING_LEN - 1} (bad: [${bad}])`);
  assert(new Set(START).size === START.length, `the four starts are distinct ([${START}])`);
  const gaps = START.map((s, i) => (START[(i + 1) % PLAYERS] - s + RING_LEN) % RING_LEN);
  assert(gaps.every((g) => g === RING_LEN / PLAYERS), `the starts are evenly spaced ${RING_LEN / PLAYERS} apart (gaps [${gaps}])`);

  const safe = [...SAFE];
  const badSafe = safe.filter((i) => !(Number.isInteger(i) && i >= 0 && i < RING_LEN));
  assert(badSafe.length === 0, `every safe square is a ring index (bad: [${badSafe}])`);
  assert(safe.length === PLAYERS * 2, `eight safe squares: four starts and four stars (found ${safe.length}: [${safe.sort((a, b) => a - b)}])`);
  const stars = START.map((i) => (i + 8) % RING_LEN);
  const clash = stars.filter((s) => START.includes(s));
  assert(clash.length === 0, `no star lands on a start square (clashes: [${clash}])`);
}

// 4. yards, centre, and the whole board accounted for exactly once
{
  const claim = new Map();     // cell -> what claims it
  const add = (cell, what) => {
    const k = key(cell);
    if (claim.has(k)) claim.set(k, claim.get(k) + '+' + what);
    else claim.set(k, what);
  };
  RING.forEach((c) => add(c, 'ring'));
  HOME_RUN.forEach((run, p) => run.forEach((c) => add(c, 'run' + p)));
  YARD_AT.forEach(([yc, yr], p) => {
    for (let r = 0; r < YARD_SIZE; r++) for (let c = 0; c < YARD_SIZE; c++) add([yc + c, yr + r], 'yard' + p);
  });
  for (let r = CENTRE_LO; r <= CENTRE_HI; r++) for (let c = CENTRE_LO; c <= CENTRE_HI; c++) add([c, r], 'centre');

  const doubled = [...claim.entries()].filter(([, v]) => v.includes('+'));
  assert(doubled.length === 0, `no square is claimed twice (${doubled.length}${doubled.length ? ': ' + doubled.map(([k, v]) => k + '=' + v).join(' ') : ''})`);
  assert(claim.size === N * N, `ring + home runs + yards + centre cover all ${N * N} squares exactly (covered ${claim.size})`);

  const offBoard = [...claim.keys()].filter((k) => !inGrid(k.split(',').map(Number)));
  assert(offBoard.length === 0, `nothing is claimed outside the grid (${offBoard.join(' ') || 'none is'})`);
}

// 5. quadrantOf partitions the centre
{
  const owned = [0, 0, 0, 0], bad = [];
  for (let r = CENTRE_LO; r <= CENTRE_HI; r++) for (let c = CENTRE_LO; c <= CENTRE_HI; c++) {
    const q = quadrantOf(c, r);
    if (!Number.isInteger(q) || q < 0 || q >= PLAYERS) bad.push(`${c},${r}->${q}`);
    else owned[q]++;
  }
  assert(bad.length === 0, `every centre square maps to a player 0..${PLAYERS - 1} (bad: ${bad.join(' ') || 'none'})`);
  assert(owned.every((n) => n > 0), `every player owns part of the centre (counts [${owned}])`);
  assert(Math.max(...owned) <= 4, `no player swallows the centre (largest wedge ${Math.max(...owned)} of 9, counts [${owned}])`);
}

// 6. spotOf — where a token is actually drawn, for every player, token and progress
{
  const HOME_FIRST = LAST_RING + 1;
  let offBoard = [];
  for (let p = 0; p < PLAYERS; p++) {
    for (let t = 0; t < TOKENS; t++) {
      const progs = [YARD, HOME];
      for (let g = 0; g <= LAST_RING; g++) progs.push(g);
      for (let g = HOME_FIRST; g < HOME; g++) progs.push(g);
      for (const g of progs) {
        const [x, y] = spotOf(p, t, g);
        if (!(x >= 0 && x <= N && y >= 0 && y <= N)) offBoard.push(`p${p} t${t} g${g} -> ${x.toFixed(2)},${y.toFixed(2)}`);
      }
    }
  }
  assert(offBoard.length === 0, `every spot is inside the board for all players, tokens and progresses (${offBoard.length} outside${offBoard.length ? ': ' + offBoard.slice(0, 4).join(' | ') : ''})`);

  // the yard: four separate slots, each inside its owner's own corner
  for (let p = 0; p < PLAYERS; p++) {
    const [yc, yr] = YARD_AT[p];
    const spots = [];
    for (let t = 0; t < TOKENS; t++) spots.push(spotOf(p, t, YARD));
    const inside = spots.filter(([x, y]) => x > yc && x < yc + YARD_SIZE && y > yr && y < yr + YARD_SIZE);
    assert(inside.length === TOKENS, `player ${p}'s four yard slots sit inside its own 6x6 corner at ${yc},${yr} (${inside.length}/${TOKENS}: ${spots.map(([x, y]) => x + ',' + y).join(' ')})`);
    assert(new Set(spots.map(([x, y]) => x + ',' + y)).size === TOKENS, `player ${p}'s yard slots do not stack on each other (${spots.map(([x, y]) => x + ',' + y).join(' ')})`);
  }

  // ring and home-run spots are the cell centres they claim to be
  let mismatched = [];
  for (let p = 0; p < PLAYERS; p++) {
    for (let g = 0; g <= LAST_RING; g++) {
      const [c, r] = RING[ringIndexOf(p, g)], [x, y] = spotOf(p, 0, g);
      if (Math.abs(x - (c + 0.5)) > 1e-9 || Math.abs(y - (r + 0.5)) > 1e-9) mismatched.push(`p${p} g${g}`);
    }
    for (let g = HOME_FIRST; g < HOME; g++) {
      const [c, r] = HOME_RUN[p][g - HOME_FIRST], [x, y] = spotOf(p, 0, g);
      if (Math.abs(x - (c + 0.5)) > 1e-9 || Math.abs(y - (r + 0.5)) > 1e-9) mismatched.push(`p${p} g${g}`);
    }
  }
  assert(mismatched.length === 0, `every lap and home-run spot is the centre of the square it stands on (${mismatched.length} off${mismatched.length ? ': ' + mismatched.slice(0, 5).join(' ') : ''})`);

  // THE ONE THIS FILE EXISTS FOR: a finished token must land in the centre, in its OWN wedge, and not
  // on top of its three team-mates. These are hand-placed numbers with nothing else checking them.
  for (let p = 0; p < PLAYERS; p++) {
    const spots = [];
    for (let t = 0; t < TOKENS; t++) spots.push(spotOf(p, t, HOME));
    const desc = spots.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
    const inCentre = spots.filter(([x, y]) => x >= CENTRE_LO && x < CENTRE_HI + 1 && y >= CENTRE_LO && y < CENTRE_HI + 1);
    assert(inCentre.length === TOKENS, `player ${p}'s home tokens all land in the centre 3x3 (${inCentre.length}/${TOKENS}: ${desc})`);
    const wedges = spots.map(([x, y]) => quadrantOf(Math.floor(x), Math.floor(y)));
    assert(wedges.every((q) => q === p), `player ${p}'s home tokens sit on its OWN wedge, not a rival's colour (wedges [${wedges}] from ${desc})`);
    assert(new Set(spots.map(([x, y]) => x + ',' + y)).size === TOKENS, `player ${p}'s four home tokens fan out instead of stacking (${desc})`);
  }
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
