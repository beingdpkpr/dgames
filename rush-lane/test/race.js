// Headless check of rush-lane's lap counting, placement accumulation and race formatting.
// Run: node test/race.js   (from the rush-lane folder)
//
// index.html is a 1.08 MB esbuild bundle: Three.js inlined, then the game's own TypeScript modules, each
// introduced by a `// src/<path>.ts` banner. Those banners are the only module boundaries left, and
// `src/util/MathUtils.ts` is the one section with no Three.js, no DOM and no imports at all -- so it
// slices cleanly and runs in a bare vm.
//
// It is also the section worth testing most: progressDelta and crossedForward decide how many laps a
// kart has done and what place it is in. Kart.updateLapState does nothing but accumulate the first and
// branch on the second, and the accumulator carries a comment promising it "never jumps when a kart
// crosses the line backwards" -- a promise nothing checked until this file.
//
// Deliberately NOT covered: the driving model, track geometry and the AI. Those live in modules that
// build Three.js objects in their constructors, so testing them would mean instantiating a renderer.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// One bundled module, from its `// src/x.ts` banner to the next banner.
function moduleSource(name) {
  const start = html.indexOf(`  // ${name}\n`);
  if (start < 0) throw new Error(`module ${name} not found in index.html`);
  const next = html.indexOf('\n  // src/', start + 10);
  if (next < 0) throw new Error(`end of module ${name} not found`);
  return html.slice(start, next);
}

const src = moduleSource('src/util/MathUtils.ts')
  + '\nglobalThis.__rl = { wrap01, wrapAngle, progressDelta, crossedForward, createRng, formatRaceTime, formatTime, ordinalSuffix, clamp2, lerp2, damp2, TAU };';

const ctx = { Math, Number, String, Object, Array, console, isFinite };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx);
const R = ctx.__rl;

let failures = 0;
const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures++; };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// 1. wrap01 folds any progress value into one lap
{
  assert(R.wrap01(0.25) === 0.25, 'wrap01 leaves a value already in range alone');
  assert(near(R.wrap01(1.25), 0.25), 'wrap01(1.25) is 0.25 — one lap on');
  assert(near(R.wrap01(-0.25), 0.75), 'wrap01(-0.25) is 0.75 — just before the line, not negative');
}

// 2. progressDelta takes the short way round. This is the whole reason lap counting works: a kart
//    stepping from 0.99 to 0.01 has moved forward 0.02, not backward 0.98.
{
  assert(near(R.progressDelta(0.2, 0.3), 0.1), 'a normal step forward is its plain difference');
  assert(near(R.progressDelta(0.3, 0.2), -0.1), 'and a step backward is negative');
  assert(near(R.progressDelta(0.99, 0.01), 0.02), 'crossing the line forward reads +0.02, not -0.98');
  assert(near(R.progressDelta(0.01, 0.99), -0.02), 'crossing it backward reads -0.02, not +0.98');
  assert(Math.abs(R.progressDelta(0.1, 0.6)) <= 0.5, 'the delta never exceeds half a lap in magnitude');
}

// 3. the placement accumulator. Kart.raceProgress is just a running sum of progressDelta, so a lap of
//    small forward steps must total exactly one, whatever size the steps are and wherever they start.
{
  for (const [start, steps] of [[0, 200], [0.97, 200], [0.5, 37]]) {
    let p = start, total = 0;
    for (let i = 1; i <= steps; i++) {
      const next = R.wrap01(start + i / steps);
      total += R.progressDelta(p, next);
      p = next;
    }
    assert(near(total, 1, 1e-9), `a full lap from ${start} in ${steps} steps accumulates to exactly 1 (got ${total.toFixed(12)})`);
  }
}

// 4. the promise in the comment: reversing over the start line must not hand out a lap. Drive forward
//    over the line, then back over it, and the accumulator has to come back to where it was.
{
  let p = 0.98, total = 0;
  const go = (to) => { total += R.progressDelta(p, to); p = to; };
  go(0.02);            // forward across the line
  const afterCrossing = total;
  go(0.98);            // and straight back over it
  assert(afterCrossing > 0 && afterCrossing < 0.1, `crossing the line forward adds a small amount (${afterCrossing.toFixed(3)}), not a whole lap`);
  assert(near(total, 0), `reversing back over it returns the accumulator to 0 (got ${total.toFixed(12)})`);
}

// 5. crossedForward: the checkpoint test that gates the lap counter
{
  assert(R.crossedForward(0.1, 0.3, 0.2) === true, 'a marker inside a forward step is crossed');
  assert(R.crossedForward(0.1, 0.3, 0.4) === false, 'a marker beyond the step is not');
  assert(R.crossedForward(0.3, 0.1, 0.2) === false, 'passing a marker backwards does not count as crossing it');
  assert(R.crossedForward(0.2, 0.2, 0.2) === false, 'standing still crosses nothing');
  assert(R.crossedForward(0.98, 0.02, 0) === true, 'the start/finish line at 0 is crossed when the step wraps past it');
  assert(R.crossedForward(0.9, 0.95, 0) === false, 'and is not crossed by a step that stops short of it');
  assert(R.crossedForward(0.1, 0.3, 0.3) === true, 'a marker exactly at the end of the step counts');
  assert(R.crossedForward(0.1, 0.3, 0.1) === false, 'a marker exactly at the start does not count twice');
}

// 6. a lap of small steps crosses the finish line exactly once, however fine the stepping. Counting it
//    twice would hand out a phantom lap; missing it would strand a kart one lap short forever.
{
  for (const steps of [24, 97, 500]) {
    let p = 0.5, crossings = 0;
    for (let i = 1; i <= steps; i++) {
      const next = R.wrap01(0.5 + i / steps);
      if (R.crossedForward(p, next, 0)) crossings++;
      p = next;
    }
    assert(crossings === 1, `one lap in ${steps} steps crosses the line exactly once (got ${crossings})`);
  }
}

// 7. the seeded RNG is deterministic and in range — the race uses it to lay out item boxes
{
  const a = R.createRng(12345), b = R.createRng(12345), c = R.createRng(999);
  const seqA = Array.from({ length: 8 }, a), seqB = Array.from({ length: 8 }, b), seqC = Array.from({ length: 8 }, c);
  assert(seqA.join() === seqB.join(), 'the same seed gives the same sequence');
  assert(seqA.join() !== seqC.join(), 'a different seed gives a different one');
  assert(seqA.every((v) => v >= 0 && v < 1), 'every value lands in [0, 1)');
}

// 8. ordinal suffixes, including the teens that catch naive implementations
{
  const cases = [[1, 'st'], [2, 'nd'], [3, 'rd'], [4, 'th'], [11, 'th'], [12, 'th'], [13, 'th'],
    [21, 'st'], [22, 'nd'], [23, 'rd'], [101, 'st'], [111, 'th'], [112, 'th'], [113, 'th']];
  const bad = cases.filter(([n, want]) => R.ordinalSuffix(n) !== want);
  assert(bad.length === 0, `ordinal suffixes are right for 1st..113th${bad.length ? ' — wrong: ' + bad.map(([n, w]) => `${n} wanted ${w} got ${R.ordinalSuffix(n)}`).join(', ') : ''}`);
}

// 9. race time formatting, which is what the high-score table stores
{
  assert(R.formatRaceTime(0) === '0:00.0', `zero formats as 0:00.0 (got ${R.formatRaceTime(0)})`);
  assert(R.formatRaceTime(61.25).startsWith('1:01'), `61.25s is a minute and a bit (got ${R.formatRaceTime(61.25)})`);
  assert(R.formatRaceTime(125.4) === '2:05.4', `125.4s formats as 2:05.4 (got ${R.formatRaceTime(125.4)})`);
  assert(/^\d+:\d\d\.\d$/.test(R.formatRaceTime(9.05)), `under ten seconds still pads the minute field (got ${R.formatRaceTime(9.05)})`);
}

// 10. the small helpers the driving model leans on
{
  assert(R.clamp2(5, 0, 1) === 1 && R.clamp2(-5, 0, 1) === 0 && R.clamp2(0.5, 0, 1) === 0.5, 'clamp2 bounds both ways');
  assert(near(R.lerp2(0, 10, 0.25), 2.5), 'lerp2 interpolates');
  assert(near(R.wrapAngle(Math.PI * 3), Math.PI) || near(R.wrapAngle(Math.PI * 3), -Math.PI), 'wrapAngle folds 3PI onto the -PI..PI circle');
  assert(Math.abs(R.wrapAngle(7)) <= Math.PI && Math.abs(R.wrapAngle(-7)) <= Math.PI, 'and never returns anything outside it');
  // damp2 must converge toward the target and never overshoot it, or the steering oscillates.
  let v = 0;
  for (let i = 0; i < 400; i++) v = R.damp2(v, 1, 16e-4, 1 / 60);
  assert(v > 0.99 && v <= 1, `damp2 converges on its target without overshooting (reached ${v.toFixed(6)})`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
