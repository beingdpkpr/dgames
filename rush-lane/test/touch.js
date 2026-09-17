// Headless touch-pad check (no browser). rush-lane is a single bundled file, so there are no
// 'use strict' / UI section markers to slice on the way strike-force has; this file cuts two regions out
// of index.html by their own landmarks instead:
//   the pad  — from '// ---------- dgames touch controls ----------' up to the bundle IIFE '(() => {'
//   the input — from 'var KEY_MAP = {' up to the next bundled module comment (BufferGeometryUtils)
// It then drives the real makeTouchPad against the real InputHandler and asserts the actions the game
// would act on actually go held. A pad button wired to a code KEY_MAP does not list looks perfectly fine
// on screen and does nothing, which is the failure this file exists to catch. Run: node test/touch.js
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const padSrc = html.slice(html.indexOf('// ---------- dgames touch controls ----------'), html.indexOf('\n(() => {'));
const inputSrc = html.slice(html.indexOf('  var KEY_MAP = {'), html.indexOf('  // node_modules/three/examples/jsm/utils/BufferGeometryUtils.js'));

let failures = 0;
const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures++; };
const same = (a, b) => a.length === b.length && a.every((v) => b.includes(v));

// --- a DOM and a window just large enough for the pad to build itself into ---
const el = () => {
  const e = { style: {}, hidden: true, tabIndex: 0, textContent: '', children: [], listeners: {},
    classList: { add() {}, remove() {} },
    appendChild(c) { e.children.push(c); return c; }, setAttribute() {},
    setPointerCapture() {}, releasePointerCapture() {},
    addEventListener(t, fn) { (e.listeners[t] = e.listeners[t] || []).push(fn); },
    // A 200x200 pad at the origin, so its centre is (100, 100) and its radius is 100.
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }) };
  Object.defineProperty(e, 'firstChild', { get: () => e.children[0] });
  return e;
};
const win = { listeners: {},
  addEventListener(t, fn) { (win.listeners[t] = win.listeners[t] || []).push(fn); },
  removeEventListener() {},
  dispatchEvent(ev) { for (const fn of win.listeners[ev.type] || []) fn(ev); return true; } };
class KeyEv { constructor(type, init) { this.type = type; Object.assign(this, init); this.preventDefault = () => {}; } }
const doc = { head: el(), body: el(), createElement: el, getElementById: () => null,
  querySelector: () => null, addEventListener() {} };

const ctx = { Math, console, Array, Object, Number, String, Set, Map, JSON, Date, Boolean,
  KeyboardEvent: KeyEv, document: doc, window: win,
  matchMedia: () => ({ matches: true }), location: { search: '' },
  // The bundler's field helper and the two smoothing helpers InputHandler reaches for.
  __publicField: (obj, key, value) => { obj[key] = value; return value; },
  damp2: (cur, target) => target, clamp2: (v, lo, hi) => Math.min(hi, Math.max(lo, v)) };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(padSrc + '\n' + inputSrc + '\nglobalThis.__t = { makeTouchPad, tpStickDirs, tpKeySynth, InputHandler, KEY_MAP };', ctx);
const { makeTouchPad, tpStickDirs, tpKeySynth, InputHandler, KEY_MAP } = ctx.__t;

// 1. the shared stick maths still behaves, even though this game does not use a stick. The snippet is
// pasted verbatim into every game, so a change made for one game has to stay correct for all of them.
{
  const R2 = Math.SQRT1_2;
  assert(same(tpStickDirs(1, 0), ['right']), 'stick right');
  assert(same(tpStickDirs(R2, -R2), ['right', 'up']), 'stick up-right holds two directions');
  assert(tpStickDirs(0, 0).length === 0, 'dead centre holds nothing');
}

// 2. the synth sends transitions only, so a thumb resting on GAS does not restream keydown every frame
{
  const sent = [];
  const synth = tpKeySynth({ dispatchEvent: (e) => sent.push(e.type + ':' + e.code) });
  synth.set('ArrowUp', true); synth.set('ArrowUp', true); synth.set('ArrowUp', true);
  assert(sent.join(',') === 'keydown:ArrowUp', 'holding GAS sends one keydown, not one per frame');
  synth.releaseAll();
  assert(sent.join(',') === 'keydown:ArrowUp,keyup:ArrowUp', 'releasing sends exactly one keyup');
}

// 3. every code the pad is wired to must be a code KEY_MAP understands
{
  const call = html.slice(html.lastIndexOf('makeTouchPad({'), html.indexOf('/** Reset per-race state'));
  const used = [...call.matchAll(/(?:code|left|right|up|down)\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert(used.length === 6, `the pad is wired to 6 codes (found ${used.length})`);
  for (const c of used) assert(Boolean(KEY_MAP[c]), `pad code ${c} is in KEY_MAP (-> ${KEY_MAP[c]})`);
  // The steering paddles must not be wired to the throttle by accident, and vice versa.
  assert(KEY_MAP.ArrowLeft === 'left' && KEY_MAP.ArrowRight === 'right', 'the paddles steer');
  assert(KEY_MAP.ArrowUp === 'forward' && KEY_MAP.ArrowDown === 'back', 'GAS and BRAKE drive the throttle');
}

// 4. end to end: a thumb on the real pad must reach the real InputHandler as a held action
{
  const input = new InputHandler();          // attaches its keydown/keyup to our fake window
  const pad = makeTouchPad({
    dpad: { left: 'ArrowLeft', right: 'ArrowRight' },
    buttons: [
      { code: 'ArrowDown', label: 'BRAKE' },
      { code: 'ArrowUp', label: 'GAS', main: true },
      { code: 'Space', label: 'ITEM' },
      { code: 'ShiftLeft', label: 'SHIELD' },
    ],
  });
  assert(pad.el !== null, 'a coarse pointer gets a pad');

  const [padLeft, padRight] = pad.el.children;
  const [leftPaddle, rightPaddle] = padLeft.children;
  const [brake, gas, item, shield] = padRight.children;
  const fire = (target, type) => {
    const ev = { pointerId: 1, clientX: 0, clientY: 0, type, preventDefault: () => {} };
    for (const fn of target.listeners[type] || []) fn(ev);
  };
  const held = () => [...input.held].sort().join('+');

  // Steering-only pads get the two-paddle layout rather than a cross marooned in a 3x3 grid.
  assert(padLeft.className === 'tp-dpad tp-lr', `left side uses the wide paddle layout (${padLeft.className})`);
  assert(padLeft.children.length === 2, 'steering shows exactly two paddles, no dead throttle cells');

  fire(gas, 'pointerdown');
  assert(held() === 'forward', `GAS holds the throttle open (held: ${held() || 'none'})`);

  // The whole reason this game gets paddles instead of a stick: throttle and steering must coexist.
  fire(rightPaddle, 'pointerdown');
  assert(held() === 'forward+right', `steering while accelerating holds both (held: ${held()})`);
  assert(input.isHeld('forward') && input.isHeld('right'), 'the game’s own isHeld() agrees');

  fire(rightPaddle, 'pointerup');
  assert(held() === 'forward', 'letting go of the paddle keeps the gas on');

  fire(item, 'pointerdown');
  assert(input.wasPressed('attack'), 'ITEM registers as an edge, so a tap fires once');
  assert(input.consume('attack') && !input.wasPressed('attack'), 'and the edge is consumed only once');

  fire(shield, 'pointerdown');
  assert(input.isHeld('defend'), 'SHIELD holds the defensive item');

  fire(gas, 'pointerup'); fire(item, 'pointerup'); fire(shield, 'pointerup');
  assert(held() === '', `releasing everything leaves nothing held (held: ${held() || 'none'})`);

  fire(brake, 'pointerdown');
  assert(held() === 'back', 'BRAKE reverses');
  fire(brake, 'pointerup');

  // Left and right paddles are separate buttons, so both can be down at once. The game resolves that to
  // no steering rather than to a stuck wheel, but the pad must at least not lose track of either.
  fire(leftPaddle, 'pointerdown'); fire(rightPaddle, 'pointerdown');
  assert(held() === 'left+right', 'both paddles at once are both tracked');
  fire(leftPaddle, 'pointerup'); fire(rightPaddle, 'pointerup');
  assert(held() === '', 'and both release');

  // Backgrounding the tab mid-corner must not leave the kart pinned at full throttle.
  fire(gas, 'pointerdown'); fire(rightPaddle, 'pointerdown');
  for (const fn of win.listeners.blur || []) fn({});
  assert(held() === '', 'losing focus mid-hold releases everything');
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
