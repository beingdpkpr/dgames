// Whole computer games, headless, under half a minute: every game ends by the train rule within the
// cap, no computer ever makes an illegal move, the cards and tickets stay whole, the stored score
// matches an independent recount, and the levels are in the right order. The long level-versus-level
// table is test/bots.js (a report, not a test).
// Run: node test/sim.js
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { Math, console, Array, Object, Number, String, JSON, Set, Map, Infinity, Error };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const M = ctx.__railRoutes;

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (cond) console.log('ok   ' + msg); else { failures++; console.log('FAIL ' + msg); } };
const rotate = (a, r) => a.slice(r % a.length).concat(a.slice(0, r % a.length));
const t0 = Date.now();

// Independent recount of a finished game: route points from owned routes, tickets by flood fill.
function recount(S, p) {
  const own = S.owner.map((o, r) => (o === p ? r : -1)).filter((r) => r >= 0);
  const routes = own.reduce((s, r) => s + M.POINTS[M.ROUTES[r].len], 0);
  let tk = 0;
  for (const t of S.players[p].tickets) {
    const T = M.TICKETS[t], seen = new Set([T.a]), q = [T.a];
    while (q.length) { const v = q.pop(); for (const r of own) { const R = M.ROUTES[r]; for (const [x, y] of [[R.a, R.b], [R.b, R.a]]) if (x === v && !seen.has(y)) { seen.add(y); q.push(y); } } }
    tk += seen.has(T.b) ? T.pts : -T.pts;
  }
  return { routes, tk, trains: M.TRAINS - own.reduce((s, r) => s + M.ROUTES[r].len, 0) };
}

// 1. every game ends, at every table size, and nothing illegal happens on the way
const TABLES = [['hard', 'normal'], ['easy', 'easy'], ['hard', 'normal', 'easy'], ['normal', 'normal', 'normal', 'normal'], ['hard', 'hard', 'normal', 'easy'], ['easy', 'normal', 'hard', 'easy', 'normal'], ['hard', 'hard', 'hard', 'hard', 'hard']];
let lengths = [];
for (const kinds of TABLES) {
  const N = 16;
  let unfinished = 0, illegal = 0, stalled = 0, broken = 0, maxTurn = 0, sum = 0;
  for (let seed = 1; seed <= N; seed++) {
    const k = rotate(kinds, seed);
    const S = M.simulate(100 * kinds.length + seed, k, { cap: 2000 });
    if (S.phase !== 'over') unfinished++;
    if (S.illegal.length) illegal++;
    if (S.endReason === 'stalled') stalled++;
    maxTurn = Math.max(maxTurn, S.turn); sum += S.turn;
    lengths.push(S.turn / kinds.length);
    if (S.phase === 'over') {
      const cards = new Array(9).fill(0);
      for (const x of S.deck.concat(S.disc, S.face.filter((c) => c >= 0))) cards[x]++;
      S.players.forEach((P) => P.hand.forEach((n, c) => { cards[c] += n; }));
      if (!cards.every((n, c) => n === (c === M.LOCO ? 14 : 12))) broken++;
      S.final.rows.forEach((row) => {
        const rc = recount(S, row.p);
        if (rc.routes !== row.routes || rc.tk !== row.plus - row.minus || rc.trains !== S.players[row.p].trains) broken++;
      });
      if (!S.players.some((P) => P.trains <= 2)) broken++;
    }
  }
  console.log(`     ${kinds.join(',')}: ${N} games, turns per player avg ${(sum / N / kinds.length).toFixed(1)}, longest game ${maxTurn} turns`);
  ok(unfinished === 0 && stalled === 0, `${kinds.length} players (${[...new Set(kinds)].join('/')}): all ${N} games end by the train rule within the cap`);
  ok(illegal === 0, '  no computer move was ever refused');
  ok(broken === 0, '  110 cards accounted for; route points, ticket points and trains match an independent recount');
}
lengths.sort((a, b) => a - b);
console.log(`     turns per player over all ${lengths.length} games: median ${lengths[lengths.length >> 1].toFixed(0)}, range ${lengths[0].toFixed(0)}-${lengths[lengths.length - 1].toFixed(0)}`);

// 2. the levels mean something: one of each at a three-player table, seats rotated
{
  const N = 150, wins = { hard: 0, normal: 0, easy: 0 }, pts = { hard: 0, normal: 0, easy: 0 };
  for (let seed = 1; seed <= N; seed++) {
    const k = rotate(['hard', 'normal', 'easy'], seed);
    const S = M.simulate(3000 + seed, k);
    for (const w of S.final.winners) wins[k[w]] += 1 / S.final.winners.length;
    S.final.rows.forEach((r) => { pts[k[r.p]] += r.total; });
  }
  const f = (x) => x.toFixed(0);
  console.log(`     Hard/Normal/Easy, ${N} games: wins Hard ${f(wins.hard)}, Normal ${f(wins.normal)}, Easy ${f(wins.easy)}; average score ${f(pts.hard / N)}/${f(pts.normal / N)}/${f(pts.easy / N)}`);
  ok(wins.hard > wins.normal && wins.normal > wins.easy && pts.hard > pts.normal && pts.normal > pts.easy, 'Hard wins most and scores most, then Normal, then Easy');
}

console.log(`\n${checks - failures}/${checks} passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failures ? 1 : 0);
