// Headless record check (no browser). Loads makeRecord out of index.html against an in-memory
// localStorage, the way strike-force/test/hiscore.js does, and asserts the win / loss / streak store
// round-trips, keeps table sizes apart, and survives junk in storage.
// Ludo has no score to rank, so there is deliberately no high-score table to test here.
// Run: node test/record.js
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));

const store = new Map();
const ctx = { Math, console, Array, Object, Number, String, Infinity, Map, Set, JSON,
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  } };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const { makeRecord } = ctx.__ludo;

let failures = 0;
const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures++; };

// 1. an empty store reads as a blank record rather than undefined
{
  const r = makeRecord();
  const b = r.get(4);
  assert(b.wins === 0 && b.losses === 0 && b.streak === 0 && b.best === 0, 'an unplayed table size starts blank');
  assert(r.key === 'dgames.ludo.record', 'the default key follows the dgames.<game>.<thing> convention');
}

// 2. wins build a streak, a loss ends it, and the best is remembered
{
  store.clear();
  const r = makeRecord();
  r.add(4, true); r.add(4, true); r.add(4, true);
  let v = r.get(4);
  assert(v.wins === 3 && v.streak === 3 && v.best === 3, 'three wins: 3W, streak 3, best 3');
  v = r.add(4, false);
  assert(v.losses === 1 && v.streak === 0, 'a loss ends the streak');
  assert(v.best === 3, 'the best streak survives the loss');
  assert(v.wins === 3, 'a loss does not touch the win count');
  r.add(4, true); r.add(4, true);
  v = r.get(4);
  assert(v.streak === 2 && v.best === 3, 'a shorter new streak does not lower the best');
  r.add(4, true); r.add(4, true);
  assert(r.get(4).best === 4, 'a longer streak raises the best');
}

// 3. table sizes are kept apart: a 2-player record must not bleed into a 4-player one
{
  store.clear();
  const r = makeRecord();
  r.add(2, true); r.add(2, true);
  r.add(4, false);
  assert(r.get(2).wins === 2 && r.get(2).streak === 2, 'the 2-player record holds its own wins');
  assert(r.get(4).wins === 0 && r.get(4).losses === 1, 'the 4-player record is separate');
  assert(r.get(3).wins === 0, 'an untouched table size is still blank');
}

// 4. it round-trips through storage rather than living in memory
{
  store.clear();
  makeRecord().add(3, true);
  const fresh = makeRecord();
  assert(fresh.get(3).wins === 1 && fresh.get(3).streak === 1, 'a new instance reads what the last one wrote');
  assert(store.has('dgames.ludo.record'), 'the value is actually in localStorage');
}

// 5. junk in storage must not take the game down on load
{
  store.clear();
  store.set('dgames.ludo.record', 'not json at all');
  assert(makeRecord().get(4).wins === 0, 'unparseable storage reads as blank');
  store.set('dgames.ludo.record', '[1,2,3]');
  assert(makeRecord().get(4).wins === 0, 'an array where an object belongs reads as blank');
  store.set('dgames.ludo.record', '{"4":{"wins":"nonsense"}}');
  const v = makeRecord().get(4);
  assert(v.losses === 0 && v.streak === 0 && v.best === 0, 'a partial entry is filled in with blanks');
  store.set('dgames.ludo.record', 'null');
  assert(makeRecord().get(2).wins === 0, 'a stored null reads as blank');
}

// 6. clear wipes everything
{
  store.clear();
  const r = makeRecord();
  r.add(2, true); r.add(4, true);
  r.clear();
  assert(r.get(2).wins === 0 && r.get(4).wins === 0, 'clear empties every table size');
}

// 7. a custom key keeps two stores from colliding, which is what the tests above rely on
{
  store.clear();
  const a = makeRecord('dgames.ludo.record'), b = makeRecord('dgames.ludo.other');
  a.add(4, true);
  assert(b.get(4).wins === 0, 'a record under a different key is untouched');
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
