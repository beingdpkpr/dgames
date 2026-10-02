// The rules, headless. Lifts everything above the `// ---------- UI ----------` marker in index.html into
// node's vm: the map graph and the tickets, the deck and the three-locomotive reset, drawing, claiming
// (grey routes, locomotives, double routes by table size), ticket completion, the longest path against
// a brute force, the end of the game, scoring, save/resume, what the computer may look at, and the
// shared back button.
// Run: node test/rules.js
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { Math, console, Array, Object, Number, String, JSON, Set, Map, Infinity, Error };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const M = ctx.__railRoutes;
const { LOCO, ROUTES, CITIES, TICKETS, CI } = M;

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (cond) console.log('ok   ' + msg); else { failures++; console.log('FAIL ' + msg); } };
const t0 = Date.now();
const kinds = (n, k) => Array.from({ length: n }, (_, i) => ({ name: 'P' + i, kind: (k && k[i]) || 'human' }));
const clone = (S) => JSON.parse(JSON.stringify(S));
const routeBetween = (a, b) => ROUTES.filter((R) => (R.a === CI[a] && R.b === CI[b]) || (R.a === CI[b] && R.b === CI[a]));
const total = (S) => { const c = new Array(9).fill(0); for (const x of S.deck.concat(S.disc, S.face.filter((f) => f >= 0))) c[x]++; S.players.forEach((P) => P.hand.forEach((n, k) => { c[k] += n; })); return c; };
const fullDeck = (c) => c.every((n, k) => n === (k === LOCO ? 14 : 12));
// A game already in play: setup finished with each player's first two tickets kept.
function playing(n, seed) {
  const S = M.newGame({ seed: seed || 5, players: kinds(n) });
  while (S.phase === 'setup') M.apply(S, { t: 'keep', keep: S.players[S.cur].offer.slice(0, 2) });
  return S;
}
// Put card c face up in slot i, taking it from the pile, the discards or another hand, and putting the
// card it replaces where c came from, so the 110 cards stay whole.
function place(S, i, c) {
  const old = S.face[i];
  if (old === c) return;
  let j = S.deck.lastIndexOf(c);
  if (j >= 0) { S.deck.splice(j, 1); if (old >= 0) S.deck.push(old); }
  else if ((j = S.disc.lastIndexOf(c)) >= 0) { S.disc.splice(j, 1); if (old >= 0) S.disc.push(old); }
  else { const P = S.players.find((Q) => Q.hand[c] > 0); P.hand[c]--; if (old >= 0) P.hand[old]++; }
  S.face[i] = c;
}
// Give player p exactly this hand (rest of the cards go back to the deck), keeping the card count whole.
function setHand(S, p, hand) {
  const P = S.players[p];
  for (let k = 0; k < 9; k++) for (let i = 0; i < P.hand[k]; i++) S.deck.push(k);
  P.hand = new Array(9).fill(0);
  for (let k = 0; k < 9; k++) for (let i = 0; i < (hand[k] || 0); i++) { const j = S.deck.lastIndexOf(k); if (j < 0) throw new Error('no card ' + k); S.deck.splice(j, 1); P.hand[k]++; }
}

// ------------------------------------------------------------ the map
{
  ok(CITIES.length >= 35 && CITIES.length <= 45 && new Set(CITIES.map((c) => c.name)).size === CITIES.length, CITIES.length + ' cities, all names different');
  ok(ROUTES.every((R) => Number.isInteger(R.len) && R.len >= 1 && R.len <= 6 && R.c >= -1 && R.c <= 7 && R.a !== R.b && R.a >= 0 && R.b >= 0), ROUTES.length + ' routes, every length 1..6 and colour grey or one of 8');
  const seen = new Set(); let dupes = 0, badTwins = 0;
  for (const R of ROUTES) {
    const key = Math.min(R.a, R.b) + '-' + Math.max(R.a, R.b);
    if (seen.has(key) && R.twin < 0) dupes++;
    seen.add(key);
    if (R.twin >= 0) { const T = ROUTES[R.twin]; if (T.twin !== R.id || T.a !== R.a || T.b !== R.b || T.len !== R.len || (T.c === R.c && R.c >= 0)) badTwins++; }
  }
  ok(dupes === 0 && badTwins === 0, 'a city pair has one route, or exactly two tracks of a double route (same length, different colours unless both grey)');
  const doubles = ROUTES.filter((R) => R.twin >= 0).length / 2;
  ok(doubles >= 8, doubles + ' double routes');
  const seenC = new Set([0]), q = [0];
  while (q.length) { const v = q.pop(); for (const r of M.ADJ[v]) { const R = ROUTES[r], w = R.a === v ? R.b : R.a; if (!seenC.has(w)) { seenC.add(w); q.push(w); } } }
  ok(seenC.size === CITIES.length, 'the map is one connected network');
  ok(CITIES.every((C, i) => M.ADJ[i].length >= 1), 'every city has a route');
  const lens = [0, 0, 0, 0, 0, 0, 0]; ROUTES.forEach((R) => lens[R.len]++);
  ok(lens.slice(1).every((n) => n > 0), 'routes of every length 1..6 exist: ' + lens.slice(1).join(', '));
  const cars = new Array(8).fill(0); ROUTES.forEach((R) => { if (R.c >= 0) cars[R.c] += R.len; });
  ok(Math.max(...cars) - Math.min(...cars) <= 4, 'colours balanced: ' + cars.join(', ') + ' cars per colour');
  const totalCars = ROUTES.reduce((s, R) => s + R.len, 0);
  ok(totalCars > 5 * M.TRAINS, totalCars + ' car spaces on the map, more than five players\' 225 trains');
  // tickets: every one completable and worth the fewest cars between its cities
  ok(TICKETS.length >= 28 && TICKETS.length <= 40, TICKETS.length + ' destination tickets');
  const pairs = new Set(TICKETS.map((T) => Math.min(T.a, T.b) + '-' + Math.max(T.a, T.b)));
  ok(pairs.size === TICKETS.length && TICKETS.every((T) => T.a !== T.b), 'no two tickets join the same pair of cities');
  let bad = 0;
  for (const T of TICKETS) {
    // independent Bellman-Ford
    const d = CITIES.map(() => Infinity); d[T.a] = 0;
    for (let i = 0; i < CITIES.length; i++) for (const R of ROUTES) { if (d[R.a] + R.len < d[R.b]) d[R.b] = d[R.a] + R.len; if (d[R.b] + R.len < d[R.a]) d[R.a] = d[R.b] + R.len; }
    if (!(d[T.b] < Infinity) || d[T.b] !== T.pts) bad++;
  }
  ok(bad === 0, 'every ticket is completable and its points equal the fewest cars between its cities (checked by Bellman-Ford)');
  const pts = TICKETS.map((T) => T.pts);
  ok(Math.min(...pts) >= 4 && Math.max(...pts) <= 30, 'ticket points from ' + Math.min(...pts) + ' to ' + Math.max(...pts));
  ok(CITIES.every((C) => C.x > 44 && C.x < 856 && C.y > 30 && C.y < 934), 'every city inside the drawn map');
}

// ------------------------------------------------------------ deck and deal
{
  ok(fullDeck((() => { const c = new Array(9).fill(0); M.freshDeck().forEach((k) => c[k]++); return c; })()), 'deck: 12 of each of 8 colours and 14 locomotives (110)');
  let bad = 0;
  for (let n = 2; n <= 5; n++) for (let seed = 1; seed <= 60; seed++) {
    const S = M.newGame({ seed, players: kinds(n) });
    if (!fullDeck(total(S))) bad++;
    if (S.players.some((P) => P.hand.reduce((a, b) => a + b, 0) !== 4 || P.offer.length !== 3 || P.trains !== 45)) bad++;
    if (S.face.filter((c) => c === LOCO).length >= 3) bad++;
    const tk = S.tdeck.concat(...S.players.map((P) => P.offer));
    if (tk.length !== TICKETS.length || new Set(tk).size !== TICKETS.length) bad++;
  }
  ok(bad === 0, '240 deals (2-5 players): 4 cards and 3 tickets offered each, 45 trains, fewer than 3 face-up locomotives, nothing lost or doubled');
  const a = M.newGame({ seed: 99, players: kinds(3) }), b = M.newGame({ seed: 99, players: kinds(3) }), c = M.newGame({ seed: 100, players: kinds(3) });
  ok(JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a.deck) !== JSON.stringify(c.deck), 'the same seed deals the same game; another seed does not');
}

// ------------------------------------------------------------ the three-locomotive reset
{
  let bad = 0, resets = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const S = playing(3, seed);
    // force three locomotives face up from the deck
    for (let i = 0; i < 3; i++) { const j = S.deck.lastIndexOf(LOCO); if (j < 0) continue; S.deck.splice(j, 1); S.disc.push(S.face[i]); S.face[i] = LOCO; }
    const ev = [];
    M.refill(S, ev);
    if (ev.some((e) => e.e === 'reset')) resets++;
    if (S.face.filter((c) => c === LOCO).length >= 3 || !fullDeck(total(S)) || S.face.some((c) => c < 0)) bad++;
  }
  ok(resets === 200 && bad === 0, 'three face-up locomotives: all five discarded and replaced, never left at three, no card lost (200 positions)');
  // only locomotives left to draw: resetting could never help, so the row stays instead of looping
  const S = playing(2, 3);
  for (const x of S.deck.concat(S.disc, S.face.filter((c) => c >= 0))) S.players[1].hand[x]++;
  S.deck = []; S.disc = []; S.face = [-1, -1, -1, -1, -1];
  for (let i = 0; i < 4; i++) { S.players[1].hand[LOCO]--; S.face[i] = LOCO; }
  S.players[1].hand[0]--; S.face[4] = 0;
  while (S.players[1].hand[LOCO] > 0) { S.players[1].hand[LOCO]--; S.deck.push(LOCO); }
  const ev = [];
  M.refill(S, ev);
  ok(fullDeck(total(S)) && ev.filter((e) => e.e === 'reset').length === 0 && S.face.filter((c) => c === LOCO).length === 4, 'with only locomotives left to draw, four face-up locomotives stay instead of resetting forever');
}

// ------------------------------------------------------------ drawing
{
  const S = playing(3, 11);
  const p = S.cur;
  S.face = S.face.map((c) => (c === LOCO ? 0 : c)); // tidy: we place cards by hand below
  S.face[0] = LOCO; S.face[1] = 3; S.face[2] = 4;
  const before = S.players[p].hand[LOCO];
  let r = M.apply(S, { t: 'face', i: 0 });
  ok(r.ok && S.players[p].hand[LOCO] === before + 1 && S.cur === (p + 1) % 3 && S.stage === 'start', 'a face-up locomotive as the first card ends the turn (it counts as two)');
  const q = S.cur;
  S.face[1] = 3; S.face[2] = LOCO;
  r = M.apply(S, { t: 'face', i: 1 });
  ok(r.ok && S.stage === 'drew1' && S.cur === q, 'a coloured face-up card: one more card to take');
  const f2 = S.face[2];
  r = M.apply(S, { t: 'face', i: 2 });
  ok(!r.ok && S.stage === 'drew1' && S.face[2] === f2 && /locomotive/.test(r.why), 'a face-up locomotive cannot be the second card: refused, nothing changes');
  r = M.apply(S, { t: 'claim', r: 0, k: 0, loco: 0 });
  ok(!r.ok && S.stage === 'drew1', 'cannot claim a route after taking one card');
  r = M.apply(S, { t: 'tickets' });
  ok(!r.ok, 'cannot draw tickets after taking one card');
  const deckN = S.deck.length;
  r = M.apply(S, { t: 'deck' });
  ok(r.ok && S.deck.length === deckN - 1 && S.cur === (q + 1) % 3 && S.stage === 'start', 'second card from the pile ends the turn');
  const S2 = playing(2, 12);
  place(S2, 0, 1); place(S2, 1, 2);
  const p2 = S2.cur, h = S2.players[p2].hand.slice();
  M.apply(S2, { t: 'face', i: 0 }); M.apply(S2, { t: 'face', i: 1 });
  ok(S2.players[p2].hand[1] === h[1] + 1 && S2.players[p2].hand[2] === h[2] + 1 && S2.cur !== p2, 'two coloured face-up cards, then the turn passes');
  ok(S2.face.every((c) => c >= 0) && fullDeck(total(S2)), 'face-up row refilled from the pile after each take');
  // empty pile: discards are reshuffled in
  const S3 = playing(2, 13);
  S3.disc = S3.disc.concat(S3.deck); S3.deck = [];
  const ev = M.apply(S3, { t: 'deck' }).ev;
  ok(ev.some((e) => e.e === 'reshuffle') && S3.disc.length === 0 && fullDeck(total(S3)), 'empty pile: the discards are shuffled into a new one');
  // nothing to draw after the first card: the turn ends by itself
  const S4 = playing(2, 14);
  const p4 = S4.cur;
  place(S4, 0, 2); place(S4, 1, LOCO); place(S4, 2, LOCO);
  for (const i of [3, 4]) { S4.players[1 - p4].hand[S4.face[i]]++; S4.face[i] = -1; }
  for (const x of S4.deck.concat(S4.disc)) S4.players[1 - p4].hand[x]++;
  S4.deck = []; S4.disc = [];
  M.apply(S4, { t: 'face', i: 0 });
  ok(S4.cur !== p4 && fullDeck(total(S4)), 'when no second card can be taken (only locomotives face up, empty pile) the turn ends after the first');
  ok(M.canPass(S4) === false, 'a player who can still take a face-up locomotive cannot pass');
  // passing: only when nothing at all is possible. Every card in hands, no tickets left, and no trains
  // to lay (so nothing is affordable).
  const S5 = playing(2, 15);
  const p5 = S5.cur;
  ok(!M.canPass(S5) && !M.apply(S5, { t: 'pass' }).ok, 'passing is refused while anything else is possible');
  for (const x of S5.deck.concat(S5.disc, S5.face.filter((c) => c >= 0))) S5.players[1 - p5].hand[x]++;
  S5.deck = []; S5.disc = []; S5.face = [-1, -1, -1, -1, -1];
  S5.players[1 - p5].tickets.push(...S5.tdeck.splice(0));
  S5.players.forEach((P) => { P.trains = 0; });
  ok(M.canPass(S5) && M.apply(S5, { t: 'pass' }).ok && S5.phase === 'play' && S5.cur !== p5, 'no cards anywhere, no tickets, nothing affordable: the only move is to pass');
  ok(M.apply(S5, { t: 'pass' }).ok && S5.phase === 'over' && S5.endReason === 'stalled' && S5.final, 'when everyone in turn has had to pass, the game ends and is scored');
}

// ------------------------------------------------------------ claiming
{
  const S = playing(4, 21);
  const p = S.cur;
  const [red] = ROUTES.filter((R) => R.c === 0 && R.len === 3);
  setHand(S, p, { 0: 2, 4: 3, [LOCO]: 1 });
  const opts = M.claimOptions(S, p, red.id);
  ok(opts.length === 1 && opts[0].k === 0 && opts[0].use === 2 && opts[0].loco === 1, 'a red 3-route with 2 red, 3 blue and a locomotive: only "2 red + 1 locomotive" (blue cannot pay a red route)');
  ok(!M.apply(S, { t: 'claim', r: red.id, k: 4, loco: 0 }).ok, 'paying a red route with blue is refused');
  const sc = S.players[p].score, tr = S.players[p].trains, disc = S.disc.length;
  const r = M.apply(S, { t: 'claim', r: red.id, k: 0, loco: 1 });
  ok(r.ok && S.owner[red.id] === p && S.players[p].hand[0] === 0 && S.players[p].hand[LOCO] === 0 && S.players[p].trains === tr - 3 && S.players[p].score === sc + 4 && S.disc.length === disc + 3, 'claim: cards to the discards, 3 trains placed, 4 points scored, turn over');
  ok(S.cur !== p && fullDeck(total(S)), 'the turn passes and no card is lost');
  // grey: any one colour, never mixed
  const S2 = playing(4, 22);
  const q = S2.cur;
  const grey = ROUTES.find((R) => R.c < 0 && R.len === 4);
  setHand(S2, q, { 1: 2, 3: 2, 6: 3, [LOCO]: 2 });
  const go = M.claimOptions(S2, q, grey.id);
  const ks = new Set(go.map((o) => o.k));
  ok(go.every((o) => o.use + o.loco === 4) && ks.has(1) && ks.has(3) && ks.has(6) && !go.some((o) => o.k === LOCO), 'grey 4-route: orange, green or white each topped up with locomotives; never two colours; not all locomotives with only 2');
  ok(go[0].loco === 1 && go[0].k === 6, 'fewest locomotives first (3 white + 1 locomotive)');
  setHand(S2, q, { [LOCO]: 4 });
  ok(M.claimOptions(S2, q, grey.id).some((o) => o.k === LOCO && o.loco === 4), 'four locomotives alone pay for a 4-route');
  setHand(S2, q, { 2: 6 });
  S2.players[q].trains = 3;
  ok(M.claimBlock(S2, q, grey.id).includes('trains') && !M.claimOptions(S2, q, grey.id).length, 'not enough trains left: the route cannot be claimed');
  S2.players[q].trains = 45;
  // points table
  ok(M.POINTS.slice(1).join() === '1,2,4,7,10,15', 'route points 1, 2, 4, 7, 10, 15 for lengths 1 to 6');
  // already claimed
  const S3 = playing(3, 23); const p3 = S3.cur;
  setHand(S3, p3, { [LOCO]: 6 });
  S3.owner[grey.id] = (p3 + 1) % 3;
  ok(M.claimBlock(S3, p3, grey.id).startsWith('Already claimed'), 'a claimed route cannot be claimed again');
}

// ------------------------------------------------------------ double routes by table size
{
  const D = ROUTES.find((R) => R.twin >= 0 && R.id < R.twin), E = ROUTES[D.twin];
  for (const n of [2, 3, 4, 5]) {
    const S = playing(n, 30 + n);
    const p = S.cur, q = (p + 1) % n;
    S.owner[D.id] = p;
    const sameBlocked = !!M.claimBlock(S, p, E.id);
    const otherBlocked = !!M.claimBlock(S, q, E.id);
    ok(sameBlocked && otherBlocked === (n <= 3), `${n} players: owning one track of ${CITIES[D.a].name}–${CITIES[D.b].name} bars you from the other; another player ${n <= 3 ? 'cannot use it either' : 'may claim it'}`);
  }
}

// ------------------------------------------------------------ tickets
{
  const S = playing(3, 41);
  const p = 0;
  const t = TICKETS.find((T) => T.pts <= 9);
  const path = M.tracePath(M.dijkstra((r) => ROUTES[r].len, t.a).via, t.a, t.b);
  S.players[p].tickets = [t.id];
  ok(!M.ticketDone(S, p, t.id), 'a ticket is not complete on an empty map');
  path.forEach((r, i) => { S.owner[r] = i === path.length - 1 ? 1 : p; });
  ok(!M.ticketDone(S, p, t.id), 'another player\'s route does not complete your ticket');
  S.owner[path[path.length - 1]] = p;
  ok(M.ticketDone(S, p, t.id), 'your own routes joining the two cities complete it (' + CITIES[t.a].name + ' to ' + CITIES[t.b].name + ')');
  // a detour counts as well as the shortest path
  const S2 = playing(3, 42);
  const T2 = TICKETS.find((T) => T.pts >= 12);
  const ban = new Set(M.tracePath(M.dijkstra((r) => ROUTES[r].len, T2.a).via, T2.a, T2.b));
  const det = M.tracePath(M.dijkstra((r) => (ban.has(r) ? Infinity : ROUTES[r].len), T2.a).via, T2.a, T2.b);
  det.forEach((r) => { S2.owner[r] = 2; });
  ok(det.length > 0 && M.ticketDone(S2, 2, T2.id), 'any connection counts, not only the shortest one');
  // drawing tickets mid-game
  const S3 = playing(2, 43);
  const pp = S3.cur, n0 = S3.tdeck.length;
  ok(M.apply(S3, { t: 'tickets' }).ok && S3.offer.length === 3 && S3.stage === 'tickets', 'draw tickets: three offered');
  ok(!M.apply(S3, { t: 'keep', keep: [] }).ok && !M.apply(S3, { t: 'deck' }).ok, 'must keep at least one and may do nothing else');
  const off = S3.offer.slice();
  ok(M.apply(S3, { t: 'keep', keep: [off[1]] }).ok && S3.players[pp].tickets.includes(off[1]) && S3.tdeck.length === n0 - 1 && S3.tdeck[0] === off[2] || S3.tdeck[1] === off[2], 'kept one; the other two go to the bottom of the ticket pile');
  ok(S3.cur !== pp, 'and the turn passes');
  const S4 = M.newGame({ seed: 44, players: kinds(3) });
  ok(!M.apply(S4, { t: 'keep', keep: [S4.players[0].offer[0]] }).ok && M.apply(S4, { t: 'keep', keep: S4.players[0].offer.slice() }).ok, 'at the start at least two of the three must be kept (all three allowed)');
}

// ------------------------------------------------------------ longest path against a brute force
{
  // Brute force by a different method: over every subset of edges, a subset is a single trail when it
  // is connected and has 0 or 2 odd-degree cities (Euler). The longest trail is the heaviest such subset.
  const brute = (edges) => {
    let best = 0;
    for (let mask = 1; mask < 1 << edges.length; mask++) {
      const sub = edges.filter((e, i) => mask & (1 << i));
      const deg = new Map(); const par = new Map();
      const find = (x) => { while (par.get(x) !== x) x = par.get(x); return x; };
      for (const e of sub) for (const v of [e.a, e.b]) { deg.set(v, (deg.get(v) || 0) + 1); if (!par.has(v)) par.set(v, v); }
      for (const e of sub) par.set(find(e.a), find(e.b));
      const roots = new Set([...par.keys()].map(find));
      const odd = [...deg.values()].filter((d) => d % 2).length;
      if (roots.size === 1 && (odd === 0 || odd === 2)) best = Math.max(best, sub.reduce((s, e) => s + e.len, 0));
    }
    return best;
  };
  const fixed = [
    ['a path', [[0, 1, 3], [1, 2, 4], [2, 3, 2]], 9],
    ['a star (only two arms can be used)', [[0, 1, 5], [0, 2, 4], [0, 3, 3]], 9],
    ['a triangle with a tail (go round, then out)', [[0, 1, 2], [1, 2, 2], [2, 0, 2], [2, 3, 6]], 12],
    ['a figure of eight through one city', [[0, 1, 1], [1, 2, 1], [2, 0, 1], [0, 3, 1], [3, 4, 1], [4, 0, 1]], 6],
    ['two squares sharing an edge (every route, as an Euler trail)', [[0, 1, 2], [1, 2, 2], [2, 3, 2], [3, 0, 2], [1, 4, 3], [4, 5, 3], [5, 2, 3]], 17],
    ['a square with a cross-bar, where one route must be left out', [[0, 1, 3], [1, 2, 3], [2, 3, 3], [3, 0, 3], [0, 2, 5], [1, 3, 1]], 17],
    ['two separate pieces', [[0, 1, 6], [2, 3, 4], [3, 4, 4]], 8],
  ];
  for (const [name, E, want] of fixed) {
    const edges = E.map(([a, b, len]) => ({ a, b, len }));
    const got = M.longestTrailEdges(edges).len;
    ok(got === want && brute(edges) === want, `longest path, ${name}: ${got} (brute force ${brute(edges)}, expected ${want})`);
  }
  let bad = 0, cyc = 0;
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let g = 0; g < 400; g++) {
    const n = 3 + Math.floor(rnd() * 5), m = 2 + Math.floor(rnd() * 9);
    const edges = [];
    for (let i = 0; i < m; i++) { const a = Math.floor(rnd() * n); let b = Math.floor(rnd() * n); if (b === a) b = (a + 1) % n; edges.push({ a, b, len: 1 + Math.floor(rnd() * 6) }); }
    if (edges.length >= n) cyc++;
    const got = M.longestTrailEdges(edges);
    // the returned edges really are a trail of that length (walked from either end of the first edge)
    const walks = (start) => { let v = start; for (const i of got.edges) { const e = edges[i]; if (e.a === v) v = e.b; else if (e.b === v) v = e.a; else return false; } return true; };
    const sum = got.edges.reduce((s, i) => s + edges[i].len, 0);
    const okTrail = !got.edges.length || walks(edges[got.edges[0]].a) || walks(edges[got.edges[0]].b);
    if (got.len !== brute(edges) || sum !== got.len || !okTrail || new Set(got.edges).size !== got.edges.length) bad++;
  }
  ok(bad === 0, `400 random networks (3-7 cities, up to 10 routes, ${cyc} with cycles or parallel routes): longest path equals the brute force and is a real trail`);
}

// ------------------------------------------------------------ the end of the game
{
  for (const n of [2, 3, 5]) {
    const S = playing(n, 50 + n);
    const p = S.cur;
    const one = ROUTES.find((R) => R.len === 1 && R.c < 0);
    S.players[p].trains = 3;
    setHand(S, p, { 5: 1 });
    // trains are a count of plastic pieces: tie it to owned routes for the save check
    const r = M.apply(S, { t: 'claim', r: one.id, k: 5, loco: 0 });
    ok(r.ok && r.ev.some((e) => e.e === 'lastRound') && S.lastTurns === n && S.phase === 'play', `${n} players: ending a turn with 2 trains starts the last round`);
    const turnsTaken = new Array(n).fill(0);
    let guard = 0;
    while (S.phase === 'play' && guard++ < 50) { turnsTaken[S.cur]++; const c = S.cur; M.apply(S, { t: 'deck' }); if (S.phase === 'play' && S.cur === c) M.apply(S, { t: 'deck' }); }
    ok(S.phase === 'over' && turnsTaken.every((x) => x === 1) && S.endReason === 'trains', `${n} players: everyone, the trigger player included, gets exactly one more turn; then the game is over`);
  }
  const S = playing(3, 60); const p = S.cur;
  S.players[p].trains = 4;
  setHand(S, p, { 5: 1 });
  M.apply(S, { t: 'claim', r: ROUTES.find((R) => R.len === 1 && R.c < 0).id, k: 5, loco: 0 });
  ok(S.lastTurns === -1, 'three trains left is not yet the end');
}

// ------------------------------------------------------------ scoring
{
  const S = playing(3, 70);
  // hand-built: player 0 joins a ticket; player 1 fails one; equal longest paths share the bonus
  const tA = TICKETS.find((T) => T.pts <= 9), tB = TICKETS.find((T) => T.pts >= 15);
  const pathA = M.tracePath(M.dijkstra((r) => ROUTES[r].len, tA.a).via, tA.a, tA.b);
  S.owner.fill(-1);
  pathA.forEach((r) => { S.owner[r] = 0; });
  S.players[0].tickets = [tA.id]; S.players[1].tickets = [tB.id]; S.players[2].tickets = [];
  const len0 = pathA.reduce((s, r) => s + ROUTES[r].len, 0);
  // player 1 builds a network of the same total length elsewhere, as a simple path
  const used = new Set(pathA);
  const others = M.tracePath(M.dijkstra((r) => (used.has(r) || used.has(ROUTES[r].twin) ? Infinity : ROUTES[r].len), CI.Mumbai).via, CI.Mumbai, CI.Kolkata);
  let acc = 0; const mine1 = [];
  for (const r of others) { if (acc + ROUTES[r].len > len0) break; acc += ROUTES[r].len; mine1.push(r); }
  mine1.forEach((r) => { S.owner[r] = 1; });
  S.players.forEach((P, p) => { const own = M.ownedRoutes(S, p); P.score = own.reduce((s, r) => s + M.POINTS[ROUTES[r].len], 0); });
  const F = M.finalScores(S);
  const r0 = F.rows[0], r1 = F.rows[1], r2 = F.rows[2];
  ok(r0.plus === tA.pts && r0.minus === 0 && r1.plus === 0 && r1.minus === tB.pts, 'tickets: a joined ticket adds its points, an unjoined one subtracts them');
  ok(r0.longest === len0 && r0.bonus === 10, 'longest path bonus 10 to the longest network (' + len0 + ' cars)');
  ok((r1.longest === len0) === (r1.bonus === 10) && r2.bonus === 0 && r2.longest === 0, 'a tie for longest path gives everyone tied the bonus; no routes, no bonus');
  ok(F.rows.every((r) => r.total === r.routes + r.plus - r.minus + r.bonus), 'total = route points + tickets joined - tickets missed + bonus');
  // Ties, built exactly. Route points come from P.score, so totals can be lined up on purpose.
  const disjoint = (A, B) => A.a !== B.a && A.a !== B.b && A.b !== B.a && A.b !== B.b;
  const fours = ROUTES.filter((R) => R.len === 4 && R.twin < 0);
  const ra = fours[0], rb = fours.find((R) => disjoint(R, ra));
  const tie = playing(2, 71);
  tie.owner.fill(-1); tie.owner[ra.id] = 0; tie.owner[rb.id] = 1;
  tie.players.forEach((P) => { P.tickets = []; P.score = 7; });
  let F2 = M.finalScores(tie);
  ok(F2.rows[0].bonus === 10 && F2.rows[1].bonus === 10 && F2.rows[0].total === F2.rows[1].total && F2.winners.length === 2, 'two equal longest paths both score the bonus; equal on every count, both win');
  // equal totals: more tickets completed wins. P0 joins one ticket and misses one of the same value.
  let tieA = null, tieB = null, pathT = null;
  for (const A of TICKETS) {
    const pa = M.tracePath(M.dijkstra((r) => ROUTES[r].len, A.a).via, A.a, A.b);
    const on = new Set(); pa.forEach((r) => { on.add(ROUTES[r].a); on.add(ROUTES[r].b); });
    const B = TICKETS.find((X) => X !== A && X.pts === A.pts && !(on.has(X.a) && on.has(X.b)));
    if (B) { tieA = A; tieB = B; pathT = pa; break; }
  }
  tie.owner.fill(-1); pathT.forEach((r) => { tie.owner[r] = 0; });
  tie.players[0].tickets = [tieA.id, tieB.id]; tie.players[1].tickets = [];
  tie.players[0].score = 20; tie.players[1].score = 30; // P0 has the bonus, P1 has no routes
  F2 = M.finalScores(tie);
  ok(F2.rows[0].total === F2.rows[1].total && F2.rows[0].done === 1 && F2.order[0] === 0 && F2.winners.join() === '0', 'equal totals: the player who completed more tickets wins');
  tie.players[0].tickets = []; tie.players[0].score = 20; tie.players[1].score = 30;
  F2 = M.finalScores(tie);
  ok(F2.rows[0].total === F2.rows[1].total && F2.rows[0].done === 0 && F2.rows[1].done === 0 && F2.winners.join() === '0', 'equal totals and tickets: the longest path decides');
}

// ------------------------------------------------------------ save and resume
{
  const S = M.simulate(80, ['hard', 'normal', 'easy'], { cap: 120 });
  const text = M.serialize(S);
  const back = M.deserialize(text);
  ok(back && JSON.stringify(back.owner) === JSON.stringify(S.owner) && back.rng === S.rng && back.cur === S.cur, 'a game in progress survives a save and resume');
  const a = M.aiMove(clone(back)), b = M.aiMove(clone(S));
  ok(JSON.stringify(a) === JSON.stringify(b), 'and continues identically (same random sequence)');
  const bads = [
    ['not JSON', '{oops'], ['empty', ''], ['null', 'null'], ['an old version', JSON.stringify({ v: 0, s: S })],
    ['a card missing', JSON.stringify({ v: 1, s: Object.assign(clone(S), { deck: S.deck.slice(1) }) })],
    ['a ticket doubled', JSON.stringify({ v: 1, s: Object.assign(clone(S), { tdeck: S.tdeck.concat([S.tdeck[0]]) }) })],
    ['trains not matching the routes', JSON.stringify({ v: 1, s: (() => { const c = clone(S); c.players[0].trains = 44; return c; })() })],
    ['a route owned by a sixth player', JSON.stringify({ v: 1, s: (() => { const c = clone(S); c.owner[0] = 7; return c; })() })],
    ['a missing field', JSON.stringify({ v: 1, s: (() => { const c = clone(S); delete c.face; return c; })() })],
  ];
  for (const [name, t] of bads) ok(M.deserialize(t) === null, 'a save that is ' + name + ' is refused (a fresh game starts instead)');
}

// ------------------------------------------------------------ the computer sees only what a player sees
{
  let same = 0, tries = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const S = M.simulate(900 + seed, ['hard', 'normal', 'hard', 'easy'], { cap: 20 + seed * 3 });
    if (S.phase !== 'play') continue;
    if (S.players[S.cur].kind === 'easy') continue;
    tries++;
    const A = clone(S), B = clone(S);
    // shuffle the hidden things: the pile order, the discards, the ticket pile, and other players' hands
    // and tickets (keeping their counts)
    B.deck.reverse(); B.tdeck.reverse();
    B.players.forEach((P, p) => {
      if (p === B.cur) return;
      const n = P.hand.reduce((x, y) => x + y, 0);
      for (let k = 0; k < 9; k++) for (let i = 0; i < P.hand[k]; i++) B.deck.push(k);
      P.hand = new Array(9).fill(0);
      for (let i = 0; i < n; i++) { const c = B.deck.splice(i % B.deck.length, 1)[0]; P.hand[c]++; }
      P.tickets = P.tickets.map((t) => (t + 7) % TICKETS.length);
    });
    if (JSON.stringify(M.aiMove(A)) === JSON.stringify(M.aiMove(B))) same++;
  }
  ok(tries > 20 && same === tries, `computer choices do not change when hidden cards and other players' tickets change (${same}/${tries} positions)`);
}

// ------------------------------------------------------------ the page
{
  const tetris = fs.readFileSync(path.join(__dirname, '..', '..', 'tetris', 'index.html'), 'utf8');
  const backBlock = (s) => { const a = s.lastIndexOf('<style>', s.indexOf('/* dgames: the way back')); const e = s.indexOf('</a>', s.indexOf('<a class="dg-home"')); return s.slice(a, e + 4); };
  ok(backBlock(html) === backBlock(tetris) && backBlock(html).length > 800, 'back button is byte-identical to tetris (' + backBlock(html).length + ' bytes)');
  const tm = /Ticket to Ride|Days of Wonder|Zug um Zug|Aventuriers/i;
  ok(!tm.test(html), 'no trademarked names in the page');
  ok(/\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/.test(html), 'a [hidden] rule that beats author display values');
  ok(!/\r\n/.test(html), 'LF line endings');
  const code = src.replace(/\/\/.*$/gm, '');
  ok(code.indexOf('Math.random') < 0 && code.indexOf('Date.now') < 0 && code.indexOf('performance.') < 0 && code.indexOf('document') < 0 && code.indexOf('window') < 0, 'the logic uses no Math.random, no clock and no DOM');
}

console.log(`\n${checks - failures}/${checks} passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failures ? 1 : 0);
