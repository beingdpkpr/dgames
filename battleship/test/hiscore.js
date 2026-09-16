// Headless check of the high-score module and the game's hook (no browser). Loads the logic section out of
// index.html with a stubbed localStorage and asserts: 'asc' ranking, top-10 cap, initials upper-cased and cut
// to three, and that hiscoreFor() turns a finished game's stats into the right value / detail.
// Run: node test/hiscore.js
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const mem = new Map();
const localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
const ctx = { Math, console, Array, Map, Set, Object, Infinity, String, JSON, Date, Promise, localStorage }; ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const g = ctx.__bs;

let failures = 0;
const assert = (ok, msg) => { if (!ok) { failures++; console.log('FAIL', msg); } };

const hs = g.makeHiScores({ key: 'battleship', order: 'asc', max: 10, label: v => v + ' shots' });
assert(hs.list().length === 0 && hs.rank(99) === 0, 'empty table: anything ranks first');
hs.add(40, 'abc', '43% accuracy'); hs.add(25, 'xyz', '68% accuracy'); hs.add(60, 'q', '28% accuracy');
const l = hs.list();
assert(l.map(e => e.value).join(',') === '25,40,60', 'asc order: fewest shots first, got ' + l.map(e => e.value));
assert(l[0].initials === 'XYZ' && l[2].initials === 'Q', 'initials upper-cased');
assert(hs.add(30, 'toolong', '').initials === 'TOO', 'initials cut to three letters');
assert(hs.rank(20) === 0 && hs.rank(35) === 2 && hs.rank(25) === 1, 'rank: strictly fewer shots beats an entry, a tie ranks after it');
assert(mem.has('dgames.hiscores.battleship'), 'stored under dgames.hiscores.battleship');
for (let i = 0; i < 20; i++) hs.add(70 + i, 'fil', '');
assert(hs.list().length === 10, 'table capped at 10, got ' + hs.list().length);
assert(hs.list()[9].value === 75, 'cap keeps the best 10 (10th is 75), got ' + hs.list()[9].value);
assert(hs.rank(76) === -1 && hs.rank(74) === 9, 'rank -1 once the table is full and the value is worse than the 10th');
hs.clear(); assert(hs.list().length === 0, 'clear empties the table');

// The game's hook: a won game with 40 shots and 17 hits.
const e = g.hiscoreFor({ shots: 40, hits: 17, misses: 23 });
assert(e.value === 40 && e.detail === '43% accuracy', 'hiscoreFor gives shots as value and rounded accuracy as detail, got ' + JSON.stringify(e));
assert(g.hiscoreFor({ shots: 17, hits: 17, misses: 0 }).detail === '100% accuracy', 'perfect game is 100% accuracy');

console.log(failures ? failures + ' FAILURE(S)' : 'hiscore: all checks passed');
process.exit(failures ? 1 : 0);
