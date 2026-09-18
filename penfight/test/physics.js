// Headless check of penfight's rigid-body physics and its AI scoring, with no browser and no Three.js.
// Run: node test/physics.js   (from the penfight folder)
//
// index.html is one 798 KB file whose first 651 KB is a single minified Three.js line, so there is no
// module boundary to import. What it does have is `// ===== name.js =====` banners marking the sections
// the file was assembled from, and two of those sections — physics.js and ai.js — touch no THREE, no
// DOM and no localStorage at all. This slices on those banners and runs them in a vm, plus util.js for
// the four helpers they borrow (clamp, gauss, TAU, wrapAngle).
//
// What is deliberately NOT covered: anything in scene.js, ui.js or main.js. Those are rendering and
// input, they need a browser, and pretending otherwise would be a test that only proves the file parses.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// Source between two `// ===== x.js =====` banners.
function section(name, until) {
  const a = html.indexOf(`// ===== ${name} =====`);
  const b = html.indexOf(`// ===== ${until} =====`, a);
  if (a < 0 || b < 0) throw new Error(`section ${name}..${until} not found in index.html`);
  return html.slice(a, b);
}

const src = section('util.js', 'hiscore.js') + '\n' + section('physics.js', 'audio.js')
  + '\nglobalThis.__pf = { createWorld, makeBody, cloneWorld, stepWorld, worldAtRest, edgeGap, scoreOutcome, deskLayout, DESKS, GRAV, DT };';

const store = new Map();
const ctx = {
  Math, Object, Array, Number, String, JSON, Date, Set, Map, console, isFinite, isNaN,
  localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
  matchMedia: () => ({ matches: false }),
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx);
const P = ctx.__pf;

let failures = 0;
const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures++; };

// A pen spec is only ever read for these fields, so the test supplies its own rather than slicing
// pens.js, which is half Three.js mesh building.
const PEN = { id: 'test-pen', L: 14, r: 0.45, m: 8, mu: 0.2 };
const desk = () => P.createWorld(P.DESKS.classic.W, P.DESKS.classic.D, []);   // 80 x 50 cm
const put = (w, team, x, y, a = 0) => { const b = P.makeBody(PEN, team, w.bodies.length, x, y, a); w.bodies.push(b); return b; };
const run = (w, seconds, ev) => { const n = Math.round(seconds / P.DT); for (let i = 0; i < n; i++) P.stepWorld(w, P.DT, ev); };
const speed = (b) => Math.hypot(b.vx, b.vy);

// 1. geometry: edgeGap is the distance to the nearest edge, whichever axis is tighter
{
  const w = desk();
  const mid = put(w, 0, 0, 0);
  assert(P.edgeGap(w, mid) === 25, `centre of an 80x50 desk is 25cm from the nearest edge (got ${P.edgeGap(w, mid)})`);
  const nearSide = put(w, 0, 38, 0);
  assert(P.edgeGap(w, nearSide) === 2, `2cm from the long edge reads as 2 (got ${P.edgeGap(w, nearSide)})`);
  const nearEnd = put(w, 0, 0, -24);
  assert(P.edgeGap(w, nearEnd) === 1, `1cm from the short edge reads as 1 (got ${P.edgeGap(w, nearEnd)})`);
}

// 2. a pen left alone does not wander. Physics that drifts at rest is the classic silent bug.
{
  const w = desk();
  const b = put(w, 0, 0, 0);
  run(w, 2);
  assert(b.state === 'table', 'a pen at rest in the middle stays on the desk');
  assert(Math.hypot(b.x, b.y) < 0.01, `and does not drift (moved ${Math.hypot(b.x, b.y).toFixed(4)}cm in 2s)`);
  assert(P.worldAtRest(w), 'the world reports itself at rest');
}

// 3. friction: a sliding pen slows and stops, and never speeds up on its own
{
  const w = desk();
  const b = put(w, 0, -20, 0);
  b.vx = 60;
  let prev = speed(b), grew = 0;
  for (let i = 0; i < 600; i++) {
    P.stepWorld(w, P.DT, null);
    const s = speed(b);
    if (s > prev + 1e-9) grew++;
    prev = s;
  }
  assert(grew === 0, `a sliding pen never gains speed unaided (${grew} frames where it did)`);
  assert(speed(b) === 0, `friction brings it to a full stop (ended at ${speed(b).toFixed(3)} cm/s)`);
  assert(b.x > -20, 'and it travelled in the direction it was pushed');
}

// 4. the edge: a pen driven off the side leaves the table and reports it
{
  const w = desk();
  const b = put(w, 0, 30, 0);
  b.vx = 200;
  const ev = [];
  run(w, 2, ev);
  assert(b.state !== 'table', `a pen driven over the edge leaves the desk (state ${b.state})`);
  assert(ev.some((e) => e.type === 'fall' && e.body === b), 'and a fall event is raised for it');
}

// 5. ...but a pen stopping short of the edge stays put. The fall test is a midpoint test, so a pen
//    hanging over the lip by less than half its length must survive.
{
  const w = desk();
  const b = put(w, 0, 30, 0);
  b.vx = 18;
  run(w, 3);
  assert(b.state === 'table', `a pen that runs out of speed before the midpoint crosses stays on (x ${b.x.toFixed(1)}, edge ${w.hw})`);
}

// 6. collision: a moving pen transfers momentum to a stationary one rather than passing through it.
//    Both pens lie across the line of travel (a = PI/2) and start 20cm apart: at a = 0 they would run
//    end-to-end, and with a half-length of 6.55cm a 10cm gap starts them already interpenetrating.
{
  const w = desk();
  const a = put(w, 0, -20, 0, Math.PI / 2);
  const b = put(w, 1, 0, 0, Math.PI / 2);
  a.vx = 150;
  const ev = [];
  run(w, 1.2, ev);
  assert(b.vx !== 0 || b.x !== 0 || b.y !== 0, 'a struck pen is moved by the impact');
  assert(a.x < b.x, `the striker stays behind the struck pen (${a.x.toFixed(1)} vs ${b.x.toFixed(1)}) — no tunnelling`);
  assert(ev.some((e) => e.type === 'hit'), 'and the impact raises a hit event');
}

// 7. determinism: the same world stepped the same way twice lands in the same place. Without this an
//    AI that searches by simulating candidate flicks is searching noise.
{
  const make = () => { const w = desk(); const b = put(w, 0, -15, 3); b.vx = 120; b.vy = -40; b.w = 4; return w; };
  const w1 = make(), w2 = make();
  run(w1, 1.5); run(w2, 1.5);
  const s = (w) => w.bodies.map((b) => `${b.x.toFixed(9)},${b.y.toFixed(9)},${b.a.toFixed(9)},${b.state}`).join('|');
  assert(s(w1) === s(w2), 'two identical worlds stepped identically end identically');
}

// 8. cloneWorld is a real deep copy — the AI relies on it to try a move without spoiling the live game
{
  const w = desk();
  const b = put(w, 0, 5, 5);
  const c = P.cloneWorld(w);
  c.bodies[0].x = 999; c.bodies[0].vx = 999;
  assert(b.x === 5 && b.vx === 0, 'mutating a clone leaves the original untouched');
  run(c, 0.5);
  assert(b.x === 5, 'and stepping a clone does not step the original');
}

// 9. scoring: the AI's view of a position. Signs matter more than magnitudes here.
{
  const clear = desk();                       // every opponent pen gone, one of mine left
  const mine = put(clear, 0, 0, 0);
  const theirs = put(clear, 1, 0, 0);
  theirs.state = 'floor';
  const won = P.scoreOutcome(clear, 0);

  const lost = desk();                        // the mirror image
  const mine2 = put(lost, 0, 0, 0);
  put(lost, 1, 0, 0);
  mine2.state = 'floor';
  const losing = P.scoreOutcome(lost, 0);

  assert(won > 0 && losing < 0, `clearing the desk scores positive (${won.toFixed(0)}) and being cleared scores negative (${losing.toFixed(0)})`);
  assert(won > losing + 500, 'and the gap between them is decisive, not marginal');

  // A pen teetering on the edge is worth less than one safe in the middle.
  const safe = desk(); const sb = put(safe, 0, 0, 0); put(safe, 1, 10, 0);
  const risky = desk(); const rb = put(risky, 0, 39, 0); put(risky, 1, 10, 0);
  void sb; void rb;
  assert(P.scoreOutcome(safe, 0) > P.scoreOutcome(risky, 0),
    `a pen in the middle beats one on the lip (${P.scoreOutcome(safe, 0).toFixed(1)} vs ${P.scoreOutcome(risky, 0).toFixed(1)})`);
}

// 10. desk clutter is laid out for the desk it is on, and stays inside it
{
  for (const key of Object.keys(P.DESKS)) {
    const d = P.DESKS[key];
    assert(P.deskLayout(key, 'none').length === 0, `${key}: 'none' puts nothing on the desk`);
    const some = P.deskLayout(key, 'some'), lots = P.deskLayout(key, 'lots');
    assert(some.length > 0 && lots.length > some.length, `${key}: 'lots' is more cluttered than 'some'`);
    const inside = lots.every((o) => Math.abs(o.x) < d.W / 2 && Math.abs(o.y) < d.D / 2);
    assert(inside, `${key}: every item starts inside the desk`);
  }
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
