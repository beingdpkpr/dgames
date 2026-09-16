// Headless high-score check (no browser). Loads the makeHiScores module and the pure streak rule
// out of index.html with an in-memory localStorage and asserts: rank ordering (desc), the top-10
// cap, initials upper-cased and cut to three, and that applyStreak counts wins and draws, submits
// "<n> unbeaten" / "<w>W <d>D" on the loss that ends a streak, and submits nothing for a bare loss.
// Run: node test/hiscore.js
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'))
  + "\nglobalThis.__ttt = { makeHiScores, applyStreak };";
const m = new Map();
const ctx = { Math, console, Array, Infinity, Map, JSON, Date, localStorage: { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) } };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const { makeHiScores, applyStreak } = ctx.__ttt;

let failures = 0;
const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures++; };

// 1. the module
const hs = makeHiScores({ key: 'tic-tac-toe.normal', order: 'desc', max: 10, label: v => `${v} unbeaten` });
assert(hs.rank(1) === 0, 'empty table: any streak ranks first');
for (const v of [3, 9, 6]) hs.add(v, 'abc', `${v}W 0D`);
assert(hs.list().map(e => e.value).join(',') === '9,6,3', 'list sorted descending');
assert(hs.rank(10) === 0 && hs.rank(7) === 1 && hs.rank(6) === 2 && hs.rank(1) === 3, 'rank: 10 -> #1, 7 -> #2, 6 ties below the 6, 1 -> #4');
assert(hs.list()[0].initials === 'ABC', 'initials upper-cased');
assert(hs.add(1, 'deepak', '').initials === 'DEE', 'initials cut to three letters');
for (let i = 0; i < 12; i++) hs.add(100 + i, 'x', '');
assert(hs.list().length === 10 && hs.list()[9].value === 102, 'table capped at the ten best');
assert(hs.rank(101) === -1 && hs.rank(103) === 9, 'rank -1 below the tenth, 103 takes #10');
assert(m.has('dgames.hiscores.tic-tac-toe.normal'), 'stored under dgames.hiscores.<key>');

// 2. the streak rule
let r = applyStreak(undefined, 'you');
assert(r.next.wins === 1 && r.next.draws === 0 && r.ended === null, 'first win starts a streak, nothing submitted');
r = applyStreak(r.next, 'draw');
assert(r.next.wins === 1 && r.next.draws === 1 && r.ended === null, 'a draw extends the streak');
r = applyStreak(r.next, 'you');
assert(r.next.wins === 2 && r.next.draws === 1 && r.ended === null, 'another win: 2W 1D');
r = applyStreak(r.next, 'ai');
assert(r.ended && r.ended.value === 3 && r.ended.detail === '2W 1D', 'the loss submits 3 unbeaten, "2W 1D"');
assert(r.next.wins === 0 && r.next.draws === 0, 'the loss resets the streak');
r = applyStreak(r.next, 'ai');
assert(r.ended === null && r.next.wins === 0, 'a loss with no streak submits nothing');
r = applyStreak({ wins: 0, draws: 4 }, 'ai');
assert(r.ended && r.ended.value === 4 && r.ended.detail === '0W 4D', 'a draws-only streak still counts');

console.log(failures ? failures + ' FAILURE(S)' : 'all checks passed');
process.exit(failures ? 1 : 0);
