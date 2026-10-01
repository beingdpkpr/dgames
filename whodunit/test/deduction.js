// The deduction engine against the truth. Lifts the logic above the `// ---------- UI ----------` marker
// into node's vm and checks it two ways:
//
//  1. Soundness by brute force. On small games (7 to 10 cards, 3 or 4 players) every deal of the cards is
//     enumerated, and the deals consistent with a player's observations are kept. Whatever the engine
//     marks certain — at every level, after every observation — must hold in every one of those deals:
//     it may never call a card impossible for an owner while some consistent deal puts it there.
//     The consistency check is written here, independently of the engine's rules.
//  2. Completeness, measured on the same games (the share of facts that every consistent deal agrees on
//     that the engine also finds), and asserted exactly on hand-built scenarios where the answer is known.
//
// Run: node test/deduction.js
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { Math, console, Array, Object, Number, String, JSON, Set, Map, Infinity, Int8Array, WeakMap, Error };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const M = ctx.__whodunit;

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (cond) console.log('ok   ' + msg); else { failures++; console.log('FAIL ' + msg); } };
const t0 = Date.now();

// ------------------------------------------------------------ helpers (independent of the engine)
let seed = 12345;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
const rint = (n) => Math.floor(rand() * n);

// Every deal: owner[c] in 0..P-1, or P for the envelope; envelope has one card of each type; hand sizes fixed.
function allDeals(spec) {
  const { n, P, hand, typeCards } = spec;
  const out = [];
  const envs = [[]];
  for (const cards of typeCards) { const next = []; for (const e of envs) for (const c of cards) next.push(e.concat([c])); envs.length = 0; envs.push(...next); }
  for (const env of envs) {
    const rest = []; for (let c = 0; c < n; c++) if (env.indexOf(c) < 0) rest.push(c);
    const owner = new Array(n).fill(-1); env.forEach((c) => { owner[c] = P; });
    const left = hand.slice();
    (function rec(i) {
      if (i === rest.length) { out.push(owner.slice()); return; }
      for (let p = 0; p < P; p++) if (left[p] > 0) { left[p]--; owner[rest[i]] = p; rec(i + 1); left[p]++; }
      owner[rest[i]] = -1;
    })(0);
  }
  return out;
}
function consistent(owner, obs, viewer, P) {
  for (const ob of obs) {
    if (ob.t === 'hand') { for (let c = 0; c < owner.length; c++) if ((owner[c] === viewer) !== (ob.cards.indexOf(c) >= 0)) return false; }
    else if (ob.t === 'show') { if (owner[ob.card] !== ob.p) return false; }
    else if (ob.t === 'pass') { if (ob.cards.some((c) => owner[c] === ob.p)) return false; }
    else if (ob.t === 'showx') { if (!ob.cards.some((c) => owner[c] === ob.p)) return false; }
    else if (ob.t === 'accwrong') { if (ob.cards.every((c) => owner[c] === P)) return false; }
  }
  return true;
}
// A random game's worth of observations for every player, generated from a true deal by the real rules
// (answer to the left, show one matching card), including the odd wrong accusation.
function randomHistory(spec, truth, steps) {
  const { P } = spec;
  const obs = [];
  for (let p = 0; p < P; p++) obs.push([{ t: 'hand', cards: truth.map((o, c) => (o === p ? c : -1)).filter((c) => c >= 0) }]);
  for (let k = 0; k < steps; k++) {
    const by = rint(P);
    const cards = spec.typeCards.map((tc) => tc[rint(tc.length)]);
    if (rand() < 0.06) {
      if (!cards.every((c) => truth[c] === P)) obs.forEach((o) => o.push({ t: 'accwrong', p: by, cards }));
      continue;
    }
    for (let i = 1; i < P; i++) {
      const q = (by + i) % P;
      const match = cards.filter((c) => truth[c] === q);
      if (!match.length) { obs.forEach((o) => o.push({ t: 'pass', p: q, by, cards })); continue; }
      const card = match[rint(match.length)];
      obs.forEach((o, j) => o.push(j === by ? { t: 'show', p: q, card } : { t: 'showx', p: q, to: by, cards }));
      break;
    }
  }
  return obs;
}

// ------------------------------------------------------------ 1 + 2. soundness and completeness by brute force
const CONFIGS = [
  { types: [3, 3, 3], hand: [2, 2, 2] },
  { types: [3, 3, 4], hand: [3, 2, 2] },
  { types: [2, 3, 3], hand: [2, 1, 1, 1] },
  { types: [2, 2, 3], hand: [2, 1, 1] },
];
const LEVELS = ['cards', 'passes', 'easy', 'normal', 'hard'];
const found = {}, entailed = {};
LEVELS.forEach((l) => { found[l] = 0; entailed[l] = 0; });
let unsound = [], cellsChecked = 0, scenarios = 0, solvable = 0, hardSolved = 0, hardWrong = 0;
for (const cfg of CONFIGS) {
  const spec = M.makeSpec(cfg.types, cfg.hand);
  const deals = allDeals(spec);
  const games = 60;
  for (let g = 0; g < games; g++) {
    const truth = deals[rint(deals.length)];
    const obsAll = randomHistory(spec, truth, 4 + rint(9));
    for (let viewer = 0; viewer < spec.P; viewer++) {
      // check after every prefix of the history, not only at the end
      const full = obsAll[viewer];
      for (let len = 1; len <= full.length; len += 1 + rint(3)) {
        const obs = full.slice(0, len);
        const cons = deals.filter((d) => consistent(d, obs, viewer, spec.P));
        if (!cons.some((d) => d.every((o, c) => o === truth[c]))) { unsound.push('generator: truth inconsistent'); continue; }
        scenarios++;
        const O = spec.P + 1;
        const can = new Array(spec.n * O).fill(false), must = new Array(spec.n * O).fill(true);
        for (const d of cons) for (let c = 0; c < spec.n; c++) for (let o = 0; o < O; o++) { const has = d[c] === o; can[c * O + o] = can[c * O + o] || has; must[c * O + o] = must[c * O + o] && has; }
        for (const level of LEVELS) {
          const K = M.deduce(spec, obs, viewer, level);
          if (K.bad) { unsound.push(level + ': contradiction on consistent observations'); continue; }
          for (let c = 0; c < spec.n; c++) for (let o = 0; o < O; o++) {
            const v = M.kget(K, c, o), i = c * O + o;
            cellsChecked++;
            if (v === -1 && can[i]) unsound.push(level + ': marked card ' + c + ' impossible for owner ' + o + ' but a consistent deal has it');
            if (v === 1 && !must[i]) unsound.push(level + ': marked card ' + c + ' certain for owner ' + o + ' but a consistent deal disagrees');
            if (!can[i] || must[i]) { entailed[level]++; if (v !== 0) found[level]++; }
          }
        }
        // Accusations: Hard accuses only from solvedFrom; it must be right whenever it fires.
        const envKnown = spec.typeCards.every((tc) => tc.some((c) => must[c * O + spec.P]));
        if (envKnown) solvable++;
        const sol = M.solvedFrom(M.deduce(spec, obs, viewer, 'hard'));
        if (sol) { hardSolved++; if (sol.some((c) => truth[c] !== spec.P)) hardWrong++; }
      }
    }
  }
}
ok(unsound.length === 0, `sound at every level: ${scenarios} observation sets on 4 small games, ${cellsChecked} card/owner cells checked against every consistent deal` + (unsound.length ? ' — ' + unsound.slice(0, 3).join(' | ') : ''));
ok(hardWrong === 0, `Hard's solution is right every time it has one (${hardSolved} times; the envelope was entailed in ${solvable} cases)`);
const rate = (l) => (100 * found[l] / entailed[l]);
console.log('     completeness (entailed facts found): ' + LEVELS.map((l) => l + ' ' + rate(l).toFixed(1) + '%').join(', '));
ok(rate('hard') >= rate('normal') && rate('normal') >= rate('easy') && rate('easy') >= rate('cards') - 1e-9, 'deeper levels find at least as much: hard ≥ normal ≥ easy ≥ cards-only');
ok(rate('hard') > 97, 'Hard finds over 97% of everything the observations entail (' + rate('hard').toFixed(2) + '%)');
ok(hardSolved >= solvable * 0.95, `Hard recognises the solution in at least 95% of the cases where it is entailed (${hardSolved}/${solvable})`);

// ------------------------------------------------------------ 3. hand-built scenarios (the real card set)
const NS = M.NS, NW = M.NW, NR = M.NR, NC = M.NC;
const W0 = NS, R0 = NS + NW;
const spec4 = M.makeSpec([NS, NW, NR], [5, 5, 4, 4]);
const E = 4;
const hand0 = [0, 1, W0, W0 + 1, R0];
const know = (obs, level) => M.deduce(spec4, [{ t: 'hand', cards: hand0 }].concat(obs), 0, level);

{ // nobody answers: the three are in the envelope unless you hold them
  const cards = [2, W0 + 2, R0 + 1];
  const obs = [1, 2, 3].map((p) => ({ t: 'pass', p, by: 0, cards }));
  for (const level of ['passes', 'easy', 'normal', 'hard']) {
    const K = know(obs, level);
    ok(cards.every((c) => M.kget(K, c, E) === 1), level + ': three passes on your own suggestion put all three in the envelope');
  }
  const K = know(obs, 'cards');
  ok(cards.every((c) => M.kget(K, c, E) === 0), 'cards-only notebook does not use passes');
  const asOwn = [0, W0 + 2, R0 + 1], K2 = know([1, 2, 3].map((p) => ({ t: 'pass', p, by: 0, cards: asOwn })), 'normal');
  ok(M.kget(K2, 0, E) === -1 && M.kget(K2, W0 + 2, E) === 1 && M.kget(K2, R0 + 1, E) === 1, 'naming your own card: it stays yours, the other two go to the envelope');
}
{ // Easy ignores other people's suggestions; Normal does not
  const obs = [{ t: 'pass', p: 1, by: 2, cards: [3, W0 + 3, R0 + 2] }];
  ok(M.kget(know(obs, 'easy'), 3, 1) === 0, 'Easy does not track passes on other players\' suggestions');
  ok(M.kget(know(obs, 'normal'), 3, 1) === -1, 'Normal does');
}
{ // a shown card, then the envelope by elimination within a type
  const obs = [2, 3, 4].map((s, i) => ({ t: 'show', p: 1 + i, card: s }));
  const K = know(obs, 'easy');
  ok(M.kget(K, 5, E) === 1 && M.solvedFrom(K) === null, 'five suspects accounted for: the sixth is in the envelope (Easy sees this too)');
}
{ // clause resolution: p showed one of three; two are ruled out for p
  const cards = [3, W0 + 3, R0 + 3];
  const obs = [{ t: 'showx', p: 2, to: 1, cards }, { t: 'pass', p: 2, by: 3, cards: [3, W0 + 4, R0 + 4] }, { t: 'show', p: 1, card: W0 + 3 }];
  ok(M.kget(know(obs, 'hard'), R0 + 3, 2) === 1, 'Hard: player 2 showed one of three, lacks one and another is elsewhere — so holds the third');
  ok(M.kget(know(obs, 'normal'), R0 + 3, 2) === 0, 'Normal does not track other players\' answers');
}
{ // hand size: all of a player's cards known → nothing else is theirs
  const obs = [2, 3, W0 + 2, W0 + 3].map((card) => ({ t: 'show', p: 2, card }));
  const K = know(obs, 'normal');
  let all = true; for (let c = 0; c < NC; c++) if ([2, 3, W0 + 2, W0 + 3].indexOf(c) < 0 && M.kget(K, c, 2) !== -1) all = false;
  ok(all, 'Normal: four of four cards known for a player → every other card is not theirs');
  ok(M.kget(know(obs, 'easy'), R0 + 5, 2) === 0, 'Easy does not count hands');
}
{ // a deduction only probing finds: one free slot, clauses {a,b} and {b,c} → b
  // player 3 holds 4 cards; three are known, so one slot is left.
  const known = [3, W0 + 4, R0 + 6];
  const a = 4, b = W0 + 5, c = R0 + 7;
  const obs = known.map((card) => ({ t: 'show', p: 3, card }))
    .concat([{ t: 'showx', p: 3, to: 1, cards: [a, b, known[0]] }])  // satisfied already: no help
    .concat([{ t: 'showx', p: 3, to: 2, cards: [a, b, R0 + 1] }, { t: 'showx', p: 3, to: 1, cards: [5, b, c] }])
    .concat([{ t: 'pass', p: 3, by: 1, cards: [5, W0 + 2, R0 + 1] }]);
  const Kn = M.deduce(spec4, [{ t: 'hand', cards: hand0 }].concat(obs), 0, 'normal');
  const Kh = know(obs, 'hard');
  ok(M.kget(Kh, b, 3) === 1, 'Hard (probing): one free slot and two answers that share only one card → that card');
  ok(M.kget(Kn, b, 3) === 0, 'Normal does not see it');
  // and the brute-force-equivalent check: in this spec no assignment gives player 3 anything but b
}
{ // a wrong accusation: the three are not all in the envelope
  const obs = [{ t: 'accwrong', p: 2, cards: [2, W0 + 2, R0 + 2] }];
  const solved = [3, 4, 5].map((s, i) => ({ t: 'show', p: 1 + i, card: s }))
    .concat([W0 + 3, W0 + 4, W0 + 5].map((w, i) => ({ t: 'show', p: 1 + i, card: w })));
  const K = know(obs.concat(solved), 'normal');
  ok(M.kget(K, 2, E) === 1 && M.kget(K, W0 + 2, E) === 1 && M.kget(K, R0 + 2, E) === -1, 'Normal: a wrong accusation whose suspect and weapon are right rules out its room');
}
{ // contradictions are reported, never silently accepted
  const K = know([{ t: 'show', p: 1, card: 0 }], 'hard');
  ok(K.bad, 'an impossible observation (another player shows a card you hold) is flagged as a contradiction');
}

console.log(`\n${checks - failures}/${checks} passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failures ? 1 : 0);
