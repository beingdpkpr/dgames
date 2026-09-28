#!/usr/bin/env node
// Headless checks of the fight rules: frame data, who blocks what, chains, knockdowns, walls, rounds, and
// what the AI levels actually do. Runs the SIM section of index.html in a vm -- no browser, no THREE.
// Run: node dojo-duel/test/sim.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const a = html.indexOf('// ---------- SIM ----------'), b = html.indexOf('// ---------- UI ----------');
if (a < 0 || b < a) { console.error('SIM/UI markers not found'); process.exit(1); }
const ctx = { console, Math, Object };
vm.createContext(ctx);
vm.runInContext(html.slice(a, b) + `
this.api = { FPS, STAGE, MIN_SEP, MOVES, NEUTRAL, BUFFER, KO_FRAMES, INTRO_FRAMES, DOWN_FRAMES, GETUP_FRAMES,
  newMatch, step, checkHit, makeAI, aiInput, total, actionable };`, ctx);
const S = ctx.api;

let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL: ' + msg); } };
const N = S.NEUTRAL;
const I = (o) => Object.assign({}, N, o);

// A match already in the fight phase, fighters placed dist apart.
function fightAt(dist) {
  const g = S.newMatch();
  g.phase = 'fight'; g.phaseT = 0;
  g.f[0].x = -dist / 2; g.f[1].x = dist / 2;
  return g;
}
// Step until no hitstop is pending (hitstop freezes everything; tests count sim frames, not wall frames).
function run(g, inA, inB, frames) {
  for (let i = 0; i < frames; i++) { S.step(g, [inA(i), inB(i)]); }
}
// Defender pinned at the right wall: holding back walks away (as in Tekken), so off the wall a guarding
// defender simply leaves the attack's reach and the guard is never tested.
function fightAtWall(dist) { const g = fightAt(dist); g.f[1].x = S.STAGE; g.f[0].x = S.STAGE - dist; return g; }
const once = (btn) => (i) => (i === 0 ? I({ [btn]: true }) : N);
const hold = (o) => () => I(o);

// ---- 1. every move connects on exactly its first active frame, and not a frame before ----
for (const k of Object.keys(S.MOVES)) {
  const mv = S.MOVES[k];
  const g = fightAt(mv.reach - 0.05);
  let hitAt = -1, frames = 0;
  for (let i = 0; i < 60 && hitAt < 0; i++) {
    const before = g.f[1].hp;
    S.step(g, [i === 0 ? I({ [k]: true }) : N, N]);
    frames++;
    if (g.f[1].hp < before) hitAt = g.f[0].t;
  }
  ok(hitAt === mv.startup + 1, `${k}: connects on frame ${mv.startup + 1} (got ${hitAt})`);
}

// ---- 2. reach: just outside it whiffs ----
for (const k of Object.keys(S.MOVES)) {
  const mv = S.MOVES[k];
  const g = fightAt(mv.reach + 0.06);
  run(g, once(k), () => N, S.total(mv) + 5);
  ok(g.f[1].hp === 100, `${k}: whiffs at reach + 6 cm`);
}

// ---- 3. the guard triangle: every height against every stance ----
const STANCES = {
  stand: {}, standGuard: { b: true }, crouch: { d: true }, crouchGuard: { b: true, d: true },
};
const EXPECT = {        // result: hit / block / duck (whiff over)
  high: { stand: 'hit', standGuard: 'block', crouch: 'duck', crouchGuard: 'duck' },
  mid:  { stand: 'hit', standGuard: 'block', crouch: 'hit',  crouchGuard: 'hit' },
  low:  { stand: 'hit', standGuard: 'hit',   crouch: 'hit',  crouchGuard: 'block' },
};
for (const k of Object.keys(S.MOVES)) {
  const mv = S.MOVES[k];
  for (const st of Object.keys(STANCES)) {
    const g = fightAtWall(0.8);
    // defender settles into the stance first
    run(g, () => N, hold(STANCES[st]), 3);
    const seen = new Set();
    for (let i = 0; i < S.total(mv) + 2; i++) {
      S.step(g, [i === 0 ? I({ [k]: true }) : N, I(STANCES[st])]);
      for (const e of g.events) if (e.type === 'hit' || e.type === 'block' || e.type === 'duck') seen.add(e.type);
    }
    const want = EXPECT[mv.height][st];
    ok(seen.size === 1 && seen.has(want), `${k} (${mv.height}) vs ${st}: expected ${want}, got ${[...seen].join(',') || 'nothing'}`);
  }
}

// ---- 4. frame advantage on block: a jab is safe, anything at -8 or worse is punishable by a jab ----
for (const k of Object.keys(S.MOVES)) {
  const mv = S.MOVES[k];
  const g = fightAtWall(0.8);
  run(g, () => N, hold({ b: true, d: mv.height === 'low' }), 2);
  let blockedAt = -1, defFree = -1, attFree = -1;
  for (let i = 0; i < 90; i++) {
    S.step(g, [i === 0 ? I({ [k]: true }) : N, I({ b: true, d: mv.height === 'low' })]);
    if (g.hitstop > 0) { i--; continue; }        // count sim frames only
    if (blockedAt < 0 && g.f[1].state === 'blockstun') blockedAt = i;
    if (blockedAt >= 0 && defFree < 0 && S.actionable(g.f[1])) defFree = i;
    if (blockedAt >= 0 && attFree < 0 && S.actionable(g.f[0])) attFree = i;
    if (defFree >= 0 && attFree >= 0) break;
  }
  const adv = defFree - attFree;                  // negative = attacker recovers later = minus on block
  const expected = mv.blockstun - (mv.active - 1 + mv.recovery);
  ok(Math.abs(adv - expected) <= 1, `${k}: ${expected} on block (measured ${adv})`);
  const punishable = -adv >= S.MOVES.lp.startup;
  ok(k === 'lp' ? !punishable : true, `jab is not punishable on block`);
  if (k === 'lk' || k === 'rk') ok(punishable, `${k} is punishable on block by a jab (${adv})`);
}

// ---- 5. 1-2 string: jab into body blow is a true combo on hit ----
{
  const g = fightAt(0.8);
  const hits = [];
  for (let i = 0; i < 70; i++) {
    S.step(g, [i === 0 ? I({ lp: true }) : i === 10 ? I({ rp: true }) : N, N]);
    for (const e of g.events) if (e.type === 'hit') hits.push(e);
  }
  ok(hits.length === 2 && hits[1].combo === 2, `1-2 lands both hits as a combo (hits ${hits.length}, combo ${hits[1] && hits[1].combo})`);
  ok(g.f[1].hp === 100 - S.MOVES.lp.dmg - S.MOVES.rp.dmg, '1-2 damage adds up');
}

// ---- 6. roundhouse knocks down; a downed fighter cannot be hit until the get-up ends ----
{
  const g = fightAt(1.0);
  run(g, once('rk'), () => N, S.MOVES.rk.startup + 2 + 20);
  ok(g.f[1].state === 'down', 'roundhouse on hit knocks down');
  const hp = g.f[1].hp;
  g.f[0].state = 'idle';
  g.f[0].x = g.f[1].x - 0.7;
  run(g, (i) => (i % 25 === 0 ? I({ lp: true }) : N), () => N, 40);
  ok(g.f[1].hp === hp, 'no hits land on a downed fighter');
  run(g, () => N, () => N, S.DOWN_FRAMES + S.GETUP_FRAMES + 20);
  ok(S.actionable(g.f[1]), 'fighter gets up and is actionable again');
}

// ---- 7. counter hit: hitting a move in its startup does more ----
{
  const g = fightAt(0.8);
  // B starts a roundhouse; A jabs so the jab lands during B's startup
  let dmg = 0, counter = false;
  for (let i = 0; i < 30; i++) {
    S.step(g, [i === 2 ? I({ lp: true }) : N, i === 0 ? I({ rk: true }) : N]);
    for (const e of g.events) if (e.type === 'hit' && e.side === 1) { dmg = e.dmg; counter = e.counter; }
  }
  ok(counter && dmg > S.MOVES.lp.dmg, `jab into a roundhouse startup is a counter hit for more (${dmg})`);
}

// ---- 8. walls and bodies ----
{
  const g = fightAt(2);
  run(g, hold({ b: true }), hold({ b: true }), 600);
  ok(Math.abs(g.f[0].x) <= S.STAGE + 1e-9 && Math.abs(g.f[1].x) <= S.STAGE + 1e-9, 'walking back stops at the walls');
  const g2 = fightAt(2);
  run(g2, hold({ f: true }), hold({ f: true }), 300);
  ok(Math.abs(g2.f[1].x - g2.f[0].x) >= S.MIN_SEP - 1e-9, 'bodies never overlap');
  // pinned at the wall, pushback moves the attacker instead
  const g3 = fightAt(1);
  g3.f[1].x = S.STAGE; g3.f[0].x = S.STAGE - 0.8;
  const ax = g3.f[0].x;
  run(g3, once('rp'), hold({ b: true }), 40);
  ok(g3.f[1].x === S.STAGE && g3.f[0].x < ax, 'against the wall the attacker is pushed off instead');
}

// ---- 9. rounds, KO, timeout, match ----
{
  const g = fightAt(0.8);
  g.f[1].hp = 5;
  run(g, once('lp'), () => N, 40);
  ok(g.phase === 'ko' && g.f[0].wins === 1 && g.f[1].state === 'ko', 'KO ends the round for the attacker');
  run(g, () => N, () => N, S.KO_FRAMES + 30);
  ok(g.phase === 'intro' && g.round === 2 && g.f[0].hp === 100 && g.f[1].hp === 100, 'next round resets health');
  const g2 = fightAt(3);
  g2.f[0].hp = 60; g2.timer = 5;
  run(g2, () => N, () => N, 10);
  ok(g2.phase === 'ko' && g2.timeout && g2.f[1].wins === 1, 'time out goes to the fighter with more health');
  const g3 = fightAt(0.8); g3.f[0].wins = 1; g3.f[1].hp = 1;
  run(g3, once('lp'), () => N, S.KO_FRAMES + 60);
  ok(g3.phase === 'over' && g3.matchWinner === 0, 'second round win ends the match');
}

// ---- 10. determinism ----
{
  const script = (i) => I({ f: i % 40 < 20, lp: i % 23 === 0, lk: i % 37 === 0, b: i % 90 > 70 });
  const a1 = fightAt(2), a2 = fightAt(2);
  run(a1, script, (i) => script(i + 7), 1500);
  run(a2, script, (i) => script(i + 7), 1500);
  ok(JSON.stringify(a1.f) === JSON.stringify(a2.f), 'same inputs, same fight');
}

// ---- 11. the AI: does it engage, and do the levels differ? ----
function aiMatch(lvA, lvB, seed) {
  const g = S.newMatch(), A = S.makeAI(lvA, seed), B = S.makeAI(lvB, seed * 7919 + 1);
  let frames = 0, kos = 0, timeouts = 0;
  while (g.phase !== 'over' && frames < 60 * 60 * 6) {
    S.step(g, [S.aiInput(A, g, g.f[0], g.f[1]), S.aiInput(B, g, g.f[1], g.f[0])]);
    for (const e of g.events) if (e.type === 'round') { if (e.timeout) timeouts++; else kos++; }
    frames++;
  }
  return { winner: g.matchWinner, kos, timeouts };
}
function series(lvA, lvB, n) {
  let w = 0, kos = 0, to = 0;
  for (let s = 1; s <= n; s++) { const r = aiMatch(lvA, lvB, s); if (r.winner === 0) w++; kos += r.kos; to += r.timeouts; }
  return { rate: w / n, kos, to };
}
const hvE = series('hard', 'easy', 120), nvE = series('normal', 'easy', 120), hvN = series('hard', 'normal', 120), nvN = series('normal', 'normal', 120);
console.log(`AI: hard beats easy ${(hvE.rate * 100).toFixed(0)}%, normal beats easy ${(nvE.rate * 100).toFixed(0)}%, hard beats normal ${(hvN.rate * 100).toFixed(0)}%, normal mirror ${(nvN.rate * 100).toFixed(0)}% | rounds by KO vs timeout (normal mirror): ${nvN.kos} / ${nvN.to}`);
ok(hvE.rate >= 0.75, `hard beats easy most of the time (${hvE.rate})`);
ok(nvE.rate >= 0.6, `normal beats easy more often than not (${nvE.rate})`);
ok(hvN.rate >= 0.55, `hard beats normal more often than not (${hvN.rate})`);
ok(nvN.rate > 0.3 && nvN.rate < 0.7, `mirror match is roughly even (${nvN.rate})`);
ok(nvN.kos > nvN.to * 3, 'AI fights are mostly decided by KO, not the clock');

// A player who never presses a button must lose to every level, by KO.
for (const lv of ['easy', 'normal', 'hard']) {
  const g = S.newMatch(), B = S.makeAI(lv, 5);
  let frames = 0; const rounds = [];
  while (g.phase !== 'over' && frames < 60 * 60 * 6) {
    S.step(g, [N, S.aiInput(B, g, g.f[1], g.f[0])]); frames++;
    for (const e of g.events) if (e.type === 'round') rounds.push(e.timeout ? 'T' : 'KO');
  }
  ok(g.matchWinner === 1 && !rounds.includes('T'), `${lv} AI beats an idle player by KO (${rounds.join(',')}, ${Math.round(frames / 60)} s)`);
}

console.log(fails ? `${fails} failed, ${passes} passed` : `all ${passes} checks passed`);
process.exit(fails ? 1 : 0);
