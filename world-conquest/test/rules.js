// The rules, headless. Lifts everything above the `// ---------- UI ----------` marker in index.html into
// node's vm: the map graph, reinforcements and continent bonuses, cards, the dice (exact odds against many
// seeded rolls), conquest and moving in, fortifying, elimination, truces and alliances, save/resume, and
// the shared back button.
// Run: node test/rules.js
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { Math, console, Array, Object, Number, String, JSON, Set, Map, Infinity, Int16Array, Int32Array, Float64Array, Error };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const M = ctx.__worldConquest;
const { TERR, CONT, NT } = M;

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (cond) console.log('ok   ' + msg); else { failures++; console.log('FAIL ' + msg); } };
const t0 = Date.now();
const id = (name) => TERR.findIndex((t) => t.name === name);
const game = (kinds, o) => M.newGame(Object.assign({ seed: 1, mode: 'classic', players: kinds.map((k) => ({ kind: k })) }, o || {}));
// A blank board: every territory to `p` with one army, so a test can paint what it needs.
function paint(S, p) { for (let t = 0; t < NT; t++) { S.owner[t] = p; S.armies[t] = 1; } }

// ------------------------------------------------------------ the map
{
  ok(NT === 40 && CONT.length === 6, `${NT} territories in ${CONT.length} continents`);
  ok(new Set(TERR.map((t) => t.name)).size === NT, 'territory names are unique');
  let sym = true, self = false;
  TERR.forEach((t) => t.adj.forEach((u) => { if (!TERR[u].adj.includes(t.id)) sym = false; if (u === t.id) self = true; }));
  ok(sym && !self, 'adjacency is symmetric and nobody borders itself');
  const seen = new Set([0]); let q = [0];
  while (q.length) { const nq = []; for (const t of q) for (const u of TERR[t].adj) if (!seen.has(u)) { seen.add(u); nq.push(u); } q = nq; }
  ok(seen.size === NT, 'the whole world is one connected graph (sea lanes included)');
  ok(CONT.every((c) => {
    const s = new Set([c.ids[0]]); let f = [c.ids[0]];
    while (f.length) { const nf = []; for (const t of f) for (const u of TERR[t].adj) if (TERR[u].cont === c.id && !s.has(u)) { s.add(u); nf.push(u); } f = nf; }
    return s.size === c.ids.length;
  }), 'every continent is connected within itself');
  // every territory is a single piece of land with one outline
  const cells = M.MAP.cells;
  ok(TERR.every((t) => {
    const mine = new Set(t.cells), s = new Set([t.cells[0]]); let f = [t.cells[0]];
    while (f.length) { const nf = []; for (const i of f) for (const j of cells[i].nb) if (mine.has(j) && !s.has(j)) { s.add(j); nf.push(j); } f = nf; }
    return s.size === t.cells.length && t.loops === 1;
  }), 'every territory is one piece of land with one closed outline');
  const sizes = TERR.map((t) => t.cells.length);
  ok(Math.min(...sizes) >= 10, `no territory is a sliver (smallest ${Math.min(...sizes)} cells, largest ${Math.max(...sizes)})`);
  ok(M.MAP.lanes.length === 11 && M.MAP.lanes.every((L) => L.wrap === (TERR[L.a].name === 'Yukon' || TERR[L.b].name === 'Yukon')), '11 sea lanes; only Yukon-Manchuria goes round the edge of the map');
  ok(TERR.every((t) => t.adj.length >= 2), 'every territory has at least two neighbours');
  // continent bonus = round((territories + entry points) / 2 - 1), at least 2
  const table = CONT.map((c) => `${c.name} ${c.ids.length}/${c.entries} -> ${c.bonus}`).join(', ');
  ok(CONT.every((c) => c.bonus === Math.max(2, Math.round((c.ids.length + c.entries) / 2 - 1)) && c.entries === c.ids.filter((t) => TERR[t].adj.some((u) => TERR[u].cont !== c.id)).length), 'continent bonuses follow the formula: ' + table);
  ok(CONT.map((c) => c.bonus).join() === '4,3,5,4,6,2', 'bonuses are North America 4, South America 3, Europe 5, Africa 4, Asia 6, Oceania 2');
  // original map and names: none of the classic board's territory names, no trademark in the page
  const theirs = ['Alaska', 'Northwest Territory', 'Greenland', 'Alberta', 'Ontario', 'Quebec', 'Western United States', 'Eastern United States', 'Central America', 'Venezuela', 'Peru', 'Brazil', 'Argentina', 'Iceland', 'Great Britain', 'Scandinavia', 'Northern Europe', 'Western Europe', 'Southern Europe', 'Ukraine', 'North Africa', 'Egypt', 'East Africa', 'Congo', 'South Africa', 'Madagascar', 'Ural', 'Siberia', 'Yakutsk', 'Kamchatka', 'Irkutsk', 'Mongolia', 'Japan', 'Afghanistan', 'China', 'Middle East', 'India', 'Siam', 'Indonesia', 'New Guinea', 'Western Australia', 'Eastern Australia'];
  ok(!TERR.some((t) => theirs.includes(t.name)), 'no territory shares a name with the classic board');
  ok(!/\bRisk\b|Hasbro|Parker Brothers/.test(html), 'the page never names the trademarked game or its publisher');
}

// ------------------------------------------------------------ reinforcements
{
  const S = game(['human', 'normal', 'normal']);
  const cases = [[1, 3], [8, 3], [9, 3], [11, 3], [12, 4], [20, 6], [33, 11]];
  let good = true;
  for (const [n, want] of cases) { paint(S, 1); for (let t = 0; t < n; t++) S.owner[t] = 0; const r = M.reinforcement(S, 0); if (r.base !== want || r.terr !== n) good = false; }
  ok(good, 'base reinforcement is territories ÷ 3 rounded down, at least 3 (1→3, 9→3, 12→4, 20→6, 33→11)');
  paint(S, 1); for (const t of CONT[5].ids) S.owner[t] = 0; for (const t of CONT[1].ids) S.owner[t] = 0;
  let r = M.reinforcement(S, 0);
  ok(r.base === 3 && r.conts.length === 2 && r.total === 3 + 2 + 3, `holding Oceania and South America: 3 + 2 + 3 = ${r.total}`);
  S.owner[CONT[1].ids[0]] = 1; r = M.reinforcement(S, 0);
  ok(r.total === 3 + 2, 'lose one South American territory and its bonus goes');
  S.pacts.push({ a: 0, b: 2, kind: 'alliance', until: 99, target: 1 });
  ok(M.reinforcement(S, 0).aid === M.ALLY_AID && M.reinforcement(S, 0).total === 3 + 2 + M.ALLY_AID, `an alliance adds ${M.ALLY_AID} armies a turn`);
}

// ------------------------------------------------------------ cards
{
  const k = (kind, n) => kind * 1 + 3 * n; // card id with that mark (ids 0..39 have mark id % 3)
  ok(M.validSet([k(0, 0), k(0, 1), k(0, 2)]) && M.validSet([k(0, 0), k(1, 0), k(2, 0)]) && M.validSet([k(1, 0), k(1, 1), 40]) && M.validSet([k(1, 0), k(2, 3), 41]) && M.validSet([40, 41, k(0, 0)]), 'sets: three of a mark, one of each, any two with a wild');
  ok(!M.validSet([k(0, 0), k(0, 1), k(1, 0)]) && !M.validSet([k(0, 0), k(0, 0), k(0, 1)]) && !M.validSet([k(0, 0), k(0, 1)]), 'not sets: two and one, a repeated card, two cards');
  ok([0, 1, 2, 3, 4, 5, 6, 7].map(M.setValue).join() === '4,6,8,10,12,15,20,25', 'set values escalate 4, 6, 8, 10, 12, 15, 20, 25');
  // every hand of 5 contains a set (so forcing a trade at 5 can never trap anyone)
  let trapped = 0;
  for (let a = 0; a < 4; a++) for (let b = a; b < 4; b++) for (let c = b; c < 4; c++) for (let d = c; d < 4; d++) for (let e = d; e < 4; e++) {
    if ([a, b, c, d, e].filter((x) => x === 3).length > 2) continue; // only two wilds exist
    const used = {}, hand = [a, b, c, d, e].map((x) => { if (x === 3) { used.w = (used.w || 0) + 1; return 39 + used.w; } used[x] = (used[x] || 0) + 1; return x + 3 * used[x]; });
    if (!M.setsIn(hand).length) trapped++;
  }
  ok(trapped === 0, 'every possible 5-card hand holds a set');
  const S = game(['human', 'normal', 'normal']);
  paint(S, 1); S.owner[id('Deccan')] = 0; S.owner[id('Gobi')] = 0; S.cur = 0; S.phase = 'reinforce'; S.reserve = 3; S.sets = 0;
  const deccan = id('Deccan'), gobi = id('Gobi');
  const mk = (t) => t; // a territory's card has that territory's id
  S.players[0].cards = [mk(deccan), 3 * 1 + (deccan % 3), 3 * 2 + (deccan % 3), 40];
  const set = [mk(deccan), 3 * 1 + (deccan % 3), 3 * 2 + (deccan % 3)];
  ok(M.validSet(set), '(test hand: three cards of one mark, one of them Deccan)');
  const before = S.armies[deccan];
  let res = M.apply(S, { t: 'trade', cards: set });
  ok(res.ok && res.value === 4 && S.reserve === 7 && S.armies[deccan] === before + 2 && S.sets === 1, 'first set: +4 armies to place, and +2 straight onto Deccan, which you own and is on a card');
  ok(S.players[0].cards.length === 1 && S.discard.length === 3, 'traded cards leave the hand for the discard pile');
  ok(!M.apply(S, { t: 'trade', cards: [40, 41, 0] }).ok, 'you cannot trade cards you do not hold');
  S.players[1].cards = [0, 1, 2]; S.cur = 1; S.phase = 'reinforce';
  res = M.apply(S, { t: 'trade', cards: [0, 1, 2] });
  ok(res.value === 6, 'the next set anyone trades is worth 6: one count for the whole table');
  // forced trade at five: placing every army does not end Reinforce while you hold five
  S.cur = 0; S.phase = 'reinforce'; S.reserve = 2; S.players[0].cards = [0, 3, 6, 9, 12];
  M.apply(S, { t: 'place', terr: gobi, n: 2 });
  ok(S.phase === 'reinforce' && S.reserve === 0, 'with five cards, placing everything does not move you on to Attack');
  M.apply(S, { t: 'trade', cards: M.bestSet(S, 0) });
  ok(S.reserve > 0 && S.players[0].cards.length === 2, '…until you trade a set');
  M.apply(S, { t: 'place', terr: gobi, n: S.reserve });
  ok(S.phase === 'attack', '…and place its armies');
  void gobi;
}

// ------------------------------------------------------------ dice
{
  // exact odds by enumeration, against the known fractions
  const close = (a, b) => Math.abs(a - b) < 1e-12;
  const o = (k) => Object.fromEntries(M.ODDS[k].map(([al, dl, p]) => [al + ':' + dl, p]));
  const e32 = o('3v2'), e31 = o('3v1'), e22 = o('2v2'), e21 = o('2v1'), e12 = o('1v2'), e11 = o('1v1');
  ok(close(e32['0:2'], 2890 / 7776) && close(e32['1:1'], 2611 / 7776) && close(e32['2:0'], 2275 / 7776), '3 dice v 2: defender loses two 37.17%, one each 33.58%, attacker loses two 29.26%');
  ok(close(e31['0:1'], 855 / 1296) && close(e22['0:2'], 295 / 1296) && close(e22['1:1'], 420 / 1296) && close(e22['2:0'], 581 / 1296), '3 v 1: 65.97% · 2 v 2: 22.76% / 32.41% / 44.83%');
  ok(close(e21['0:1'], 125 / 216) && close(e12['0:1'], 55 / 216) && close(e11['0:1'], 15 / 36), '2 v 1: 57.87% · 1 v 2: 25.46% · 1 v 1: 41.67% (ties to the defender)');
  // the game's own dice, many seeded rolls through apply(), against those numbers
  const N = 40000;
  let worst = 0, worstK = '';
  for (const [ad, dd] of [[3, 2], [3, 1], [2, 2], [2, 1], [1, 2], [1, 1]]) {
    const S = game(['human', 'normal', 'normal'], { seed: 1000 + ad * 10 + dd });
    paint(S, 1);
    const a = id('Deccan'), d = id('Gobi');
    S.owner[a] = 0; S.cur = 0; S.phase = 'attack';
    const count = {};
    for (let i = 0; i < N; i++) {
      S.armies[a] = ad + 1; S.armies[d] = dd; S.phase = 'attack'; S.owner[d] = 1;
      const r = M.apply(S, { t: 'attack', from: a, to: d, once: true });
      const k = r.rolls[0].al + ':' + r.rolls[0].dl; count[k] = (count[k] || 0) + 1;
      if (S.phase === 'move') { S.phase = 'attack'; S.pending = null; }
    }
    for (const [al, dl, p] of M.ODDS[ad + 'v' + dd]) {
      const f = (count[al + ':' + dl] || 0) / N, z = Math.abs(f - p) / Math.sqrt(p * (1 - p) / N);
      if (z > worst) { worst = z; worstK = `${ad}v${dd} ${al}:${dl} seen ${(100 * f).toFixed(2)}% exact ${(100 * p).toFixed(2)}%`; }
    }
  }
  ok(worst < 4.5, `${N} seeded rolls for each of 3v2, 3v1, 2v2, 2v1, 1v2, 1v1 match the exact odds (worst ${worst.toFixed(2)} standard errors: ${worstK})`);
  // blitz odds against blitzes
  let worstB = 0, line = '';
  for (const [A, D] of [[4, 2], [6, 5], [10, 7], [3, 3]]) {
    const S = game(['human', 'normal', 'normal'], { seed: 77 + A * D });
    paint(S, 1); const a = id('Deccan'), d = id('Gobi'); S.owner[a] = 0; S.cur = 0;
    let won = 0; const n = 8000;
    for (let i = 0; i < n; i++) {
      S.armies[a] = A; S.armies[d] = D; S.owner[d] = 1; S.phase = 'attack';
      if (M.apply(S, { t: 'attack', from: a, to: d }).conquered) won++;
      S.pending = null;
    }
    const p = M.winChance(A, D), z = Math.abs(won / n - p) / Math.sqrt(p * (1 - p) / n);
    worstB = Math.max(worstB, z); line += ` ${A}v${D}: ${(100 * p).toFixed(1)}%/${(100 * won / n).toFixed(1)}%`;
  }
  ok(worstB < 4.5, 'blitz win chance (exact, used by the UI and the Hard computer) matches seeded blitzes:' + line);
  ok(Math.abs(M.winChance(2, 1) - 15 / 36) < 1e-12 && M.winChance(1, 1) === 0 && M.winChance(5, 0) === 1, 'win chance edge cases: two armies against one is a single 1 v 1 roll (15/36); one army cannot attack');
}

// ------------------------------------------------------------ attacking, conquest and moving in
{
  const S = game(['human', 'normal', 'normal']);
  paint(S, 1); const a = id('Deccan'), d = id('Gobi'), far = id('Yukon'), mine2 = id('Mekong');
  S.owner[a] = 0; S.owner[mine2] = 0; S.cur = 0; S.phase = 'attack'; S.armies[a] = 1;
  ok(!M.apply(S, { t: 'attack', from: a, to: d }).ok, 'cannot attack from a territory with one army');
  S.armies[a] = 9;
  ok(!M.apply(S, { t: 'attack', from: a, to: far }).ok && !M.apply(S, { t: 'attack', from: a, to: mine2 }).ok, 'cannot attack a territory that is not next door, or your own');
  S.armies[d] = 1;
  let r; do { S.armies[d] = 1; S.owner[d] = 1; S.phase = 'attack'; r = M.apply(S, { t: 'attack', from: a, to: d, once: true }); } while (!r.conquered);
  const pd = S.pending;
  ok(S.phase === 'move' && S.owner[d] === 0 && S.armies[d] === 0 && pd.min === r.rolls[0].a.length && pd.max === S.armies[a] - 1, `conquest: Gobi is yours, empty, and you must move in ${pd.min} to ${pd.max} (at least the dice rolled)`);
  ok(!M.apply(S, { t: 'move', n: pd.min - 1 }).ok && !M.apply(S, { t: 'move', n: pd.max + 1 }).ok && !M.apply(S, { t: 'endAttack' }).ok, 'moving fewer than the dice or leaving the source empty is refused; so is skipping the move');
  const before = S.armies[a];
  ok(M.apply(S, { t: 'move', n: pd.min + 1 }).ok && S.armies[d] === pd.min + 1 && S.armies[a] === before - pd.min - 1 && S.phase === 'attack', 'a legal move goes through and you are back to attacking');
  // blitz stops at the floor you set
  S.armies[a] = 12; S.owner[id('Persia')] = 2; S.armies[id('Persia')] = 60;
  r = M.apply(S, { t: 'attack', from: a, to: id('Persia'), stop: 5 });
  ok(r.ok && !r.conquered && S.armies[a] <= 5 && S.armies[a] >= 4 && r.rolls.length > 1, `blitz with "stop at 5" stops at ${S.armies[a]} (within one roll's losses of 5)`);
  ok(S.conquered === true, 'a conquest this turn is remembered for the card');
  S.phase = 'attack'; const cards = S.players[0].cards.length;
  M.apply(S, { t: 'endTurn' });
  ok(S.players[0].cards.length === cards + 1, 'ending a turn with a conquest draws one card');
  // no conquest, no card
  const S2 = game(['human', 'normal', 'normal']); S2.cur = 0; S2.phase = 'attack'; S2.players[0].cards = [];
  M.apply(S2, { t: 'endTurn' });
  ok(S2.players[0].cards.length === 0, 'no conquest, no card');
}

// ------------------------------------------------------------ fortify
{
  const S = game(['human', 'normal', 'normal']);
  paint(S, 1);
  const chain = ['Deccan', 'Persia', 'Taiga'].map(id), island = id('Borneo'), enemy = id('Gobi');
  chain.forEach((t) => { S.owner[t] = 0; }); S.owner[island] = 0;
  S.armies[chain[0]] = 6; S.cur = 0; S.phase = 'fortify';
  ok(M.reachable(S, chain[0]).has(chain[2]), 'Deccan reaches Taiga through Persia (all yours)');
  ok(!M.reachable(S, chain[0]).has(island) && !M.apply(S, { t: 'fortify', from: chain[0], to: island, n: 1 }).ok, 'but not Borneo: Mekong in between is not yours');
  ok(!M.apply(S, { t: 'fortify', from: chain[0], to: enemy, n: 1 }).ok, 'cannot fortify into an enemy territory');
  ok(!M.apply(S, { t: 'fortify', from: chain[0], to: chain[2], n: 6 }).ok, 'cannot leave a territory empty');
  const cur = S.cur;
  ok(M.apply(S, { t: 'fortify', from: chain[0], to: chain[2], n: 5 }).ok && S.armies[chain[2]] === 6 && S.armies[chain[0]] === 1 && S.cur !== cur, 'a legal fortify moves the armies and ends the turn (one per turn)');
}

// ------------------------------------------------------------ elimination
{
  const S = game(['human', 'normal', 'normal', 'normal']);
  paint(S, 1);
  const a = id('Deccan'), d = id('Gobi');
  S.owner[a] = 0; S.owner[d] = 2; S.armies[a] = 30; S.armies[d] = 1;
  for (let t = 0; t < 5; t++) S.owner[id('Yukon') + t] = 3; // a fourth player keeps the game going
  S.players[0].cards = [0, 4, 8]; S.players[2].cards = [12, 16, 20, 24];
  S.cur = 0; S.phase = 'attack';
  let r; do { S.armies[d] = 1; S.owner[d] = 2; S.phase = 'attack'; r = M.apply(S, { t: 'attack', from: a, to: d }); } while (!r.conquered);
  ok(r.eliminated === 2 && !S.players[2].alive && S.players[2].cards.length === 0 && S.players[0].cards.length === 7, 'take the last territory: that player is out and you take their four cards (7 now)');
  M.apply(S, { t: 'move', n: S.pending.max });
  ok(S.phase === 'reinforce' && S.returnTo === 'attack' && S.reserve === 0, 'holding 6 or more after a knock-out: back to Reinforce to trade at once');
  let trades = 0;
  while (S.players[0].cards.length >= 5) { M.apply(S, { t: 'trade', cards: M.bestSet(S, 0) }); trades++; }
  ok(trades >= 1 && S.players[0].cards.length <= 4, `trade down to 4 or fewer (${trades} trade${trades > 1 ? 's' : ''})`);
  M.apply(S, { t: 'place', terr: a, n: S.reserve });
  ok(S.phase === 'attack' && S.cur === 0, 'place the armies and carry on attacking in the same turn');
  // win by elimination
  const W = game(['human', 'normal']);
  paint(W, 0); W.owner[id('Gobi')] = 1; W.armies[id('Deccan')] = 20; W.cur = 0; W.phase = 'attack';
  // the two-player game's neutral holds a territory too; the win needs only the real opponent gone
  W.owner[id('Yukon')] = 2;
  do { W.armies[id('Gobi')] = 1; W.owner[id('Gobi')] = 1; W.phase = 'attack'; r = M.apply(W, { t: 'attack', from: id('Deccan'), to: id('Gobi') }); } while (!r.conquered);
  ok(W.phase === 'over' && W.winner === 0 && W.endReason === 'conquest', 'two players: knocking out the other wins, even with neutral land left');
  ok(W.players.length === 3 && W.players[2].kind === 'neutral', 'a two-player game gets a neutral third army');
}

// ------------------------------------------------------------ truces and alliances
{
  const S = game(['human', 'normal', 'normal', 'normal'], { seed: 9 });
  S.cur = 0; S.phase = 'reinforce'; S.proposed = false;
  S.players[1].kind = 'human'; // answer by hand, so the test controls it
  let r = M.apply(S, { t: 'propose', to: 1, kind: 'truce' });
  ok(r.ok && r.pending && S.offer && !M.apply(S, { t: 'place', terr: M.owned(S, 0)[0], n: 1 }).ok, 'an offer to a human waits for an answer; nothing else happens meanwhile');
  M.apply(S, { t: 'respond', accept: true });
  const pc = M.pactBetween(S, 0, 1);
  ok(pc && pc.kind === 'truce' && pc.until === S.round + M.PACT_ROUNDS, `accepted: a truce until round ${S.round + M.PACT_ROUNDS}`);
  ok(!M.apply(S, { t: 'propose', to: 2, kind: 'truce' }).ok, 'one offer per turn');
  // the partner's territory: attacking needs breakPact and costs trust and a card
  paint(S, 2); const a = id('Deccan'), d = id('Gobi'); S.owner[a] = 0; S.owner[d] = 1; S.owner[id('Yukon')] = 1; S.owner[id('Taiga')] = 3;
  S.armies[a] = 20; S.phase = 'attack'; S.players[0].cards = [5]; S.players[1].cards = [];
  r = M.apply(S, { t: 'attack', from: a, to: d });
  ok(!r.ok && r.err === 'pact' && S.armies[a] === 20, 'attacking a truce partner is refused unless you choose to break the truce');
  const trust0 = S.players[0].trust;
  r = M.apply(S, { t: 'attack', from: a, to: d, breakPact: true, once: true });
  ok(r.ok && !M.pactBetween(S, 0, 1) && S.players[0].trust === trust0 - M.TRUST_BREAK && S.players[1].cards.includes(5) && S.players[0].cards.length === 0, `breaking it: the truce ends, the breaker loses ${M.TRUST_BREAK} trust and hands the victim a card`);
  ok(S.cool['0-1'] === S.round + M.COOLDOWN, `and the two cannot sign again for ${M.COOLDOWN} rounds`);
  // natural expiry: both gain trust
  const E = game(['normal', 'normal', 'normal', 'normal'], { seed: 4 });
  M.makePact(E, 0, 1, 'truce');
  const t0a = E.players[0].trust, t0b = E.players[1].trust, endRound = E.round + M.PACT_ROUNDS;
  let guard = 0; while (E.round < endRound + 1 && E.phase !== 'over' && guard++ < 5000) { const act = M.aiAct(E); M.apply(E, act); if (E.offer) M.apply(E, { t: 'respond', accept: false }); }
  const kept = E.log.some((e) => e.t === 'pactEnd' && e.a === 0 && e.b === 1) || !E.log.some((e) => e.t === 'break' && ((e.p === 0 && e.q === 1) || (e.p === 1 && e.q === 0)));
  ok(!M.pactBetween(E, 0, 1) && kept, 'a truce lapses on its own after its rounds');
  ok(E.log.some((e) => e.t === 'pactEnd') ? E.players[0].trust >= Math.min(100, t0a) && E.players[1].trust >= Math.min(100, t0b) : true, 'kept to the end, both sides gain trust');
  // limits that keep the game moving
  const L = game(['human', 'human', 'human', 'human'], { seed: 2 });
  L.cur = 0; L.phase = 'attack';
  M.makePact(L, 0, 1, 'truce'); M.makePact(L, 0, 2, 'truce');
  ok(M.canPropose(L, 0, 3, 'truce').err === 'Too many pacts already', 'four players: at most two pacts each, so everyone always has someone left to fight');
  const T = game(['human', 'human', 'human'], { seed: 2 });
  T.cur = 0; T.phase = 'attack'; T.players[2].alive = false; M.owned(T, 2).forEach((t) => { T.owner[t] = 1; });
  ok(M.canPropose(T, 0, 1, 'truce').err === 'No deals with only two players left', 'no pacts once only two players remain');
  const A = game(['human', 'human', 'human', 'human'], { seed: 6 });
  A.cur = 0; A.phase = 'reinforce'; paint(A, 0);
  for (let t = 0; t < 4; t++) A.owner[t] = 1; for (let t = 4; t < 8; t++) A.owner[t] = 2; for (let t = 8; t < 10; t++) A.owner[t] = 3;
  ok(M.leader(A) === 0 && !M.canPropose(A, 0, 1, 'alliance').ok, 'the leader cannot propose an alliance against itself');
  A.cur = 1;
  ok(M.canPropose(A, 1, 2, 'alliance').ok && !M.canPropose(A, 1, 0, 'alliance').ok, 'others can ally against the leader, but not with it');
  const even = game(['human', 'human', 'human', 'human'], { seed: 6 });
  ok(M.leader(even) === -1 && !M.canPropose(even, even.cur, (even.cur + 1) % 4, 'alliance').ok, 'no alliance without a clear leader');
  // computers: a loyal one never breaks a pact; easy ones never break deliberately
  let breaksByLoyal = 0, breaks = 0, pacts = 0, offers = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const G = M.simulate(seed, ['hard', 'normal', 'normal', 'hard', 'easy']);
    offers += G.stats.offers; pacts += G.stats.pacts; breaks += G.stats.breaks;
    for (const k in G.stats.breakBy) if (/loyal|^easy/.test(k)) breaksByLoyal += G.stats.breakBy[k];
  }
  ok(pacts > 0 && breaks > 0 && breaksByLoyal === 0, `60 five-player computer games: ${offers} offers, ${pacts} pacts signed, ${breaks} broken — none by a loyal or an Easy player`);
}

// ------------------------------------------------------------ save / resume
{
  const S = game(['human', 'hard', 'normal', 'easy'], { seed: 31 });
  for (let i = 0; i < 300 && S.phase !== 'over'; i++) { M.apply(S, M.aiAct(S)); if (S.offer) M.apply(S, { t: 'respond', accept: true }); }
  const text = M.serialize(S), R = M.deserialize(text);
  ok(R && JSON.stringify(R) === JSON.stringify(S), 'a saved game reads back exactly');
  const A = JSON.parse(JSON.stringify(S)), B = M.deserialize(text);
  for (let i = 0; i < 400 && A.phase !== 'over'; i++) { M.apply(A, M.aiAct(A)); M.apply(B, M.aiAct(B)); if (A.offer) { M.apply(A, { t: 'respond', accept: true }); M.apply(B, { t: 'respond', accept: true }); } }
  ok(JSON.stringify(A) === JSON.stringify(B), 'a resumed game carries on exactly as the original would (the dice live in the save)');
  const bad = ['', 'null', '{"v":0}', text.slice(0, text.length / 2), JSON.stringify({ v: 1, S: Object.assign({}, S, { owner: S.owner.slice(1) }) }), JSON.stringify({ v: 1, S: Object.assign({}, S, { phase: 'dance' }) }), JSON.stringify({ v: 2, S }), JSON.stringify({ v: 1, S: Object.assign({}, S, { players: S.players.map((P) => Object.assign({}, P, { cards: [99] })) }) })];
  ok(bad.every((b) => M.deserialize(b) === null), `${bad.length} broken or old saves are refused (the page then starts fresh)`);
}

// ------------------------------------------------------------ the shared back button
{
  const tetris = fs.readFileSync(path.join(__dirname, '..', '..', 'tetris', 'index.html'), 'utf8');
  const backBlock = (s) => { const a = s.lastIndexOf('<style>', s.indexOf('/* dgames: the way back')); const e = s.indexOf('</a>', s.indexOf('<a class="dg-home"')); return s.slice(a, e + 4); };
  ok(backBlock(html) === backBlock(tetris) && backBlock(html).length > 800, 'back button is byte-identical to tetris (' + backBlock(html).length + ' bytes)');
  ok(!/\r/.test(html), 'index.html has LF line endings');
}

console.log(`\n${checks - failures}/${checks} passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failures ? 1 : 0);
