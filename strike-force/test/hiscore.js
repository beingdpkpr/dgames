// Headless high-score check (no browser). Loads makeHiScores and the pure sim out of index.html with an
// in-memory localStorage and asserts: rank ordering (desc), the top-10 cap, the player name kept as typed and cut to
// three, and that hsDetail reports "won" / "reached boss" / "reached checkpoint n" for finished games.
// Run: node test/hiscore.js
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------')) + "\nglobalThis.__hs = { makeHiScores };";
const m = new Map();
const ctx = { Math, console, Array, Object, Number, String, Infinity, Map, Set, JSON, Date,
  localStorage: { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) } };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const { makeHiScores } = ctx.__hs, S = ctx.__sf, C = S.C;

let failures = 0;
const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures++; };

// 1. the module, configured as the game configures it
const hs = makeHiScores({ key: 'strike-force', order: 'desc', max: 10, label: (v) => String(v) });
assert(hs.rank(100) === 0, 'empty table: any score ranks first');
for (const v of [300, 900, 600]) hs.add(v, 'abc', 'reached checkpoint 1');
assert(hs.list().map((e) => e.value).join(',') === '900,600,300', 'list sorted descending');
assert(hs.rank(1000) === 0 && hs.rank(700) === 1 && hs.rank(600) === 2 && hs.rank(1) === 3, 'rank: 1000 -> #1, 700 -> #2, 600 ties below the 600, 1 -> #4');
assert(hs.list()[0].initials === 'abc', 'name kept exactly as typed');
assert(hs.add(1, 'deepak', '').initials === 'deepak', 'a name under 12 characters is kept whole');
// 12 is the cap the input enforces; add() must enforce it too, because saved data outlives any input.
assert(hs.add(2, 'Bartholomew Cubbins', '').initials === 'Bartholomew', 'a long name is cut to 12');
assert(hs.add(3, '   ', '').initials === 'Player', 'whitespace-only falls back to Player');
for (let i = 0; i < 12; i++) hs.add(1000 + i, 'x', '');
assert(hs.list().length === 10 && hs.list()[9].value === 1002, 'table capped at the ten best');
assert(hs.rank(1001) === -1 && hs.rank(1003) === 9, 'rank -1 below the tenth, 1003 takes #10');
assert(m.has('dgames.hiscores.strike-force'), 'stored under dgames.hiscores.strike-force');

// 2. the game's own detail hook, on games driven to their end
const NONE = { left: false, right: false, up: false, down: false, jump: false, fire: false };
const inp = (o) => ({ ...NONE, ...o });
function bot(g) {
  const p = g.player, L = g.level, aheadX = p.x + p.w + 30, feetY = p.y + p.h + 2;
  const gapAhead = p.onGround && !S.pointIn(L, aheadX, feetY, false) && !S.pointIn(L, aheadX, feetY + 30, false);
  const wallAhead = p.onGround && (p.blocked || S.pointIn(L, aheadX - 10, p.y + p.h - 6, true));
  return inp({ right: true, fire: true, jump: gapAhead || wallAhead || (!p.onGround && p.vy < 0) });
}
const run = (g, input, n, until) => { for (let i = 0; i < n && !until(); i++) S.step(g, typeof input === 'function' ? input() : input); };
// a) three pit deaths right at the start: game over, no checkpoint
let g = S.createGame(); S.startGame(g);
for (let i = 0; i < C.LIVES; i++) { g.player.y = 700; run(g, NONE, C.DEATH_FRAMES + 5, () => false); }
assert(g.state === 'gameover' && S.hsDetail(g) === 'reached no checkpoint', 'game over before any flag: "' + S.hsDetail(g) + '"');
// b) game over after passing the first flag
g = S.createGame(); S.startGame(g); g.player.x = 1100; S.step(g, NONE);
for (let i = 0; i < C.LIVES; i++) { g.player.y = 700; run(g, NONE, C.DEATH_FRAMES + 5, () => false); }
assert(g.state === 'gameover' && S.hsDetail(g) === 'reached checkpoint 1', 'game over after flag 1: "' + S.hsDetail(g) + '"');
// c) game over inside the boss arena
g = S.createGame({ god: true }); S.startGame(g);
run(g, () => bot(g), 60 * 120, () => g.bossActive);
g.opts.god = false;
for (let i = 0; i < C.LIVES; i++) { g.player.y = 700; run(g, NONE, C.DEATH_FRAMES + 5, () => false); }
assert(g.state === 'gameover', 'bot run then three deaths ends in game over');
assert(S.hsDetail(g) === 'reached checkpoint 5', 'losing in the arena reports the last flag once respawn clears bossActive: "' + S.hsDetail(g) + '"');
// d) win
g = S.createGame({ god: true }); S.startGame(g);
run(g, () => bot(g), 60 * 200, () => g.state === 'won');
assert(g.state === 'won' && S.hsDetail(g) === 'won', 'win reports "won" (score ' + g.score + ')');
assert(g.score > 0 && hs.rank(g.score) === 0, 'a winning score of ' + g.score + ' would top the seeded table');
// e) the boss-active case as it stands at the moment of a final death (before any respawn)
g = S.createGame({ god: true }); S.startGame(g);
run(g, () => bot(g), 60 * 120, () => g.bossActive);
g.opts.god = false; g.lives = 1; g.player.y = 700; run(g, NONE, C.DEATH_FRAMES + 5, () => false);
assert(g.state === 'gameover' && S.hsDetail(g) === 'reached boss', 'final death in the arena reports "reached boss": "' + S.hsDetail(g) + '"');

console.log(failures ? failures + ' FAILURE(S)' : 'all checks passed');
process.exit(failures ? 1 : 0);
