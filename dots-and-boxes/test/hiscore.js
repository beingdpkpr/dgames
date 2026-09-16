// Headless high-score check (no browser). Loads the game logic and the pasted high-score module out of
// index.html with a stubbed localStorage and checks:
//  1. the module: rank ordering for 'desc', the top-10 cap, initials upper-cased and cut to three, storage key;
//  2. hiScoreOf(): records only a finished game with exactly one human seat that the human wins outright,
//     keyed by the hardest computer at the table, with the human's margin over the best computer as the value;
//  3. over random AI-driven games with random seat kinds, hiScoreOf() agrees with winner() and the scores.
// Run: node test/hiscore.js
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'))
  + '\nglobalThis.__dab = { newState, applyMove, winner, aiMove, hiScoreOf, makeHiScores, LEVELS };';
const store = {};
const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const ctx = { Math, console, Array, Infinity, Map, JSON, Object, localStorage }; ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const g = ctx.__dab;

let failures = 0;
const assert = (ok, msg) => { if (!ok) { failures++; console.log('FAIL', msg); } };
const H = (r, c) => ({ t: 'h', r, c }), V = (r, c) => ({ t: 'v', r, c });

// 1. The module itself.
{
  assert(g.LEVELS.join() === 'easy,normal,hard', 'levels are ordered weakest first');
  const hs = g.makeHiScores({ key: 'dots-and-boxes.test', order: 'desc', max: 10, label: (v) => '+' + v });
  assert(hs.list().length === 0 && hs.rank(1) === 0, 'empty table: any margin ranks first');
  for (let i = 1; i <= 12; i++) hs.add(i, 'x' + i, '');
  const l = hs.list();
  assert(l.length === 10 && l[0].value === 12 && l[9].value === 3, 'capped at 10, best first (' + l.map((x) => x.value).join(',') + ')');
  assert(l.every((e, i) => i === 0 || l[i - 1].value >= e.value), 'list sorted best first');
  assert(hs.rank(13) === 0 && hs.rank(7) === 6 && hs.rank(3) === -1 && hs.rank(2) === -1, 'rank: top, middle, equal-to-last and worse');
  const e = hs.add(5, 'deepak', '5x5, 2 players, 11-6');
  assert(e.initials === 'DEE' && e.detail === '5x5, 2 players, 11-6', 'initials upper-cased and cut to 3, detail kept');
  assert(hs.add(4, 'ab', '').initials === 'AB', 'short initials are kept as typed');
  assert(JSON.parse(store['dgames.hiscores.dots-and-boxes.test']).length === 10, 'stored under dgames.hiscores.<key>, still capped');
  hs.clear(); assert(hs.list().length === 0, 'clear empties the table');
}

// 2. The hook on scripted games.
{
  // 4x4 dots, 2 players: 12 non-scoring horizontals, then seat 1 is forced to open row 0 and the rows alternate.
  // Seat 2 ends 6-3.
  const s = g.newState(4, 2);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) g.applyMove(s, H(r, c));
  assert(g.hiScoreOf(s, ['human', 'hard']) === null, 'nothing recorded while the game is running');
  g.applyMove(s, V(0, 0));
  for (const c of [1, 2, 3]) g.applyMove(s, V(0, c));
  g.applyMove(s, V(1, 0));
  for (const c of [1, 2, 3]) g.applyMove(s, V(1, c));
  g.applyMove(s, V(2, 0));
  for (const c of [1, 2, 3]) g.applyMove(s, V(2, c));
  assert(s.over && s.scores[1] === 3 && s.scores[2] === 6 && g.winner(s) === 2, 'scripted 4x4 game ends 3-6 to seat 2');
  assert(g.hiScoreOf(s, ['human', 'hard']) === null, 'the human losing is not recorded');
  assert(g.hiScoreOf(s, ['human', 'human']) === null, 'two humans are never recorded');
  const rec = g.hiScoreOf(s, ['normal', 'human']);
  assert(rec && rec.level === 'normal' && rec.value === 3 && rec.detail === '4x4, 2 players, 6-3', 'single human winning by 3 vs normal: ' + JSON.stringify(rec));
  // 3x3 dots, 5 seats: seats 2 and 3 open both rows, seat 4 sweeps every box (same script as test/players.js).
  const u = g.newState(3, 5);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) g.applyMove(u, H(r, c));
  g.applyMove(u, V(0, 0)); g.applyMove(u, V(1, 0));
  for (const e of [V(0, 1), V(0, 2), V(1, 1), V(1, 2)]) g.applyMove(u, e);
  assert(u.over && g.winner(u) === 4, 'seat 4 wins outright with every box');
  const r5 = g.hiScoreOf(u, ['easy', 'easy', 'normal', 'human', 'hard']);
  assert(r5 && r5.level === 'hard' && r5.value === 4 && r5.detail === '3x3, 5 players, 4-0', 'keyed by the hardest computer at the table: ' + JSON.stringify(r5));
  assert(g.hiScoreOf(u, ['easy', 'easy', 'easy', 'human', 'easy']).level === 'easy', 'all-easy table keys to easy');
  assert(g.hiScoreOf(u, ['human', 'easy', 'easy', 'easy', 'easy']) === null, 'the human (seat 1) losing a 5-seat game is not recorded');
  assert(g.hiScoreOf(u, ['human', 'human', 'easy', 'human', 'easy']) === null, 'several humans are never recorded, even when one wins');
  // 4x4 dots, 3 players: the three-way 3-3-3 tie from test/players.js.
  const t = g.newState(4, 3);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) g.applyMove(t, H(r, c));
  for (const e of [V(0, 0), V(0, 1), V(0, 2), V(0, 3), V(1, 0), V(1, 1), V(1, 2), V(1, 3), V(2, 0), V(2, 1), V(2, 2), V(2, 3)]) g.applyMove(t, e);
  assert(t.over && g.winner(t) === 0, 'three-way tie');
  assert(g.hiScoreOf(t, ['human', 'hard', 'hard']) === null, 'a tie is not recorded');
}

// 3. Random games: seat 1 is the human (moves picked by the hard AI), other seats random levels or humans.
{
  const LV = ['easy', 'normal', 'hard'];
  let games = 0, recorded = 0;
  for (let i = 0; i < 300; i++) {
    const players = 2 + (i % 4), n = 3 + (i % 3);
    const kinds = ['human'];
    for (let p = 2; p <= players; p++) kinds.push(Math.random() < 0.15 ? 'human' : LV[Math.floor(Math.random() * 3)]);
    const s = g.newState(n, players);
    let guard = 0;
    while (!s.over && ++guard < 1000) g.applyMove(s, g.aiMove(s, s.player === 1 ? 'hard' : (kinds[s.player - 1] === 'human' ? 'normal' : kinds[s.player - 1])));
    const ais = kinds.map((k, j) => [k, j + 1]).filter(([k]) => k !== 'human');
    const onlyHuman = kinds.filter((k) => k === 'human').length === 1;
    const bestAi = ais.length ? Math.max(...ais.map(([, p]) => s.scores[p])) : -1;
    const expect = onlyHuman && ais.length && g.winner(s) === 1
      ? { level: LV[Math.max(...ais.map(([k]) => LV.indexOf(k)))], value: s.scores[1] - bestAi, detail: n + 'x' + n + ', ' + players + ' players, ' + s.scores[1] + '-' + bestAi }
      : null;
    const got = g.hiScoreOf(s, kinds);
    assert(JSON.stringify(got) === JSON.stringify(expect), 'random game ' + i + ': ' + JSON.stringify(got) + ' vs expected ' + JSON.stringify(expect));
    if (got) { assert(got.value > 0, 'a recorded margin is always positive'); recorded++; }
    games++;
  }
  console.log('random games', games, '- recorded', recorded);
}

console.log(failures ? failures + ' FAILURE(S)' : 'all checks passed');
process.exit(failures ? 1 : 0);
