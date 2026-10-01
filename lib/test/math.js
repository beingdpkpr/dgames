// Headless checks of the tabletop kit's pure parts (no browser, no three.js): easing, hop arcs and path
// sampling, the die face <-> rotation mapping, and the picking radius. These are the pieces whose
// mistakes do not show in a single screenshot — a die that lands on the wrong face one roll in six, a hop
// that ends a hair off its square, a tap that picks the far piece. Run: node test/math.js
'use strict';
const path = require('path');
const T = require(path.join(__dirname, '..', 'tabletop.js'));
const M = T.math;

let failures = 0;
const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures++; };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ---- easing: every curve starts at 0 and ends at exactly 1, so a tween lands where it was sent
for (const [name, f] of Object.entries(M.ease)) {
  assert(near(f(0), 0, 1e-9) && near(f(1), 1, 1e-9), `ease.${name}: f(0)=0 and f(1)=1`);
}
for (const name of ['linear', 'inQuad', 'outQuad', 'inOutQuad', 'outCubic', 'inOutCubic']) {
  let mono = true; for (let i = 1; i <= 100; i++) if (M.ease[name](i / 100) < M.ease[name]((i - 1) / 100) - 1e-12) mono = false;
  assert(mono, `ease.${name} never runs backwards`);
}
assert(near(M.ease.inOutQuad(0.5), 0.5) && near(M.ease.inOutCubic(0.5), 0.5), 'in-out curves pass the midpoint at half way');
{ let over = false; for (let i = 0; i <= 100; i++) if (M.ease.outBack(i / 100) > 1) over = true; assert(over, 'outBack overshoots (that is its job)'); }
{ let ok = true; for (let i = 0; i <= 1000; i++) { const v = M.ease.outBounce(i / 1000); if (v < -1e-9 || v > 1 + 1e-9) ok = false; } assert(ok, 'outBounce stays within [0, 1]: a bouncing piece never sinks into the board'); }

// ---- arcs
assert(M.arc(0, 3) === 0 && M.arc(1, 3) === 0 && near(M.arc(0.5, 3), 3), 'hop arc: feet on the board, peak = height at half way');
assert(M.squashAt(0.5, 0.2) === 0, 'no squash in mid-air');
assert(near(M.squashAt(1, 0.2), 0, 1e-12), 'squash has recovered by the end of a hop');
assert(M.squashAt(0.89, 0.2) < -0.19, 'squash is deepest around touchdown');

// ---- hop path sampling
const pts = [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 0, 1]];
{
  const s0 = M.hopSample(pts, 0, 2), s1 = M.hopSample(pts, 1, 2);
  assert(s0.x === 0 && s0.y === 0 && s0.z === 0, 'hopSample t=0 is the start square');
  assert(s1.x === 2 && near(s1.y, 0) && s1.z === 1, 'hopSample t=1 lands exactly on the last square');
  // the k-th third of the time is the k-th hop, and every hop touches down on its square
  for (let k = 1; k < 3; k++) {
    const s = M.hopSample(pts, k / 3 - 1e-12, 2);
    assert(near(s.x, pts[k][0], 1e-9) && near(s.z, pts[k][2], 1e-9) && near(s.y, 0, 1e-9), `hop ${k} touches down on square ${k}`);
  }
  const mid = M.hopSample(pts, 0.5 / 3, 2);
  assert(near(mid.y, 2) && mid.i === 0 && near(mid.x, 0.5), 'mid-hop is at full height, half way between squares');
  let maxY = 0; for (let i = 0; i <= 300; i++) maxY = Math.max(maxY, M.hopSample(pts, i / 300, 2).y);
  assert(maxY <= 2 + 1e-9, 'a hop never rises above its height');
  const one = M.hopSample([[5, 1, 5]], 0.4, 2);
  assert(one.x === 5 && one.y === 1 && one.z === 5, 'a one-point path stays put');
}
{
  const a = [0, 0, 0], b = [10, 0, -4];
  const f0 = M.flightSample(a, b, 0, 5), f1 = M.flightSample(a, b, 1, 5), fm = M.flightSample(a, b, 0.5, 5);
  assert(f0.join() === a.join() && f1.join() === b.join(), 'flight starts and ends on its points');
  assert(near(fm[1], 5), 'flight peaks at half way');
}

// ---- die: each requested face lands up, for any yaw and any number of extra tumbles
{
  let all = true;
  for (let f = 1; f <= 6; f++) for (const yaw of [0, 0.7, 2.1, -1.3, 5]) for (const sx of [0, 1, 3]) for (const sz of [0, 2]) {
    const e = M.dieEuler(f, yaw, sx, sz);
    const up = M.rotateYXZ(M.DIE_NORMAL[f], e);
    if (!(near(up[0], 0, 1e-9) && near(up[1], 1, 1e-9) && near(up[2], 0, 1e-9)) || M.faceUp(e) !== f) all = false;
  }
  assert(all, 'dieEuler(face, yaw, spins) puts that face up for all 6 faces x 5 yaws x 6 spin counts');
  let opp = true; for (let f = 1; f <= 6; f++) { const a = M.DIE_NORMAL[f], b = M.DIE_NORMAL[7 - f]; if (a[0] + b[0] || a[1] + b[1] || a[2] + b[2]) opp = false; }
  assert(opp, 'opposite faces sum to 7, as on a real die');
  let threw = false; try { M.dieEuler(7, 0, 0, 0); } catch (e) { threw = true; }
  assert(threw, 'a face outside 1..6 is refused rather than drawn as something random');
  const e = M.dieEuler(4, 1, 2, 1);
  assert(e.order === 'YXZ' && near(e.y, 1), 'yaw is passed through untouched, order YXZ');
}

// ---- picking radius and nearest-within
assert(M.pickRadius(360, 360) === 26, 'pick radius never drops below 26px (a 52px target) on a small canvas');
assert(near(M.pickRadius(1280, 800), 40), 'pick radius grows to 5% of the short side on a big canvas');
assert(M.pickRadius(100, 100, 30) === 30, 'pick radius honours a larger minimum');
{
  const p = [{ x: 0, y: 0, id: 'a' }, { x: 30, y: 0, id: 'b' }, { x: 12, y: 0, id: 'c' }];
  assert(M.nearestWithin(p, 10, 0, 26).id === 'c', 'nearestWithin picks the closest centre');
  assert(M.nearestWithin(p, 100, 100, 26) === null, 'nothing within the radius -> null, not the least-bad piece');
  assert(M.nearestWithin(p, 0, 26, 26).id === 'a', 'a point exactly on the radius counts');
  assert(M.nearestWithin([{ x: 5, y: 0, id: 1 }, { x: -5, y: 0, id: 2 }], 0, 0, 26).id === 1, 'ties go to the earlier piece');
}
assert(M.isTap(0, 0) && M.isTap(6, 6) && !M.isTap(8, 8) && !M.isTap(20, 0), 'a press inside 9px is a tap; anything further is a drag');

// ---- small helpers
assert(near(M.wrapAngle(3 * Math.PI), Math.PI, 1e-9) || near(M.wrapAngle(3 * Math.PI), -Math.PI, 1e-9), 'wrapAngle folds 3pi to +-pi');
assert(near(M.damp(0, 7), 0) && M.damp(1, 7) > 0.99, 'damp: nothing in no time, almost all in a second');
{ let a = 0, b = 0; for (let i = 0; i < 60; i++) a += (1 - a) * M.damp(1 / 60, 7); for (let i = 0; i < 30; i++) b += (1 - b) * M.damp(1 / 30, 7); assert(near(a, b, 1e-9), 'damp is frame-rate independent (60 fps and 30 fps reach the same point)'); }

console.log(failures ? `\n${failures} failure(s)` : '\nall ok');
process.exit(failures ? 1 : 0);
