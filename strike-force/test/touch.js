// Headless touch-pad check (no browser). Pulls the shared touch-control snippet out of index.html with
// node's vm and asserts the two things that decide whether a phone can play at all: the thumbstick maps
// an offset to the right eight-way direction set, and every key code the pad emits is a code the game's
// KEYMAP actually understands. A pad button wired to a code the game ignores looks fine and does nothing,
// which is the failure this file exists to catch. Run: node test/touch.js
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'))
  + '\nglobalThis.__tp = { tpStickDirs, tpKeySynth, TP_SECTORS };';

class FakeKeyboardEvent {
  constructor(type, init) { this.type = type; Object.assign(this, init); }
}
const ctx = { Math, console, Array, Object, Number, String, Infinity, Map, Set, JSON, Date,
  KeyboardEvent: FakeKeyboardEvent, localStorage: { getItem: () => null, setItem: () => {} } };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const { tpStickDirs, tpKeySynth } = ctx.__tp;

let failures = 0;
const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures++; };
const same = (a, b) => a.length === b.length && a.every((v) => b.includes(v));

// 1. the eight compass points. Screen coordinates: +y is down, so (0,-1) is up.
const R2 = Math.SQRT1_2;
const compass = [
  [1, 0, ['right']], [R2, R2, ['right', 'down']], [0, 1, ['down']], [-R2, R2, ['left', 'down']],
  [-1, 0, ['left']], [-R2, -R2, ['left', 'up']], [0, -1, ['up']], [R2, -R2, ['right', 'up']],
];
for (const [dx, dy, want] of compass) {
  assert(same(tpStickDirs(dx, dy), want), `stick (${dx.toFixed(2)}, ${dy.toFixed(2)}) -> ${want.join('+')}`);
}

// 2. the deadzone: a thumb resting at the centre must not steer, or the kart/soldier drifts on its own
assert(tpStickDirs(0, 0).length === 0, 'dead centre holds nothing');
assert(tpStickDirs(0.2, 0.2).length === 0, 'inside the deadzone holds nothing');
assert(tpStickDirs(0, 0.36).length === 1, 'just past the deadzone starts holding');

// 3. every sector is reachable and no offset yields an unknown direction name
const names = new Set(['up', 'down', 'left', 'right']);
let sectorsSeen = new Set();
for (let a = 0; a < 360; a += 3) {
  const r = a * Math.PI / 180, dirs = tpStickDirs(Math.cos(r), Math.sin(r));
  if (!dirs.every((d) => names.has(d))) { assert(false, `angle ${a} produced an unknown direction`); break; }
  if (dirs.length < 1 || dirs.length > 2) { assert(false, `angle ${a} produced ${dirs.length} directions`); break; }
  sectorsSeen.add(dirs.join('+'));
}
assert(sectorsSeen.size === 8, `sweeping the circle reaches all 8 sectors (saw ${sectorsSeen.size})`);
// opposite directions can never be held together, which would cancel out in the game
assert(![...sectorsSeen].some((s) => s === 'left+right' || s === 'up+down'), 'never holds two opposing directions');

// 4. the synth sends transitions only: a thumb held still must not restream keydown every frame
{
  const sent = [];
  const synth = tpKeySynth({ dispatchEvent: (e) => sent.push(e.type + ':' + e.code) });
  synth.hold(['ArrowRight']);
  synth.hold(['ArrowRight']);
  synth.hold(['ArrowRight']);
  assert(sent.join(',') === 'keydown:ArrowRight', 'holding the same direction sends one keydown, not one per update');

  sent.length = 0;
  synth.hold(['ArrowRight', 'ArrowUp']);
  assert(sent.join(',') === 'keydown:ArrowUp', 'adding a diagonal presses only the new key');

  sent.length = 0;
  synth.hold(['ArrowUp']);
  assert(sent.join(',') === 'keyup:ArrowRight', 'dropping a direction releases only that key');

  sent.length = 0;
  synth.releaseAll();
  assert(sent.join(',') === 'keyup:ArrowUp', 'releaseAll lets go of what is still held');
  assert(synth.held.size === 0, 'nothing is held after releaseAll');

  // A finger lifted off the screen must not leave the soldier running. This is the bug that makes a
  // touch port feel broken, so it is worth its own check.
  sent.length = 0;
  synth.hold(['ArrowLeft', 'ArrowDown']);
  synth.releaseAll();
  assert(sent.filter((s) => s.startsWith('keyup')).length === 2, 'lifting off releases every direction it was holding');
}

// 5. the codes the pad is configured with must be codes this game maps. Read both straight out of the
// page text: the config lives in the UI section, which the vm slice above deliberately does not include.
{
  const keymap = html.slice(html.indexOf('const KEYMAP'), html.indexOf('function handleInput'));
  const mapped = new Set([...keymap.matchAll(/([A-Za-z]+[A-Za-z0-9]*)\s*:\s*'/g)].map((m) => m[1]));
  // lastIndexOf, not indexOf: the snippet's own usage comment shows the same line further up the file.
  const call = html.slice(html.lastIndexOf('const pad = makeTouchPad('), html.indexOf('function init()'));
  const used = [...call.matchAll(/(?:code|up|down|left|right)\s*:\s*'([^']+)'/g)].map((m) => m[1]);
  assert(used.length === 6, `the pad is wired to 6 codes (found ${used.length})`);
  for (const c of used) assert(mapped.has(c), `pad code ${c} is in the game's KEYMAP`);
}

// 6. end to end: a thumb on the real pad must move the real game. The pad only ever speaks in synthetic
// KeyboardEvents, so this drives the actual makeTouchPad against the actual `// --- input ---` block with a
// small DOM stand-in and asserts the game's own `keys` object flips. If this passes, the phone can play.
{
  const el = () => {
    const e = { style: {}, hidden: true, tabIndex: 0, textContent: '', children: [], listeners: {},
      classList: { add() {}, remove() {} },
      appendChild(c) { e.children.push(c); return c; }, setAttribute() {},
      setPointerCapture() {}, releasePointerCapture() {},
      addEventListener(t, fn) { (e.listeners[t] = e.listeners[t] || []).push(fn); },
      // 200x200 pad at the origin, so its centre is (100, 100) and its radius is 100.
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }) };
    Object.defineProperty(e, 'firstChild', { get: () => e.children[0] });
    return e;
  };
  const win = { listeners: {},
    addEventListener(t, fn) { (win.listeners[t] = win.listeners[t] || []).push(fn); },
    dispatchEvent(ev) { for (const fn of win.listeners[ev.type] || []) fn(ev); return true; } };
  class KeyEv { constructor(type, init) { this.type = type; Object.assign(this, init); this.preventDefault = () => {}; } }
  const doc = { head: el(), body: el(), createElement: el, getElementById: () => null,
    querySelector: () => null, addEventListener() {} };

  const padSrc = html.slice(html.indexOf('// ---------- dgames touch controls ----------'), html.indexOf('// ---------- UI ----------'));
  const inputSrc = html.slice(html.indexOf('// --- input ---'), html.indexOf('// --- game state ---'));
  const c = { Math, console, Array, Object, Number, String, Set, Map, JSON,
    KeyboardEvent: KeyEv, document: doc, window: win, matchMedia: () => ({ matches: true }), location: { search: '' } };
  c.globalThis = c;
  vm.createContext(c);
  vm.runInContext(padSrc + '\n' + inputSrc + '\nglobalThis.__e2e = { makeTouchPad, keys };', c);
  const { makeTouchPad, keys } = c.__e2e;

  const pad = makeTouchPad({
    stick: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' },
    buttons: [{ code: 'Space', label: 'JUMP' }, { code: 'KeyX', label: 'FIRE', main: true }],
  });
  assert(pad.el !== null, 'a coarse pointer gets a pad');

  const stick = pad.el.children[0];
  const fire = (target, type, x, y) => {
    const ev = { pointerId: 1, clientX: x, clientY: y, type, preventDefault: () => {} };
    for (const fn of target.listeners[type] || []) fn(ev);
  };
  const down = () => Object.keys(keys).filter((k) => keys[k]).sort().join('+');

  fire(stick, 'pointerdown', 190, 100);            // hard right of centre (100,100)
  assert(down() === 'right', `thumb right drives the game right (keys: ${down() || 'none'})`);
  fire(stick, 'pointermove', 170, 30);             // up and to the right
  assert(down() === 'right+up', `thumb up-right drives a diagonal (keys: ${down()})`);
  fire(stick, 'pointerup', 170, 30);
  assert(down() === '', `lifting the thumb stops the soldier (keys: ${down() || 'none'})`);

  const [jump, fireBtn] = pad.el.children[1].children;
  fire(fireBtn, 'pointerdown', 0, 0);
  assert(keys.fire === true, 'the FIRE button sets the game’s fire flag');
  fire(jump, 'pointerdown', 0, 0);
  assert(keys.jump === true && keys.fire === true, 'jump and fire hold together, as two thumbs would');
  fire(fireBtn, 'pointerup', 0, 0); fire(jump, 'pointerup', 0, 0);
  assert(down() === '', 'releasing both buttons clears them');

  // Backgrounding the tab mid-hold must not leave the soldier sprinting into a pit.
  fire(stick, 'pointerdown', 190, 100);
  for (const fn of win.listeners.blur || []) fn({});
  assert(down() === '', 'losing focus mid-hold releases everything');
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
