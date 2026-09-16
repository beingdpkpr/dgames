// Headless check of the high-score table in index.html: pulls makeHiScores and formatRaceTime out of the
// page by locating their text (the file also carries the whole Three.js bundle, so it is never eval'd whole),
// runs them in a vm sandbox with a stubbed localStorage and asserts ordering, cap, initials and labels.
// Run: node test/hiscore.js   (from rush-lane/)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

/** Source of a top-level (2-space indented) function in the bundle, from its header to its closing brace. */
function extractFunction(name) {
  const header = `  function ${name}(`;
  const start = html.indexOf(header);
  assert.ok(start >= 0, `${name} not found in index.html`);
  assert.strictEqual(html.indexOf(header, start + 1), -1, `${name} appears more than once`);
  const end = html.indexOf('\n  }\n', start);
  assert.ok(end > start, `${name} closing brace not found`);
  return html.slice(start, end + 4);
}

const store = new Map();
const sandbox = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
  document: undefined, // rank/add/list never touch the DOM; prompt/render are not exercised here
  console,
};
vm.createContext(sandbox);
vm.runInContext(extractFunction('makeHiScores') + '\n' + extractFunction('formatRaceTime') +
  '\nthis.makeHiScores = makeHiScores; this.formatRaceTime = formatRaceTime;', sandbox);
const { makeHiScores, formatRaceTime } = sandbox;

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

// --- formatRaceTime: m:ss.t --------------------------------------------------
ok(formatRaceTime(0) === '0:00.0', 'zero');
ok(formatRaceTime(95.47) === '1:35.4', 'tenths are floored, not rounded');
ok(formatRaceTime(59.99) === '0:59.9', 'no carry into the minute');
ok(formatRaceTime(600.3) === '10:00.3', 'ten minutes');
ok(formatRaceTime(0.3) === '0:00.3', 'float tenths (0.3 * 10) do not lose a tenth');
ok(formatRaceTime(-1) === '—:——.—', 'negative is a dash');
ok(formatRaceTime(NaN) === '—:——.—', 'NaN is a dash');

// --- the circuit table: ascending, lower time is better -----------------------
const hs = makeHiScores({ key: 'rush-lane.test-circuit', order: 'asc', max: 10, label: formatRaceTime, title: 'Best times' });
ok(hs.rank(120) === 0, 'empty table: any time ranks first');
hs.add(100, 'abc', 'P1 of 4');
hs.add(90, 'zzzz', 'P1 of 4');
hs.add(110, '', 'P2 of 4');
let list = hs.list();
ok(list.map((e) => e.value).join(',') === '90,100,110', 'ascending order, fastest first: ' + list.map((e) => e.value));
ok(list[0].initials === 'ZZZ', 'initials cut to three: ' + list[0].initials);
ok(list[1].initials === 'ABC', 'initials upper-cased: ' + list[1].initials);
ok(list[2].initials === '???', 'blank initials become ???');
ok(hs.rank(80) === 0, 'faster than everything ranks first');
ok(hs.rank(95) === 1, 'in between ranks second');
ok(hs.rank(200) === 3, 'slowest still qualifies while the table has room');
ok(hs.rank(100) === 2, 'a tie is not better: it ranks behind the equal entry');
ok(list.every((e) => e.detail.startsWith('P')), 'detail is P<pos> of 4');
ok(typeof formatRaceTime(list[0].value) === 'string' && formatRaceTime(list[0].value) === '1:30.0', 'label of stored value');

// --- top-10 cap ------------------------------------------------------------------
for (let i = 0; i < 20; i++) hs.add(300 + i, 'S' + i, 'P4 of 4');
list = hs.list();
ok(list.length === 10, 'table capped at 10: ' + list.length);
ok(list[9].value === 306, 'the slow tail is dropped: last kept is ' + list[9].value);
ok(hs.rank(400) === -1, 'slower than the tenth entry misses the table');
ok(hs.rank(306) === -1, 'equal to the tenth entry misses the table');
ok(hs.rank(305.9) === 9, 'just faster than the tenth entry takes the last slot');
ok(hs.rank(1) === 0, 'a new record ranks first on a full table');

// --- persistence key and isolation between circuits ---------------------------------
ok(store.has('dgames.hiscores.rush-lane.test-circuit'), 'stored under dgames.hiscores.<key>');
const other = makeHiScores({ key: 'rush-lane.other', order: 'asc', label: formatRaceTime });
ok(other.list().length === 0, 'a different circuit key starts empty');
hs.clear();
ok(hs.list().length === 0 && hs.rank(999) === 0, 'clear empties the table');

console.log(`rush-lane hiscore: ${checks} checks passed`);
