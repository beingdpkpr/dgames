// Headless check of the high-score table and the penfight scoring helper.
// Run: node test/hiscore.js   (from the penfight folder)
// Pulls `makeHiScores` and `penfightScore` out of index.html by locating their text and runs them in a
// vm sandbox with a stubbed localStorage, so no browser and no Three.js are needed.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// Extracts a top-level `function name(` declaration: from its header to the first `endMarker` after it.
function extractFunction(name, endMarker) {
  const start = html.indexOf('\nfunction ' + name + '(');
  assert.ok(start >= 0, `function ${name} not found in index.html`);
  const end = html.indexOf(endMarker, start);
  assert.ok(end > start, `end of function ${name} not found in index.html`);
  return html.slice(start + 1, end + endMarker.length);
}

const storage = new Map();
const sandbox = {
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  },
  document: { getElementById: () => null, createElement: () => ({ style: {} }), head: { appendChild() {} } },
  Date,
  JSON,
  Math,
  String,
  Array,
  Promise,
  console,
};
vm.createContext(sandbox);
const src = extractFunction('makeHiScores', 'return { key, rank, add, list, clear, prompt, render };\n}') + '\n'
  + extractFunction('penfightScore', 'return Math.round((flicks / pens) * 10) / 10;\n}') + '\n'
  + 'this.makeHiScores = makeHiScores; this.penfightScore = penfightScore;';
vm.runInContext(src, sandbox, { filename: 'penfight-hiscore.js' });
const { makeHiScores, penfightScore } = sandbox;

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok -', name); };

// ---- the scoring helper ----
test('flicks per pen, one decimal', () => {
  assert.strictEqual(penfightScore({ mode: 'ai', winner: 0, flicks: 3, pens: 2 }), 1.5);
  assert.strictEqual(penfightScore({ mode: 'ai', winner: 0, flicks: 4, pens: 3 }), 1.3);
  assert.strictEqual(penfightScore({ mode: 'ai', winner: 0, flicks: 5, pens: 3 }), 1.7);
  assert.strictEqual(penfightScore({ mode: 'ai', winner: 0, flicks: 2, pens: 2 }), 1);
  assert.strictEqual(penfightScore({ mode: 'ai', winner: 0, flicks: 1, pens: 3 }), 0.3);
});
test('not recorded: loss, draw, two-player, zero pens, zero flicks', () => {
  assert.strictEqual(penfightScore({ mode: 'ai', winner: 1, flicks: 3, pens: 2 }), null, 'computer won');
  assert.strictEqual(penfightScore({ mode: 'ai', winner: -1, flicks: 3, pens: 0 }), null, 'draw');
  assert.strictEqual(penfightScore({ mode: 'pvp', winner: 0, flicks: 3, pens: 2 }), null, 'two players');
  assert.strictEqual(penfightScore({ mode: 'ai', winner: 0, flicks: 3, pens: 0 }), null, 'no pens knocked off');
  assert.strictEqual(penfightScore({ mode: 'ai', winner: 0, flicks: 0, pens: 2 }), null, 'no flicks');
});

// ---- the table, as the game configures it ----
const table = (skill) => makeHiScores({ key: 'penfight.' + skill, order: 'asc', max: 10, label: (v) => `${v} flicks/pen`, title: `Best vs ${skill}` });

test('storage key per skill', () => {
  for (const skill of ['easy', 'medium', 'hard']) {
    const hs = table(skill);
    hs.clear();
    hs.add(2, 'abc', 'x');
    assert.ok(storage.has('dgames.hiscores.penfight.' + skill), 'key for ' + skill);
    assert.strictEqual(hs.key, 'penfight.' + skill);
  }
  assert.strictEqual(table('easy').list().length, 1);
  assert.strictEqual(table('hard').list().length, 1);
  assert.notStrictEqual(storage.get('dgames.hiscores.penfight.easy'), undefined);
});

test('asc ordering: lower flicks/pen ranks first', () => {
  const hs = table('medium');
  hs.clear();
  hs.add(2.5, 'BBB', '');
  hs.add(1.0, 'AAA', '');
  hs.add(1.7, 'CCC', '');
  assert.deepStrictEqual(hs.list().map((e) => e.value), [1.0, 1.7, 2.5]);
  assert.strictEqual(hs.rank(0.5), 0, 'better than everything goes first');
  assert.strictEqual(hs.rank(1.0), 1, 'a tie ranks after the earlier entry');
  assert.strictEqual(hs.rank(2.0), 2);
  assert.strictEqual(hs.rank(9.0), 3, 'still fits while the table is short');
});

test('top-10 cap and rank -1 when it misses the table', () => {
  const hs = table('hard');
  hs.clear();
  for (let i = 1; i <= 12; i++) hs.add(i, 'P' + i, '');
  const l = hs.list();
  assert.strictEqual(l.length, 10);
  assert.deepStrictEqual(l.map((e) => e.value), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.strictEqual(hs.rank(11), -1, 'worse than the tenth entry');
  assert.strictEqual(hs.rank(10), -1, 'equal to the tenth entry does not displace it');
  assert.strictEqual(hs.rank(9.9), 9, 'just better than the tenth takes the last row');
});

test('initials upper-cased and cut to three, blank becomes ???', () => {
  const hs = table('easy');
  hs.clear();
  const e = hs.add(1.2, 'deepak', '3 flicks, 2 pens, Classic desk');
  assert.strictEqual(e.initials, 'DEE');
  assert.strictEqual(e.detail, '3 flicks, 2 pens, Classic desk');
  assert.strictEqual(hs.add(1.4, '', '').initials, '???');
  assert.strictEqual(hs.add(1.6, 'ab', '').initials, 'AB');
});

test('survives corrupt storage', () => {
  storage.set('dgames.hiscores.penfight.easy', '{not json');
  assert.strictEqual(table('easy').list().length, 0);
  storage.set('dgames.hiscores.penfight.easy', '{"a":1}');
  assert.strictEqual(table('easy').list().length, 0);
  assert.strictEqual(table('easy').rank(5), 0, 'an empty table accepts the first score');
});

console.log(`\n${passed} checks passed`);
