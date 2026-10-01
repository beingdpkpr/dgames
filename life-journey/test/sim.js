// Whole games, headless. Plays seeded computer games through the real rules and checks what a family
// would only notice after an evening: every game ends, none needs the turn cap, and a game is the length
// it promises — about 22 turns each for the full journey, about 13 for Quick. Kept to a few seconds; the
// longer per-style table is test/bots.js (a report).
// Run: node test/sim.js
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { Math, console, Array, Object, Number, String, JSON, Set, Map, Infinity, Error };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const M = ctx.__life;

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (cond) console.log('ok   ' + msg); else { failures++; console.log('FAIL ' + msg); } };
const rotate = (a, r) => a.slice(r % a.length).concat(a.slice(0, r % a.length));
const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
const t0 = Date.now();

const LINEUPS = {
  '2 players': ['cautious', 'risky'],
  '3 players': ['cautious', 'risky', 'cautious'],
  '4 players': ['risky', 'cautious', 'risky', 'cautious'],
  '6 players': ['cautious', 'risky', 'cautious', 'risky', 'cautious', 'risky'],
};
for (const quick of [false, true]) {
  const all = [];
  for (const [label, kinds] of Object.entries(LINEUPS)) {
    const N = 150;
    const turns = [], rounds = [];
    let unfinished = 0, capped = 0, maxSteps = 0, negative = 0;
    for (let seed = 1; seed <= N; seed++) {
      const S = M.simulate(seed * 7 + (quick ? 1 : 0), rotate(kinds, seed), { quick });
      if (S.phase !== 'over') unfinished++;
      if (S.endReason === 'cap') capped++;
      maxSteps = Math.max(maxSteps, S.steps);
      S.players.forEach((P) => { turns.push(P.turns); if (P.final < -500) negative++; });
      rounds.push(Math.max(...S.players.map((P) => P.turns)));
    }
    turns.sort((a, b) => a - b); rounds.sort((a, b) => a - b);
    all.push(...turns);
    console.log(`     ${quick ? 'quick' : 'full '} ${label}: turns per player p10 ${pct(turns, 0.1)}, median ${pct(turns, 0.5)}, p90 ${pct(turns, 0.9)}, max ${turns[turns.length - 1]}; rounds median ${pct(rounds, 0.5)}, max ${rounds[N - 1]}; most actions ${maxSteps}`);
    ok(unfinished === 0 && capped === 0, `${quick ? 'quick' : 'full'} ${label}: all ${N} games end with everyone retired (no turn cap)`);
    ok(negative === 0, `${quick ? 'quick' : 'full'} ${label}: nobody ends deeper than −₹500K`);
  }
  all.sort((a, b) => a - b);
  const med = pct(all, 0.5);
  if (!quick) ok(med >= 19 && med <= 25 && pct(all, 0.9) <= 29, `full journey: median ${med} turns per player (target 19–25), p90 ${pct(all, 0.9)}`);
  else ok(med >= 11 && med <= 16 && pct(all, 0.9) <= 19, `quick: median ${med} turns per player (target 11–16), p90 ${pct(all, 0.9)}`);
  // Measured in Chromium at normal speed: a computer turn takes about 7.5 s (spin, drive, card); a
  // human turn with reading and choosing takes longer, call it 10 s. That is the time a table will see.
  console.log(`     ${quick ? 'quick' : 'full '}: 3 players ≈ ${(med * 3 * 7.5 / 60).toFixed(0)}–${(med * 3 * 10 / 60).toFixed(0)} min, 4 players ≈ ${(med * 4 * 7.5 / 60).toFixed(0)}–${(med * 4 * 10 / 60).toFixed(0)} min`);
}

// No road is a trap: across 4-player games, the average final worth of either road at each fork is
// within 15% of the other, so every choice is a real one.
{
  const by = {};
  for (let seed = 1; seed <= 300; seed++) {
    const S = M.simulate(9000 + seed, rotate(['cautious', 'risky', 'cautious', 'risky'], seed));
    for (const P of S.players) for (const k of Object.values(P.roads)) (by[k] = by[k] || []).push(P.final);
  }
  const avg = (k) => by[k].reduce((a, b) => a + b, 0) / by[k].length;
  for (const [a, b] of [['college', 'work'], ['family', 'adventure'], ['city', 'hometown'], ['startup', 'steady']]) {
    const r = avg(a) / avg(b);
    ok(r > 0.85 && r < 1.15, `${a} ${M.fmt(Math.round(avg(a)))} vs ${b} ${M.fmt(Math.round(avg(b)))}: within 15%`);
  }
}

console.log(`\n${checks - failures}/${checks} checks passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failures ? 1 : 0);
