// The rules, headless. Lifts everything above the `// ---------- UI ----------` marker in index.html into
// node's vm and checks: board generation (tiles, number tokens, no 6/8 side by side, harbours), the hex
// geometry, the distance rule, setup, production on every roll (towns, the bandit, a short bank), 7s and
// discards, building costs and legality, every venture card, the Longest Road against brute force on
// tricky networks, the Strongest Guard, harbour rates, trades, winning, save/resume, the computer players'
// legality, and the shared back button.
// Run: node test/rules.js
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { Math, console, Array, Object, Number, String, JSON, Set, Map, Infinity, Uint8Array, Error };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const M = ctx.__islandTraders;
const { HEXES, VERTS, EDGES, COST } = M;

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (cond) console.log('ok   ' + msg); else { failures++; console.log('FAIL ' + msg); } };
const t0 = Date.now();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (S) => JSON.parse(JSON.stringify(S));
// A game past setup, in `main` with the dice rolled, nothing on the board.
function blank(n, seed) {
  const S = M.newGame({ seed: seed || 1, players: Array.from({ length: n || 4 }, (_, i) => ({ name: 'P' + i, kind: 'human' })) });
  S.phase = 'main'; S.turn = 5; S.cur = 0; S.rolled = true; S.setup.i = S.setup.order.length;
  return S;
}
const give = (S, p, res) => { S.players[p].res = res.slice(); };
const put = (S, p, v, lvl) => { S.vOwn[v] = p; S.vLvl[v] = lvl || 1; };
const road = (S, p, a, b) => { const e = M.edgeBetween(a, b); if (e === undefined) throw new Error('no edge ' + a + '-' + b); S.eOwn[e] = p; return e; };

// ------------------------------------------------------------ geometry
{
  ok(HEXES.length === 19 && VERTS.length === 54 && EDGES.length === 72, `19 tiles, 54 corners, 72 edges (${HEXES.length}/${VERTS.length}/${EDGES.length})`);
  ok(M.COAST.length === 30, '30 coastal edges');
  ok(HEXES.every((H) => H.v.length === 6 && new Set(H.v).size === 6 && H.e.length === 6 && new Set(H.e).size === 6), 'every tile has 6 distinct corners and 6 distinct edges');
  ok(VERTS.every((V) => V.adj.length >= 2 && V.adj.length <= 3 && V.adj.length === V.edges.length && V.hexes.length >= 1 && V.hexes.length <= 3), 'every corner joins 2 or 3 edges and touches 1 to 3 tiles');
  ok(VERTS.every((V, v) => V.adj.every((u) => VERTS[u].adj.includes(v) && Math.abs(Math.hypot(V.x - VERTS[u].x, V.y - VERTS[u].y) - 1) < 1e-9)), 'corner adjacency is symmetric and every edge is one hex side long');
  ok(EDGES.every((E) => E.hexes.length >= 1 && E.hexes.length <= 2 && VERTS[E.a].adj.includes(E.b)), 'every edge borders 1 or 2 tiles and joins two adjacent corners');
  const inner = VERTS.filter((V) => V.hexes.length === 3).length, coastV = VERTS.filter((V) => V.hexes.length < 3).length;
  ok(inner === 24 && coastV === 30, `24 inland corners (3 tiles) and 30 coastal ones (${inner}/${coastV})`);
  ok(HEXES.every((H) => H.nb.length >= 3 && H.nb.length <= 6) && HEXES[9].nb.length === 6, 'tile neighbours: the centre has 6, the rim 3 or 4');
  // each tile's corners are its 6 nearest corners
  ok(HEXES.every((H) => H.v.every((v) => Math.abs(Math.hypot(VERTS[v].x - H.x, VERTS[v].y - H.y) - 1) < 1e-9)), 'every tile corner is one unit from its centre');
}

// ------------------------------------------------------------ board generation
{
  let bad = [], tries = 0, maxTries = 0;
  const N = 600;
  for (let seed = 1; seed <= N; seed++) {
    const b = M.genBoard(seed);
    tries += b.tries; maxTries = Math.max(maxTries, b.tries);
    const counts = [0, 0, 0, 0, 0, 0];
    b.terr.forEach((t) => counts[t + 1]++);
    if (!same(counts, [1, 4, 3, 4, 4, 3])) bad.push(seed + ' terrain ' + counts);
    const toks = b.num.filter((n, h) => b.terr[h] >= 0).sort((x, y) => x - y);
    if (!same(toks, M.TOKENS)) bad.push(seed + ' tokens');
    if (b.num[b.terr.indexOf(-1)] !== 0) bad.push(seed + ' desert has a number');
    for (let h = 0; h < 19; h++) for (const g of HEXES[h].nb) {
      const x = b.num[h], y = b.num[g];
      if ((x === 6 || x === 8) && (y === 6 || y === 8)) bad.push(seed + ' 6/8 adjacent');
      if (x && x === y) bad.push(seed + ' equal numbers adjacent');
    }
    if (!M.terrainOk(b.terr)) bad.push(seed + ' clump');
    if (b.ports.length !== 9 || !b.ports.every((P) => M.COAST.includes(P.e))) bad.push(seed + ' ports not on coast');
    const pt = b.ports.map((P) => P.r).sort((x, y) => x - y);
    if (!same(pt, [-1, -1, -1, -1, 0, 1, 2, 3, 4])) bad.push(seed + ' port types');
    const pv = b.ports.flatMap((P) => [EDGES[P.e].a, EDGES[P.e].b]);
    if (new Set(pv).size !== 18) bad.push(seed + ' ports share a corner');
    if (b.robber !== b.terr.indexOf(-1)) bad.push(seed + ' bandit not on the dunes');
  }
  ok(bad.length === 0, `${N} random islands: 4 forest, 3 clay, 4 pasture, 4 fields, 3 mountains, 1 dunes; the 18 tokens; no 6/8 or equal numbers side by side; no clump of 3; 9 harbours (4 any, one per resource) on the coast, none sharing a corner` + (bad.length ? ' — ' + bad.slice(0, 4).join('; ') : ''));
  ok(tries / N < 40 && maxTries < 400, `generation is quick: ${(tries / N).toFixed(1)} shuffles on average, ${maxTries} at worst`);
  ok(same(M.genBoard(77), M.genBoard(77)) && !same(M.genBoard(77).terr, M.genBoard(78).terr), 'a seed always gives the same island; different seeds differ');
  const B = M.genBoard(1, true);
  ok(M.terrainOk(B.terr) && M.tokensOk(B.terr, B.num) && same(B, M.genBoard(999, true)), 'the beginner island is fixed and passes the same balance checks');
  // the spread of the dice across resources
  let spreadOk = true;
  for (let seed = 1; seed <= 200; seed++) {
    const b = M.genBoard(seed);
    for (let r = 0; r < 5; r++) { let p = 0, c = 0; for (let h = 0; h < 19; h++) if (b.terr[h] === r) { p += M.PIPS[b.num[h]]; c++; } if (p / c < 2.3 || p / c > 4.3) spreadOk = false; }
  }
  ok(spreadOk, 'every resource gets a fair share of the dice (2.3 to 4.3 pips per tile on average)');
}

// ------------------------------------------------------------ setup and the distance rule
{
  const S = M.newGame({ seed: 5, players: [{ kind: 'human' }, { kind: 'human' }, { kind: 'human' }] });
  ok(same(S.setup.order, [0, 1, 2, 2, 1, 0]), 'setup goes round and back: 0 1 2 2 1 0');
  const v0 = 20;
  ok(M.act(S, { t: 'road', e: VERTS[v0].edges[0] }).ok === false, 'setup: a road cannot come before the village');
  ok(M.act(S, { t: 'village', v: v0 }).ok, 'setup: first village anywhere free');
  ok(M.act(S, { t: 'road', e: M.edgeBetween(VERTS[v0].adj[0], VERTS[VERTS[v0].adj[0]].adj.find((u) => u !== v0)) }).ok === false, 'setup: the road must touch the village just placed');
  ok(M.act(S, { t: 'road', e: VERTS[v0].edges[0] }).ok && S.cur === 1, 'setup: road beside it, then the next player');
  const near = VERTS[v0].adj[1];
  ok(M.act(S, { t: 'village', v: near }).ok === false && M.act(S, { t: 'village', v: v0 }).ok === false, 'distance rule: not on or next to a building');
  ok(!M.legalVillages(S, 1).some((v) => v === v0 || VERTS[v0].adj.includes(v)), 'legal spots exclude the building and its neighbours');
  ok(M.legalVillages(S, 1).length === 54 - 1 - VERTS[v0].adj.length, 'every other corner is open in setup');
  // play out the setup and check the second village pays
  const S2 = M.newGame({ seed: 9, players: [{ kind: 'normal' }, { kind: 'normal' }, { kind: 'normal' }, { kind: 'normal' }] });
  let paidOk = true;
  while (S2.phase === 'setup') {
    const a = M.aiStep(S2), second = S2.setup.i >= 4, p = S2.cur;
    const before = S2.players[p].res.slice();
    M.act(S2, a);
    if (a.t === 'village') {
      const exp = [0, 0, 0, 0, 0];
      if (second) VERTS[a.v].hexes.forEach((h) => { if (S2.board.terr[h] >= 0) exp[S2.board.terr[h]]++; });
      if (!same(S2.players[p].res.map((x, r) => x - before[r]), exp)) paidOk = false;
    }
  }
  ok(paidOk, 'only the second village pays one card per tile around it');
  ok(S2.phase === 'roll' && S2.cur === 0 && S2.turn === 1 && S2.players.every((P) => P.left.village === 3 && P.left.road === 13), 'after setup: two villages and two roads each, player 1 to roll');
  ok(M.sum(S2.bank) + S2.players.reduce((s, P) => s + M.sum(P.res), 0) === 95, 'cards are conserved: 95 in bank and hands');
}

// ------------------------------------------------------------ production on every roll
{
  let bad = 0, rolls = 0;
  for (let trial = 0; trial < 150; trial++) {
    const S = blank(4, 100 + trial);
    const rand = M.mulberry(trial + 1);
    for (let k = 0; k < 9; k++) { const v = Math.floor(rand() * 54); if (S.vOwn[v] < 0) put(S, Math.floor(rand() * 4), v, rand() < 0.4 ? 2 : 1); }
    S.board.robber = Math.floor(rand() * 19);
    for (let n = 2; n <= 12; n++) {
      if (n === 7) continue;
      const T = clone(S); T.phase = 'roll';
      const exp = T.players.map((P) => P.res.slice());
      for (let h = 0; h < 19; h++) if (T.board.num[h] === n && h !== T.board.robber) for (const v of HEXES[h].v) if (T.vOwn[v] >= 0) exp[T.vOwn[v]][T.board.terr[h]] += T.vLvl[v];
      const r = M.act(T, { t: 'roll', dice: [n > 6 ? 6 : 1, n > 6 ? n - 6 : n - 1] });
      rolls++;
      if (!r.ok || !same(T.players.map((P) => P.res), exp) || T.phase !== 'main') bad++;
    }
  }
  ok(bad === 0, `production matches a direct count on ${rolls} rolls (2–12 but 7): 1 per village, 2 per town, nothing from the bandit's tile`);
  // the bandit blocks; a town pays two
  const S = blank(3);
  const h = HEXES.findIndex((H, i) => S.board.num[i] === 8);
  put(S, 0, HEXES[h].v[0], 2); put(S, 1, HEXES[h].v[3], 1);
  const r8 = S.board.terr[h];
  S.phase = 'roll'; S.board.robber = (h + 1) % 19;
  const T = clone(S); M.act(T, { t: 'roll', dice: [4, 4] });
  ok(T.players[0].res[r8] >= 2 && T.players[1].res[r8] >= 1, 'a town takes two cards, a village one');
  S.board.robber = h; M.act(S, { t: 'roll', dice: [4, 4] });
  ok(S.players[0].res[r8] === 0 || HEXES.some((H, i) => i !== h && S.board.num[i] === 8 && S.board.terr[i] === r8 && H.v.some((v) => S.vOwn[v] >= 0)), 'the bandit stops its tile paying');
  // a short bank
  const B = blank(3);
  const t6 = HEXES.findIndex((H, i) => B.board.num[i] === 6), r6 = B.board.terr[t6];
  put(B, 0, HEXES[t6].v[0], 2); put(B, 1, HEXES[t6].v[3], 2);
  B.bank[r6] = 3; B.phase = 'roll'; B.board.robber = B.board.terr.indexOf(-1);
  const other6 = HEXES.findIndex((H, i) => i !== t6 && B.board.num[i] === 6);
  const r6b = B.board.terr[other6];
  M.act(B, { t: 'roll', dice: [3, 3] });
  ok(B.players[0].res[r6] === 0 && B.players[1].res[r6] === 0 && B.bank[r6] === 3 || r6b === r6, 'bank short of a resource owed to two players: nobody gets it');
  const C = blank(3);
  put(C, 0, HEXES[t6].v[0], 2);
  C.bank[r6] = 1; C.phase = 'roll'; C.board.robber = C.board.terr.indexOf(-1);
  M.act(C, { t: 'roll', dice: [3, 3] });
  ok(C.players[0].res[r6] === 1 && C.bank[r6] === 0, 'bank short, only one player owed: they take what is left');
}

// ------------------------------------------------------------ 7s, discards, the bandit
{
  const S = blank(4);
  give(S, 0, [2, 2, 2, 2, 0]); give(S, 1, [3, 3, 3, 0, 0]); give(S, 2, [1, 1, 1, 1, 3]); give(S, 3, [5, 5, 5, 0, 0]);
  S.phase = 'roll';
  M.act(S, { t: 'roll', dice: [3, 4] });
  ok(S.phase === 'discard' && same(S.discard, [4, 4, 0, 7]), 'a 7: 8 cards discard 4, 9 discard 4, 7 keep all, 15 discard 7');
  ok(M.act(S, { t: 'discard', p: 0, cards: [1, 1, 1, 0, 0] }).ok === false, 'discarding the wrong number is refused');
  ok(M.act(S, { t: 'discard', p: 0, cards: [0, 0, 0, 0, 4] }).ok === false, 'discarding cards you do not have is refused');
  ok(M.act(S, { t: 'robber', h: 0, victim: -1 }).ok === false, 'the bandit waits until everyone has discarded');
  M.act(S, { t: 'discard', p: 0, cards: [1, 1, 1, 1, 0] }); M.act(S, { t: 'discard', p: 3, cards: [3, 2, 2, 0, 0] });
  ok(S.phase === 'discard' && M.act(S, { t: 'discard', p: 1, cards: [2, 2, 0, 0, 0] }).ok && S.phase === 'robber', 'any order; when the last one is done, the bandit moves');
  ok(M.handSize(S.players[0]) === 4 && M.handSize(S.players[1]) === 5 && M.handSize(S.players[3]) === 8, 'hands are halved, rounded down');
  ok(M.act(S, { t: 'robber', h: S.board.robber, victim: -1 }).ok === false, 'the bandit must move to another tile');
  const h = 4; put(S, 2, HEXES[h].v[0]); put(S, 3, HEXES[h].v[3]);
  ok(same(M.victimsAt(S, h, 0), [2, 3]), 'victims: every other player with a building on the tile and a card in hand');
  ok(M.act(S, { t: 'robber', h, victim: -1 }).ok === false && M.act(S, { t: 'robber', h, victim: 1 }).ok === false, 'with someone to rob, a victim on the tile must be named');
  const before = M.handSize(S.players[2]) + M.handSize(S.players[0]);
  ok(M.act(S, { t: 'robber', h, victim: 2 }).ok && S.board.robber === h && M.handSize(S.players[0]) === 5 && M.handSize(S.players[2]) + M.handSize(S.players[0]) === before && S.phase === 'main', 'the bandit moves, one random card changes hands, back to the turn');
  // nobody over 7: straight to the bandit; nobody to rob: no victim needed
  const T = blank(3); T.phase = 'roll';
  M.act(T, { t: 'roll', dice: [1, 6] });
  ok(T.phase === 'robber' && T.discard === null, 'a 7 with nobody over 7 cards goes straight to the bandit');
  ok(M.act(T, { t: 'robber', h: 3, victim: -1 }).ok, 'an empty tile needs no victim');
  // friendly bandit
  const F = blank(3); F.friendly = true; F.phase = 'robber'; F.back = 'main';
  put(F, 1, HEXES[5].v[0]); give(F, 1, [1, 0, 0, 0, 0]);
  ok(!M.legalRobberTiles(F, 0).includes(5) && M.victimsAt(F, 5, 0).length === 0, 'friendly bandit: not next to a player on 2 points or fewer');
  put(F, 1, 40); put(F, 1, 44);
  ok(M.legalRobberTiles(F, 0).includes(5), 'friendly bandit: fair game at 3 points');
}

// ------------------------------------------------------------ building: costs and legality
{
  const S = blank(3);
  put(S, 0, 10); const e1 = road(S, 0, 10, VERTS[10].adj[0]);
  give(S, 0, [0, 0, 0, 0, 0]);
  const free = M.legalRoads(S, 0);
  ok(free.length > 0 && free.every((e) => [EDGES[e].a, EDGES[e].b].some((v) => S.vOwn[v] === 0 || VERTS[v].edges.some((f) => f !== e && S.eOwn[f] === 0))), 'roads must join your own building or road');
  ok(M.act(S, { t: 'road', e: free[0] }).ok === false, 'a road costs timber + clay');
  give(S, 0, [1, 1, 0, 0, 0]);
  ok(M.act(S, { t: 'road', e: free[0] }).ok && same(S.players[0].res, [0, 0, 0, 0, 0]) && S.bank[0] === 20 && S.bank[1] === 20, 'road built, timber and clay back to the bank');
  give(S, 0, [5, 5, 5, 5, 5]);
  const far = VERTS.findIndex((V, v) => M.vertexFree(S, v) && !V.edges.some((e) => S.eOwn[e] === 0));
  ok(M.act(S, { t: 'village', v: far }).ok === false, 'a village must touch your road');
  const vs = M.legalVillages(S, 0);
  if (vs.length) ok(M.act(S, { t: 'village', v: vs[0] }).ok && same(S.players[0].res, [4, 4, 4, 4, 5]), 'a village costs timber, clay, wool, grain');
  else {
    // extend until a spot opens up
    let e = M.legalRoads(S, 0)[0]; M.act(S, { t: 'road', e });
    const v2 = M.legalVillages(S, 0)[0];
    ok(v2 !== undefined && M.act(S, { t: 'village', v: v2 }).ok, 'a village costs timber, clay, wool, grain');
  }
  const res = S.players[0].res.slice(), vLeft = S.players[0].left.village;
  ok(M.act(S, { t: 'town', v: 10 }).ok && S.vLvl[10] === 2 && S.players[0].res[3] === res[3] - 2 && S.players[0].res[4] === res[4] - 3, 'a town costs 2 grain + 3 ore and replaces a village');
  ok(S.players[0].left.town === 3 && S.players[0].left.village === vLeft + 1, 'the village piece comes back when a town replaces it');
  ok(M.act(S, { t: 'town', v: 10 }).ok === false, 'a town cannot be built on a town');
  const opp = blank(3); put(opp, 1, 10); give(opp, 0, [0, 0, 0, 5, 5]);
  ok(M.act(opp, { t: 'town', v: 10 }).ok === false, "nor on someone else's village");
  // an opponent's building cuts road building through it
  const R = blank(3);
  const a = 22, b = VERTS[a].adj[0], c = VERTS[b].adj.find((u) => u !== a);
  put(R, 0, a); road(R, 0, a, b); put(R, 1, b);
  const through = M.edgeBetween(b, c);
  ok(!M.legalRoads(R, 0).includes(through), "you cannot build on past another player's village");
  // piece limits
  const L = blank(3); L.players[0].left.road = 0; put(L, 0, 10); give(L, 0, [9, 9, 9, 9, 9]);
  ok(M.legalRoads(L, 0).length === 0 && M.act(L, { t: 'road', e: VERTS[10].edges[0] }).ok === false, '15 roads at most');
  L.players[0].left.village = 0; road(L, 0, 10, VERTS[10].adj[0]);
  ok(M.legalVillages(L, 0).every((v) => M.act(clone(L), { t: 'village', v }).ok === false), '5 villages at most');
  L.players[0].left.town = 0;
  ok(M.act(L, { t: 'town', v: 10 }).ok === false, '4 towns at most');
  // nothing outside the main phase
  const P = blank(3); P.phase = 'roll'; give(P, 0, [9, 9, 9, 9, 9]); put(P, 0, 10);
  ok(M.act(P, { t: 'road', e: VERTS[10].edges[0] }).ok === false && M.act(P, { t: 'buy' }).ok === false && M.act(P, { t: 'end' }).ok === false, 'no building, buying or ending before the roll');
}

// ------------------------------------------------------------ venture cards
{
  const S0 = M.newGame({ seed: 3 });
  const counts = {}; S0.deck.forEach((c) => { counts[c] = (counts[c] || 0) + 1; });
  ok(S0.deck.length === 25 && counts.guard === 14 && counts.roads === 2 && counts.harvest === 2 && counts.market === 2 && counts.landmark === 5, 'the deck: 14 Guard, 2 Road Crew, 2 Good Harvest, 2 Market Day, 5 Landmark');
  const S = blank(3);
  give(S, 0, [0, 0, 1, 1, 1]);
  S.deck.push('guard');
  ok(M.act(S, { t: 'buy' }).ok && same(S.players[0].res, [0, 0, 0, 0, 0]) && S.players[0].cards.length === 1 && S.deck.length === 25, 'a card costs wool, grain, ore');
  ok(M.act(S, { t: 'play', c: 'guard' }).ok === false, 'not on the turn it was bought');
  M.act(S, { t: 'end' }); M.act(S, { t: 'roll', dice: [2, 2] }); M.act(S, { t: 'end' }); M.act(S, { t: 'roll', dice: [2, 2] }); M.act(S, { t: 'end' });
  ok(S.cur === 0 && S.phase === 'roll' && M.playableCards(S, 0).includes('guard'), 'next turn a Guard can be played, even before rolling');
  M.act(S, { t: 'play', c: 'guard' });
  ok(S.phase === 'robber' && S.players[0].guards === 1 && S.cardPlayed, 'Guard: the bandit moves');
  M.act(S, { t: 'robber', h: (S.board.robber + 3) % 19, victim: -1 });
  ok(S.phase === 'roll', 'and then you still roll');
  // one card per turn
  const T = blank(3);
  T.players[0].cards = [{ c: 'harvest', t: 1 }, { c: 'market', t: 1 }, { c: 'roads', t: 1 }];
  ok(M.act(T, { t: 'play', c: 'harvest', r: 4, r2: 4 }).ok && T.players[0].res[4] === 2 && T.bank[4] === 17, 'Good Harvest: any two from the bank');
  ok(M.act(T, { t: 'play', c: 'market', r: 0 }).ok === false, 'one card per turn');
  T.cardPlayed = false;
  give(T, 1, [3, 0, 0, 0, 1]); give(T, 2, [2, 1, 0, 0, 0]);
  ok(M.act(T, { t: 'play', c: 'market', r: 0 }).ok && T.players[0].res[0] === 5 && T.players[1].res[0] === 0 && T.players[2].res[0] === 0 && T.players[1].res[4] === 1, 'Market Day: everyone hands over all of the named resource');
  T.cardPlayed = false; put(T, 0, 10);
  ok(M.act(T, { t: 'play', c: 'roads' }).ok && T.phase === 'roads' && T.freeRoads === 2, 'Road Crew: two free roads');
  const r1 = M.legalRoads(T, 0)[0]; M.act(T, { t: 'road', e: r1 });
  const r2 = M.legalRoads(T, 0)[0]; M.act(T, { t: 'road', e: r2 });
  ok(T.phase === 'main' && T.eOwn[r1] === 0 && T.eOwn[r2] === 0 && same(T.players[0].res.slice(0, 2), [5, 0]), 'both placed without paying, then back to the turn');
  // landmarks: hidden points that count at once
  const V = blank(3); V.target = 10;
  [10, 14, 30, 34].forEach((v) => put(V, 0, v, 2)); // 8 points of towns
  V.players[0].cards = [{ c: 'landmark', t: 1, name: 'Lighthouse' }];
  ok(M.publicVP(V, 0) === 8 && M.totalVP(V, 0) === 9, 'a landmark is hidden from the public score but counts');
  give(V, 0, [0, 0, 1, 1, 1]); V.deck.push('landmark');
  const r = M.act(V, { t: 'buy' });
  ok(r.ok && V.phase === 'over' && V.winner === 0, 'buying the tenth point wins on the spot');
  ok(M.playableCards(blank(3), 0).length === 0, 'landmarks are never played');
}

// ------------------------------------------------------------ Longest Road against brute force
// Brute force: the longest trail is the largest subset of a player's roads that is connected and can be
// walked once each — 0 or 2 odd corners — never passing through a corner with another player's building
// (such a corner may only be an end: degree 1 in an open trail, or the start and end of a closed one).
function bruteRoad(S, p) {
  const mine = []; for (let e = 0; e < EDGES.length; e++) if (S.eOwn[e] === p) mine.push(e);
  let best = 0;
  const n = mine.length;
  for (let mask = 1; mask < (1 << n); mask++) {
    let cnt = 0; for (let i = 0; i < n; i++) if (mask & (1 << i)) cnt++;
    if (cnt <= best) continue;
    const deg = new Map(), es = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) { const E = EDGES[mine[i]]; es.push(E); deg.set(E.a, (deg.get(E.a) || 0) + 1); deg.set(E.b, (deg.get(E.b) || 0) + 1); }
    // connected?
    const seen = new Set([es[0].a]); let grew = true;
    while (grew) { grew = false; for (const E of es) { if (seen.has(E.a) !== seen.has(E.b)) { seen.add(E.a); seen.add(E.b); grew = true; } } }
    if (seen.size !== deg.size) continue;
    let odd = 0; for (const d of deg.values()) if (d % 2) odd++;
    if (odd !== 0 && odd !== 2) continue;
    const blocked = [...deg.keys()].filter((v) => S.vOwn[v] >= 0 && S.vOwn[v] !== p);
    if (odd === 2 && blocked.some((v) => deg.get(v) > 1)) continue;
    if (odd === 0 && (blocked.filter((v) => deg.get(v) === 2).length > 1 || blocked.some((v) => deg.get(v) > 2))) continue;
    best = cnt;
  }
  return best;
}
{
  // hand-built networks
  const ring = (S, p, h) => HEXES[h].v.forEach((v, i) => road(S, p, v, HEXES[h].v[(i + 1) % 6]));
  let S = blank(3);
  const H = HEXES[9].v;
  for (let i = 0; i < 5; i++) road(S, 0, H[i], H[i + 1]);
  ok(M.roadLength(S, 0) === 5 && bruteRoad(S, 0) === 5, 'a straight run of 5');
  put(S, 1, H[2]);
  ok(M.roadLength(S, 0) === 3 && bruteRoad(S, 0) === 3, "another player's village in the middle cuts it to 3 (2 + 3)");
  S = blank(3); ring(S, 0, 9);
  ok(M.roadLength(S, 0) === 6 && bruteRoad(S, 0) === 6, 'a loop round one tile counts all 6');
  const out = VERTS[H[0]].adj.find((u) => !H.includes(u)); road(S, 0, H[0], out);
  ok(M.roadLength(S, 0) === 7 && bruteRoad(S, 0) === 7, 'a loop with a tail: 7');
  S = blank(3); ring(S, 0, 9); ring(S, 0, 10);
  const two = M.roadLength(S, 0);
  ok(two === bruteRoad(S, 0) && two === 11, `two loops sharing a side (11 roads): ${two}`);
  put(S, 1, H[0]);
  ok(M.roadLength(S, 0) === bruteRoad(S, 0), `the same, broken at one corner: ${M.roadLength(S, 0)}`);
  // a Y: three arms of 3, 2, 1 from one corner
  S = blank(3);
  const c = 24, arms = VERTS[c].adj;
  const walk = (from, to, len) => { let prev = from, cur = to; road(S, 0, prev, cur); for (let i = 1; i < len; i++) { const nx = VERTS[cur].adj.find((u) => u !== prev && S.eOwn[M.edgeBetween(cur, u)] < 0 && !VERTS[u].edges.some((e) => S.eOwn[e] >= 0)); if (nx === undefined) break; road(S, 0, cur, nx); prev = cur; cur = nx; } };
  walk(c, arms[0], 3); walk(c, arms[1], 2); if (arms[2] !== undefined) walk(c, arms[2], 1);
  ok(M.roadLength(S, 0) === bruteRoad(S, 0) && M.roadLength(S, 0) === 5, `a fork counts only its two longest arms: ${M.roadLength(S, 0)}`);
  // random networks, some broken by opponents
  let bad = 0, maxSeen = 0;
  const rand = M.mulberry(4321);
  for (let trial = 0; trial < 400; trial++) {
    const T = blank(3);
    const size = 3 + Math.floor(rand() * 11);
    let v = Math.floor(rand() * 54);
    const verts = [v];
    let guard = 0;
    for (let k = 0; k < size && guard < 200; guard++) {
      const from = verts[Math.floor(rand() * verts.length)];
      const e = VERTS[from].edges[Math.floor(rand() * VERTS[from].edges.length)];
      if (T.eOwn[e] >= 0) continue;
      T.eOwn[e] = 0; k++;
      const o = M.otherEnd(e, from); if (!verts.includes(o)) verts.push(o);
    }
    if (rand() < 0.3) { const e = Math.floor(rand() * 72); if (T.eOwn[e] < 0) T.eOwn[e] = 0; } // a stray road elsewhere
    const blocks = Math.floor(rand() * 3);
    for (let k = 0; k < blocks; k++) put(T, 1 + (k % 2), verts[Math.floor(rand() * verts.length)]);
    if (rand() < 0.3) put(T, 0, verts[0]);
    const a = M.roadLength(T, 0), b = bruteRoad(T, 0);
    if (a !== b) { bad++; if (bad < 3) console.log('     mismatch', a, b); }
    maxSeen = Math.max(maxSeen, a);
  }
  ok(bad === 0, `400 random networks (loops, forks, strays, opponents' villages): search equals brute force (longest ${maxSeen})`);
  // the award
  const A = blank(3);
  // a long walk round the coast
  const path = [EDGES[M.COAST[0]].a, EDGES[M.COAST[0]].b];
  if (!M.COAST.slice(1).some((e) => EDGES[e].a === path[1] || EDGES[e].b === path[1])) path.reverse();
  while (path.length < 12) { const last = path[path.length - 1]; const e = M.COAST.find((f) => (EDGES[f].a === last || EDGES[f].b === last) && !path.includes(M.otherEnd(f, last))); path.push(M.otherEnd(e, last)); }
  for (let i = 0; i < 4; i++) road(A, 0, path[i], path[i + 1]);
  M.updateLongest(A);
  ok(A.longest === -1, '4 roads: no award');
  road(A, 0, path[4], path[5]); M.updateLongest(A);
  ok(A.longest === 0 && M.publicVP(A, 0) === 2, '5 roads: the Longest Road, 2 points');
  // player 1 builds a separate 5: a tie does not take it
  const Q = HEXES[18].v; for (let i = 0; i < 5; i++) road(A, 1, Q[i], Q[i + 1]); M.updateLongest(A);
  ok(A.longest === 0, 'a tie leaves it with the holder');
  road(A, 1, Q[5], Q[0]); M.updateLongest(A);
  ok(A.longest === 1, 'a longer road takes it');
  // break player 1's ring at two places: back to player 0
  put(A, 2, Q[1]); put(A, 2, Q[4]); M.updateLongest(A);
  ok(A.longest === 0, "broken by another player's villages, it goes back to the longest remaining (" + A.roadLen.join(',') + ')');
  // a tie among the others when the holder loses it: nobody
  const B = blank(3);
  for (let i = 0; i < 5; i++) road(B, 0, path[i], path[i + 1]);
  for (let i = 0; i < 5; i++) road(B, 1, Q[i], Q[i + 1]);
  B.longest = 2; for (let i = 0; i < 3; i++) road(B, 2, HEXES[9].v[i], HEXES[9].v[i + 1]);
  M.updateLongest(B);
  ok(B.longest === -1, 'holder drops below and two others tie: nobody holds it');
  // building a village through someone's road via the game action updates the award
  const C = blank(3);
  const k = [0, 1, 2].find((i) => VERTS[path[i + 3]].adj.length === 3), cp = path.slice(k, k + 7);
  for (let i = 0; i < 6; i++) road(C, 0, cp[i], cp[i + 1]);
  M.updateLongest(C); ok(C.longest === 0, '6 roads hold it');
  road(C, 1, cp[3], VERTS[cp[3]].adj.find((u) => u !== cp[2] && u !== cp[4]));
  C.cur = 1; give(C, 1, [1, 1, 1, 1, 0]);
  const r = M.act(C, { t: 'village', v: cp[3] });
  ok(r.ok && C.longest === -1 && r.ev.some((e) => e.e === 'award' && e.what === 'road' && e.p === -1), 'a village dropped into the middle breaks it (3 + 3), and the award is lost');
}

// ------------------------------------------------------------ Strongest Guard
{
  const S = blank(3);
  const playGuard = (p) => { S.cur = p; S.cardPlayed = false; S.phase = 'main'; S.players[p].cards.push({ c: 'guard', t: 0 }); M.act(S, { t: 'play', c: 'guard' }); M.act(S, { t: 'robber', h: (S.board.robber + 1) % 19, victim: M.victimsAt(S, (S.board.robber + 1) % 19, p)[0] ?? -1 }); };
  playGuard(0); playGuard(0);
  ok(S.army === -1, '2 Guards: no award');
  playGuard(0);
  ok(S.army === 0 && M.publicVP(S, 0) === 2, '3 Guards: the Strongest Guard, 2 points');
  playGuard(1); playGuard(1); playGuard(1);
  ok(S.army === 0, 'a tie does not take it');
  playGuard(1);
  ok(S.army === 1 && M.publicVP(S, 0) === 0 && M.publicVP(S, 1) === 2, 'more Guards take it');
}

// ------------------------------------------------------------ harbours, the bank, trades
{
  const S = blank(3);
  ok([0, 1, 2, 3, 4].every((r) => M.bankRate(S, 0, r) === 4), 'no harbour: 4 for 1');
  const any = S.board.ports.find((P) => P.r < 0), spec = S.board.ports.find((P) => P.r === 2);
  put(S, 0, EDGES[any.e].a);
  ok([0, 1, 2, 3, 4].every((r) => M.bankRate(S, 0, r) === 3), 'a 3:1 harbour: 3 for 1, any resource');
  put(S, 0, EDGES[spec.e].b);
  ok(M.bankRate(S, 0, 2) === 2 && M.bankRate(S, 0, 0) === 3, 'a wool harbour: 2 wool for 1, others still 3');
  ok(M.bankRate(S, 1, 2) === 4, "someone else's harbour does nothing for you");
  give(S, 0, [0, 0, 2, 0, 0]);
  ok(M.act(S, { t: 'bank', give: 2, get: 4 }).ok && same(S.players[0].res, [0, 0, 0, 0, 1]), 'bank trade at the harbour rate');
  ok(M.act(S, { t: 'bank', give: 4, get: 0 }).ok === false, 'not enough to trade: refused');
  give(S, 0, [3, 0, 0, 0, 0]); S.bank[1] = 0;
  ok(M.act(S, { t: 'bank', give: 0, get: 1 }).ok === false, 'the bank cannot give what it has run out of');
  give(S, 0, [1, 0, 2, 0, 0]); give(S, 1, [0, 0, 0, 3, 1]);
  ok(M.act(S, { t: 'trade', with: 1, give: [1, 0, 1, 0, 0], get: [0, 0, 0, 2, 0] }).ok && same(S.players[0].res, [0, 0, 1, 2, 0]) && same(S.players[1].res, [1, 0, 1, 1, 1]), 'a trade between players swaps exactly the cards offered');
  ok(M.act(S, { t: 'trade', with: 1, give: [0, 0, 1, 0, 0], get: [0, 0, 0, 0, 0] }).ok === false, 'no gifts: both sides must give something');
  ok(M.act(S, { t: 'trade', with: 1, give: [0, 0, 1, 0, 0], get: [0, 0, 1, 0, 0] }).ok === false, 'no like-for-like');
  ok(M.act(S, { t: 'trade', with: 1, give: [0, 0, 1, 0, 0], get: [0, 0, 0, 0, 5] }).ok === false, 'nobody can give what they do not have');
  ok(M.act(S, { t: 'trade', with: 0, give: [0, 0, 1, 0, 0], get: [1, 0, 0, 0, 0] }).ok === false, 'not with yourself');
}

// ------------------------------------------------------------ winning
{
  const S = blank(3);
  [10, 14, 30, 34].forEach((v) => put(S, 0, v, 2)); put(S, 0, 50);
  ok(M.totalVP(S, 0) === 9 && S.phase === 'main', '9 points: not yet');
  let spot = -1;
  for (const a of VERTS[50].adj) for (const b of VERTS[a].adj) if (spot < 0 && b !== 50 && M.vertexFree(S, b)) { road(S, 0, 50, a); road(S, 0, a, b); spot = b; }
  give(S, 0, [1, 1, 1, 1, 0]);
  ok(M.act(S, { t: 'village', v: spot }).ok && S.phase === 'over' && S.winner === 0, 'the tenth point wins at once, on your own turn');
  ok(M.act(S, { t: 'end' }).ok === false, 'nothing more after the win');
  const E = blank(3); E.target = 8; [10, 14, 30].forEach((v) => put(E, 0, v, 2)); put(E, 0, 50);
  give(E, 0, [0, 0, 0, 2, 3]);
  ok(M.act(E, { t: 'town', v: 50 }).ok && E.phase === 'over', 'the short game ends at 8');
  const tg = (n, target) => M.newGame({ seed: 3, players: Array.from({ length: n }, () => ({ kind: 'human' })), target }).target;
  ok(tg(2) === 8 && tg(3) === 10 && tg(4) === 10, 'unless told otherwise, two players play to 8 and three or four to 10');
  ok(tg(2, 10) === 10 && tg(4, 8) === 8 && tg(3, 9) === 10, 'and either table can choose 8 or 10 (nothing else)');
}

// ------------------------------------------------------------ save and resume
{
  const S = M.newGame({ seed: 31, players: [{ kind: 'human' }, { kind: 'hard' }, { kind: 'normal' }] });
  for (let i = 0; i < 400 && S.phase !== 'over'; i++) { const a = M.aiStep(S); if (a.t === 'offer') { S.tc.offers++; continue; } M.act(S, a); }
  const text = M.serialize(S), R = M.deserialize(text);
  ok(R && M.serialize(R) === text, 'a game in progress saves and loads unchanged');
  // the resumed game rolls the same dice as the original would have
  const A = M.deserialize(text), B = M.deserialize(text);
  for (let i = 0; i < 200 && A.phase !== 'over'; i++) { const a = M.aiStep(A); if (a.t === 'offer') { A.tc.offers++; B.tc.offers++; continue; } M.act(A, a); M.act(B, M.aiStep(B)); }
  ok(M.serialize(A) === M.serialize(B), 'and plays on identically: the dice are seeded in the state');
  const bad = ['', 'null', '{', '[]', '{"v":0}', JSON.stringify(Object.assign(JSON.parse(text), { v: 999 })), JSON.stringify(Object.assign(JSON.parse(text), { vOwn: [1, 2] })),
    JSON.stringify(Object.assign(JSON.parse(text), { players: [] })), JSON.stringify(Object.assign(JSON.parse(text), { phase: 'dancing' })), JSON.stringify(Object.assign(JSON.parse(text), { board: null }))];
  ok(bad.every((t) => M.deserialize(t) === null), 'garbage, an old version or a damaged save loads as nothing (a fresh game), never a crash');
}

// ------------------------------------------------------------ the computer players
{
  // legality: every AI move in many games is accepted by the rules (simulate throws otherwise)
  let games = 0, threw = 0, capped = 0, maxTurn = 0;
  const line = [['easy', 'easy', 'easy'], ['normal', 'normal', 'normal', 'normal'], ['hard', 'normal', 'easy', 'hard'], ['hard', 'hard'], ['easy', 'hard']];
  for (const kinds of line) for (let seed = 1; seed <= 24; seed++) {
    games++;
    try { const S = M.simulate(500 + seed, kinds, { beginner: seed % 4 === 0, target: seed % 5 === 0 ? 8 : 10 }); if (S.endReason) capped++; maxTurn = Math.max(maxTurn, S.turn); } catch (e) { threw++; if (threw < 3) console.log('     ' + e.message); }
  }
  ok(threw === 0, `${games} computer games (2–4 players, every level, both islands): no illegal move`);
  ok(capped === 0, `all of them finished before the turn cap (longest ${maxTurn} turns)`);
  // answers to trade offers are always well-formed and affordable
  let badAns = 0, counters = 0, asked = 0;
  for (let seed = 1; seed <= 30; seed++) {
    M.simulate(800 + seed, ['hard', 'normal', 'easy'], { onAct: (S) => {
      if (S.phase !== 'main') return;
      const p = S.cur, rand = M.mulberry(S.turn * 7 + seed);
      for (let q = 0; q < 3; q++) {
        if (q === p) continue;
        const g = [0, 0, 0, 0, 0], w = [0, 0, 0, 0, 0];
        const a = Math.floor(rand() * 5); let b = Math.floor(rand() * 5); if (b === a) b = (a + 1) % 5;
        g[a] = 1 + Math.floor(rand() * 2); w[b] = 1;
        asked++;
        const ans = M.aiRespond(S, q, p, g, w);
        if (ans === 'accept') { if (!M.hasAll(S.players[q].res, w)) badAns++; }
        else if (ans !== 'reject') { counters++; if (!M.validOffer(ans.give, ans.get) || !M.hasAll(S.players[q].res, ans.get)) badAns++; }
      }
    } });
  }
  ok(badAns === 0 && counters > 0, `${asked} random offers to computers: every acceptance affordable, every one of ${counters} counters a valid trade they can pay`);
  // never feed the leader
  const S = blank(3); S.players[1].kind = 'hard'; S.players[2].kind = 'normal';
  [10, 14, 30, 34].forEach((v) => put(S, 0, v, 2)); // 8 public points
  give(S, 1, [3, 3, 3, 3, 3]); give(S, 2, [3, 3, 3, 3, 3]); give(S, 0, [5, 5, 5, 5, 5]);
  ok(M.aiRespond(S, 1, 0, [3, 0, 0, 0, 0], [0, 0, 0, 0, 1]) === 'reject' && M.aiRespond(S, 2, 0, [4, 0, 0, 0, 0], [0, 0, 0, 0, 1]) === 'reject', 'computers will not trade with a player two points from winning, however generous');
  const T = blank(3); T.players[1].kind = 'normal';
  give(T, 1, [3, 0, 0, 0, 0]); give(T, 0, [0, 0, 0, 2, 0]);
  T.players[1].left.village = 5; put(T, 1, 20); road(T, 1, 20, VERTS[20].adj[0]);
  ok(M.aiRespond(T, 1, 0, [0, 0, 0, 2, 0], [1, 0, 0, 0, 0]) === 'accept', 'but a fair deal with a trailing player is taken');
  // robber goes for the leader's best tile, never the computer's own
  const R = blank(3); R.players[0].kind = 'hard'; R.board.robber = R.board.terr.indexOf(-1);
  const best = HEXES.map((H, h) => h).filter((h) => R.board.terr[h] >= 0).sort((a, b) => M.PIPS[R.board.num[b]] - M.PIPS[R.board.num[a]]);
  put(R, 1, HEXES[best[0]].v[0], 2); put(R, 1, HEXES[best[5]].v[0]); put(R, 1, 6); put(R, 1, 46); give(R, 1, [1, 0, 0, 0, 0]);
  put(R, 2, HEXES[best[1]].v[3]); give(R, 2, [1, 0, 0, 0, 0]);
  put(R, 0, HEXES[best[2]].v[0]);
  const rob = M.aiRobber(R, 0);
  ok(!HEXES[rob.h].v.some((v) => R.vOwn[v] === 0) && HEXES[rob.h].v.some((v) => R.vOwn[v] === 1) && rob.victim === 1, 'Hard sends the bandit to the leader, not to its own tile');
  // discards keep what the plan needs
  const D = blank(3); D.players[0].kind = 'normal'; give(D, 0, [0, 0, 0, 2, 8]); put(D, 0, 10);
  const dis = M.aiDiscard(D, 0, 5);
  ok(M.sum(dis) === 5 && dis[3] === 0 && dis[4] === 5, 'a computer discarding 5 of 2 grain + 8 ore keeps the grain and 3 ore for a town');
}

// ------------------------------------------------------------ the page
{
  const tetris = fs.readFileSync(path.join(__dirname, '..', '..', 'tetris', 'index.html'), 'utf8');
  const backBlock = (s) => { const a = s.lastIndexOf('<style>', s.indexOf('/* dgames: the way back')); const e = s.indexOf('</a>', s.indexOf('<a class="dg-home"')); return s.slice(a, e + 4); };
  ok(backBlock(html) === backBlock(tetris) && backBlock(html).length > 800, 'back button is byte-identical to tetris (' + backBlock(html).length + ' bytes)');
  ok(/\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/.test(html), '[hidden] wins over author display rules');
  ok(!/Math\.random/.test(src), 'the rules never call Math.random: dice and shuffles come from the seeded stream');
  ok(!/catan|settlers/i.test(html.replace(/<!--[\s\S]*?-->/g, '')), 'no trademarked names in the page');
}

console.log(`\n${checks - failures}/${checks} passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failures ? 1 : 0);
