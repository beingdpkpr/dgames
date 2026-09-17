// Headless rules check (no browser). Loads the pure RULES section out of index.html with node's vm and
// drives exact scenarios. This is only possible because the engine never draws a die itself: every move
// call takes the roll as an argument, so a capture, a block or a three-six forfeit can be set up on
// demand rather than waited for. Run: node test/rules.js
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { Math, console, Array, Object, Number, String, Infinity, Map, Set, JSON,
  localStorage: { getItem: () => null, setItem: () => {} } };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const L = ctx.__ludo;
const { YARD, HOME, LAST_RING, RING_LEN, START, SAFE, ringIndexOf } = L;

let failures = 0;
const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures++; };

// Build a state directly: `at` is [player][token] = progress. Anything omitted stays in the yard.
function setup(players, at, player = 0) {
  const s = L.newState(players);
  s.player = player;
  for (const p in at) at[p].forEach((g, t) => { if (g !== undefined && g !== null) s.tokens[p][t] = g; });
  return s;
}
const has = (moves, token) => moves.some((m) => m.token === token);
// The progress at which player `p` stands on ring index `idx`, or -1 if that square is not on its lap.
function progressFor(p, idx) {
  for (let g = 0; g <= LAST_RING; g++) if (ringIndexOf(p, g) === idx) return g;
  return -1;
}

// 1. a six is required to leave the yard
{
  const s = setup(4, {});
  for (let roll = 1; roll <= 5; roll++) assert(L.legalMoves(s, roll).length === 0, `roll ${roll} cannot bring a token out`);
  const six = L.legalMoves(s, 6);
  assert(six.length === 4, 'a six offers all four yarded tokens');
  assert(six.every((m) => m.from === YARD && m.to === 0), 'a token entering lands on its own start square');
}

// 2. a capture sends the victim home and buys another turn
{
  // put red on progress 5 and green wherever that square is on green's lap, if it is a capturable one
  const redTo = 10, idx = ringIndexOf(0, redTo);
  assert(!SAFE.has(idx), 'the square chosen for the capture test is not a safe one');
  const gp = progressFor(1, idx);
  const s = setup(4, { 0: [5], 1: [gp] });
  const m = L.legalMoves(s, 5).find((x) => x.token === 0);
  assert(!!m && m.to === redTo, 'red can move five to the square green occupies');
  assert(m.captures.length === 1 && m.captures[0].player === 1, 'the move is flagged as a capture of green');
  const res = L.applyMove(s, m);
  assert(s.tokens[1][0] === YARD, 'the captured token goes back to its yard');
  assert(res.extra === true && s.player === 0, 'a capture grants another turn');
}

// 3. a token on a safe square cannot be taken
{
  const star = [...SAFE].find((i) => !START.includes(i));
  const rp = progressFor(0, star), gp = progressFor(1, star);
  const s = setup(4, { 0: [rp - 3], 1: [gp] });
  const m = L.legalMoves(s, 3).find((x) => x.token === 0);
  assert(!!m && m.to === rp, 'red can land on the star square green is sitting on');
  assert(m.captures.length === 0, 'landing on a star captures nothing');
  L.applyMove(s, m);
  assert(s.tokens[1][0] === gp, 'the token on the star stays put');
}

// 3b. the same square, but a player's own start square rather than a star
{
  const idx = START[1], rp = progressFor(0, idx), gp = progressFor(1, idx);
  assert(gp === 0, "green's own start square is green's progress 0");
  const s = setup(4, { 0: [rp - 2], 1: [0] });
  const m = L.legalMoves(s, 2).find((x) => x.token === 0);
  assert(!!m && m.captures.length === 0, "a token on its own start square is safe from capture");
}

// 4. two tokens of one player wall a square off
{
  const idx = ringIndexOf(1, 4);
  assert(!SAFE.has(idx), 'the square chosen for the block test is not a safe one');
  const rp = progressFor(0, idx);
  const s = setup(4, { 0: [rp - 3], 1: [4, 4] });          // green doubled up, red three short of it
  assert(L.blockedFor(s, 0, idx) === true, 'two green tokens on one square form a block');
  assert(!has(L.legalMoves(s, 3), 0), 'red cannot land on the block');
  assert(!has(L.legalMoves(s, 5), 0), 'red cannot pass through the block either');
  assert(has(L.legalMoves(s, 2), 0), 'red can still move to a square short of the block');
  // the blocking player is not inconvenienced by its own wall
  s.player = 1;
  assert(has(L.legalMoves(s, 3), 0), 'green may move its own token off the block');
}

// 5. three sixes in a row forfeits the turn, and the third six is not played
{
  const s = setup(4, { 0: [10] });
  let r = L.beginRoll(s, 6);
  assert(!r.forfeit && s.sixes === 1 && s.player === 0, 'first six: still red to play');
  L.applyMove(s, r.moves.find((m) => m.token === 0));
  assert(s.player === 0, 'a six keeps the turn');
  r = L.beginRoll(s, 6);
  assert(!r.forfeit && s.sixes === 2, 'second six: still red');
  L.applyMove(s, r.moves.find((m) => m.token === 0));
  const before = s.tokens[0].slice();
  r = L.beginRoll(s, 6);
  assert(r.forfeit === true, 'third six in a row forfeits the turn');
  assert(r.moves.length === 0, 'the third six offers no move');
  assert(JSON.stringify(s.tokens[0]) === JSON.stringify(before), 'the forfeited six does not move anything');
  assert(s.player === 1 && s.sixes === 0, 'the turn passes and the six count resets');
}

// 5b. the count is consecutive, not cumulative
{
  const s = setup(4, { 0: [10] });
  L.applyMove(s, L.beginRoll(s, 6).moves.find((m) => m.token === 0));
  assert(s.sixes === 1, 'one six banked');
  L.applyMove(s, L.beginRoll(s, 3).moves.find((m) => m.token === 0));
  assert(s.sixes === 0, 'a non-six clears the run of sixes');
}

// 6. home takes the exact count
{
  const s = setup(4, { 0: [HOME - 3] });
  assert(!has(L.legalMoves(s, 4), 0), 'overshooting home is not a legal move');
  assert(!has(L.legalMoves(s, 6), 0), 'overshooting home by more is not legal either');
  assert(has(L.legalMoves(s, 3), 0), 'the exact count is legal');
  assert(has(L.legalMoves(s, 2), 0), 'stopping short inside the home run is legal');
  const m = L.legalMoves(s, 3).find((x) => x.token === 0);
  assert(m.to === HOME, 'the exact roll lands on home');
}

// 6b. nobody can be captured in the home run
{
  const s = setup(4, { 0: [LAST_RING + 2] });
  assert(L.capturesAt(s, 1, LAST_RING + 2).length === 0, 'the home run is out of everyone else’s reach');
}

// 7. a roll with nowhere to go passes the turn
{
  const s = setup(4, {});                                   // everyone in the yard
  const r = L.beginRoll(s, 4);
  assert(r.moves.length === 0, 'four yarded tokens and a roll of four is no move at all');
  assert(s.player === 1, 'the turn passes when there is nothing to play');
}

// 8. a game ends when one player gets all four tokens home
{
  const s = setup(2, { 0: [HOME, HOME, HOME, HOME - 1] });
  const res = L.applyMove(s, L.legalMoves(s, 1).find((m) => m.token === 3));
  assert(s.over === true && s.winner === 0, 'the fourth token home ends the game');
  assert(res.extra === false, 'no extra turn once the game is over');
  assert(L.legalMoves(s, 6).length === 0, 'no moves after the game is over');
}

// 9. a lap is 51 ring squares and the geometry closes up
{
  assert(L.RING.length === RING_LEN, 'the ring is 52 squares');
  assert(new Set(L.RING.map((c) => c.join(','))).size === RING_LEN, 'every ring square is distinct');
  for (let p = 0; p < 4; p++) {
    const last = L.RING[ringIndexOf(p, LAST_RING)], entry = L.HOME_RUN[p][0];
    const adj = Math.abs(last[0] - entry[0]) + Math.abs(last[1] - entry[1]) === 1;
    assert(adj, `player ${p} turns into its home run from an adjacent square`);
  }
  const homeCells = new Set(L.HOME_RUN.flat().map((c) => c.join(',')));
  assert(!L.RING.some((c) => homeCells.has(c.join(','))), 'no home-run square is also a ring square');
  assert(SAFE.size === 8, 'there are eight safe squares');
}

// 10. a full seeded game finishes and never reaches an illegal position
{
  const s = L.newState(4);
  const rnd = L.makeRng(20260917);
  let turns = 0;
  while (!s.over && turns < 4000) {
    turns++;
    const roll = L.rollDie(rnd);
    const r = L.beginRoll(s, roll);
    if (r.forfeit || !r.moves.length) continue;
    L.applyMove(s, L.aiMove(s, roll, 'normal', rnd));
    for (let p = 0; p < 4; p++) for (let t = 0; t < 4; t++) {
      const g = s.tokens[p][t];
      if (g !== YARD && (g < 0 || g > HOME)) { assert(false, `token ${p}/${t} left the board at ${g}`); turns = 4000; }
    }
  }
  assert(s.over, `a seeded four-player game finishes (took ${turns} rolls)`);
  assert(s.tokens[s.winner].every((g) => g === HOME), 'the winner has all four tokens home');
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
