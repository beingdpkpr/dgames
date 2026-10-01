// Headless rules check (no browser). Lifts the pure section of index.html -- everything above the
// `// ---------- UI ----------` marker, which is the rules and the computer players -- into node's vm and
// drives exact scenarios. Possible because nothing in that section reads a clock or Math.random: the
// dice come from a generator whose state lives in the game (S.rng), and a test can script them outright
// with S.script = [[a, b], ...].
// Run: node test/rules.js
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { Math, console, Array, Object, Number, String, JSON, Set, Map, Infinity };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const M = ctx.__mahanagar;

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (cond) console.log('ok   ' + msg); else { failures++; console.log('FAIL ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg + (JSON.stringify(a) === JSON.stringify(b) ? '' : ' -- got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)));

// A fresh quiet game with plain players; `kinds` defaults to two humans so nothing decides for them.
function game(n = 2, extra = {}) {
  const S = M.newGame({ seed: 7, players: Array.from({ length: n }, (_, i) => ({ name: 'P' + i, kind: 'human' })), ...extra });
  S.ev = []; return S;
}
const give = (S, p, list) => { for (const i of list) S.own[i] = p; };
const sq = (name) => M.SPACES.findIndex((s) => s.name === name);
const G = M.GROUP_SQ;

// ------------------------------------------------------------ 1. the board
{
  ok(M.SPACES.length === 40, '40 spaces');
  const streets = M.SPACES.filter((s) => s.type === 'street');
  ok(streets.length === 22, '22 streets');
  ok(M.GROUP_KEYS.length === 8 && M.GROUP_KEYS.every((g) => G[g].length === (g === 'brown' || g === 'navy' ? 2 : 3)), '8 colour groups: two of 2, six of 3');
  eq(M.STATIONS, [5, 15, 25, 35], 'stations at 5, 15, 25, 35');
  eq(M.UTILITIES, [12, 28], 'utilities at 12 and 28');
  eq([0, 10, 20, 30].map((i) => M.SPACES[i].type), ['go', 'jail', 'parking', 'gotojail'], 'corners: Start, Jail, Chai Break, Go to Jail');
  ok(M.SPACES.filter((s) => s.type === 'kismat').length === 3 && M.SPACES.filter((s) => s.type === 'khazana').length === 3, 'three Kismat and three Khazana spaces');
  ok(M.CARDS.kismat.length === 16 && M.CARDS.khazana.length === 16, 'sixteen cards in each deck');
  // Prices rise round the board, group by group.
  let prev = 0, rising = true;
  for (const g of M.GROUP_KEYS) { const p = Math.min(...G[g].map((i) => M.SPACES[i].price)); if (p < prev) rising = false; prev = p; }
  ok(rising, 'colour groups get dearer round the board');
  // Original names and texts only: none of the trademarked board's names or card wordings.
  const banned = /boardwalk|mayfair|park place|park lane|marvin|ventnor|baltic|mediterranean|old kent|reading railroad|community chest|free parking|monopoly|bank error in your favou?r|advance to go\b|beauty contest/i;
  const texts = M.SPACES.map((s) => s.name).concat(M.CARDS.kismat.map((c) => c.text), M.CARDS.khazana.map((c) => c.text));
  ok(!texts.some((t) => banned.test(t)), 'no trademarked names or card texts' + (texts.filter((t) => banned.test(t)).join(' | ') ? ' -- ' + texts.filter((t) => banned.test(t)).join(' | ') : ''));
  ok(!banned.test(html.replace(/<style>[\s\S]*?<\/style>/g, '')), 'and none anywhere in the page');
}

// ------------------------------------------------------------ 2. rent, every case
{
  const S = game(2);
  const assi = sq('Assi Ghat'), godo = sq('Godowlia');
  give(S, 0, [assi]);
  eq(M.rentFor(S, assi, 7), 2, 'street bare rent when the group is split');
  give(S, 0, [godo]);
  eq([M.rentFor(S, assi, 7), M.rentFor(S, godo, 7)], [4, 8], 'whole group, no houses: bare rent doubles');
  const want = [];
  const got = [];
  for (const i of M.OWNABLE.filter((j) => M.SPACES[j].type === 'street')) {
    const T = game(2); give(T, 0, G[M.SPACES[i].group]);
    for (let h = 1; h <= 5; h++) { for (const j of G[M.SPACES[i].group]) T.houses[j] = h; got.push(M.rentFor(T, i, 7)); want.push(M.SPACES[i].rent[h]); }
  }
  eq(got, want, 'houses 1-4 and hotel charge the deed rent on every street (110 cases)');
  S.mort[assi] = true;
  eq(M.rentFor(S, assi, 7), 0, 'a mortgaged lot charges no rent');
  eq(M.rentFor(S, godo, 7), 8, 'its unmortgaged partner still charges the doubled rent');

  const T = game(2);
  const st = [];
  for (let k = 0; k < 4; k++) { T.own[M.STATIONS[k]] = 0; st.push(M.rentFor(T, M.STATIONS[0], 7)); }
  eq(st, [25, 50, 100, 200], 'stations: 25, 50, 100, 200 for one to four owned');
  eq(M.rentFor(T, 5, 7, 'station2'), 400, 'a Kismat "nearest station" card doubles it');
  const U = game(2);
  U.own[12] = 1;
  eq(M.rentFor(U, 12, 9), 36, 'one utility: 4 x the dice');
  U.own[28] = 1;
  eq(M.rentFor(U, 12, 9), 90, 'both utilities: 10 x the dice');
  U.own[28] = 0;
  eq(M.rentFor(U, 12, 5, 'util10'), 50, 'Kismat power-cut card: 10 x a fresh roll even with one utility');

  // Landing actually charges it.
  const L = game(2);
  give(L, 1, G.orange);
  L.houses[16] = 2; L.houses[18] = 2; L.houses[19] = 2;
  L.script = [[6, 0 + 0 + 6 === 12 ? 6 : 6]];
  L.players[0].pos = 10; L.script = [[2, 4]];
  M.roll(L);
  ok(L.players[0].pos === 16 && L.players[0].cash === 1500 - 200 && L.players[1].cash === 1700, 'landing on a street with two houses pays its rent to the owner');
}

// ------------------------------------------------------------ 3. building: even rule and shortage
{
  const S = game(2);
  const [a, b, c] = G.pink;
  give(S, 0, [a, b]);
  ok(!M.canBuild(S, 0, a), 'cannot build without the whole group');
  give(S, 0, [c]);
  ok(M.canBuild(S, 0, a) && M.build(S, 0, a), 'can build once the group is whole');
  ok(!M.canBuild(S, 0, a), 'even rule: no second house on a lot while another has none');
  ok(M.build(S, 0, b) && M.build(S, 0, c) && M.build(S, 0, a), 'evenly: each lot gets its first, then one gets a second');
  ok(!M.canSell(S, 0, b) && M.canSell(S, 0, a), 'even rule on selling: only the lot with the most can sell');
  eq(S.players[0].cash, 1500 - 4 * 100, 'each pink house cost 100');
  for (const i of [b, c, a, b, c, a, b, c]) M.build(S, 0, i);
  eq([S.houses[a], S.houses[b], S.houses[c], S.bankHouses], [4, 4, 4, 32 - 12], 'four houses everywhere, twelve taken from the bank');
  ok(M.build(S, 0, a) && S.houses[a] === 5 && S.bankHotels === 11 && S.bankHouses === 24, 'a hotel replaces four houses, which go back to the bank');
  // Shortage: the bank is out of houses.
  const T = game(2);
  give(T, 0, G.sky);
  T.bankHouses = 0;
  ok(!M.canBuild(T, 0, G.sky[0]), 'housing shortage: no houses in the bank, no building');
  T.bankHouses = 32;
  for (let k = 0; k < 4; k++) for (const i of G.sky) M.build(T, 0, i);
  T.bankHotels = 0;
  ok(!M.canBuild(T, 0, G.sky[0]), 'no hotels in the bank, no hotel');
  T.bankHotels = 12;
  M.build(T, 0, G.sky[0]);
  T.bankHouses = 1;
  const cash = T.players[0].cash;
  ok(M.sellHouse(T, 0, G.sky[0]) && T.houses[G.sky[0]] === 1 && T.bankHouses === 0 && T.players[0].cash === cash + 25 + 3 * 25,
    'selling a hotel in a shortage: the bank gives the houses it has, the rest are sold at half price too');
  // Mortgaged set: no building.
  const U = game(2);
  give(U, 0, G.red);
  U.mort[G.red[2]] = true;
  ok(!M.canBuild(U, 0, G.red[0]), 'no building in a group with a mortgaged lot');
  ok(!M.canBuild(U, 1, G.red[0]), 'and nobody builds on a lot they do not own');
}

// ------------------------------------------------------------ 4. mortgages
{
  const S = game(2);
  give(S, 0, M.OWNABLE);
  const vals = M.OWNABLE.map((i) => [M.mortgageValue(i), M.unmortgageCost(i)]);
  ok(vals.every(([m, u], k) => m === M.SPACES[M.OWNABLE[k]].price / 2 && u === m + Math.ceil(m / 10)), 'mortgage pays half the price, lifting costs that plus 10% rounded up');
  eq([M.unmortgageCost(5), M.unmortgageCost(12), M.unmortgageCost(39)], [110, 83, 220], 'e.g. a ₹200 station lifts for ₹110 (not 111: no floating-point ceil), ₹150 for ₹83, ₹400 for ₹220');
  const cash = S.players[0].cash;
  ok(M.mortgage(S, 0, 39) && S.players[0].cash === cash + 200 && S.mort[39], 'mortgaging Malabar Hill pays ₹200');
  ok(!M.mortgage(S, 0, 39), 'cannot mortgage twice');
  ok(M.unmortgage(S, 0, 39) && S.players[0].cash === cash + 200 - 220 && !S.mort[39], 'lifting it costs ₹220');
  S.houses[37] = 1;
  ok(!M.canMortgage(S, 0, 39), 'cannot mortgage while any lot in the group has a building');
  S.players[0].cash = 10; S.mort[5] = true;
  ok(!M.canUnmortgage(S, 0, 5), 'cannot lift a mortgage without the cash');
}

// ------------------------------------------------------------ 5. dice: doubles and three doubles
{
  const S = game(2, { auctions: false });
  S.script = [[3, 3]];
  M.roll(S);
  ok(S.players[0].pos === 6 && S.phase === 'buy', 'doubles move the token');
  M.decline(S);
  ok(S.phase === 'roll' && S.cur === 0, 'after doubles the same player rolls again');
  S.script = [[2, 2]]; M.roll(S);
  ok(S.phase === 'roll' && S.players[0].pos === 10 && !S.players[0].jail, 'second doubles: visiting jail, roll again');
  S.script = [[1, 1]]; M.roll(S);
  ok(S.players[0].pos === 10 && S.players[0].jail && S.phase === 'done', 'third doubles: straight to jail without moving, turn over');
  M.endTurn(S);
  ok(S.cur === 1 && S.doubles === 0 && S.phase === 'roll', 'turn passes and the doubles count resets');
  S.script = [[1, 3]]; M.roll(S);
  ok(S.phase === 'done' && S.players[1].pos === 4, 'no doubles: the turn ends after moving');
}

// ------------------------------------------------------------ 6. jail
{
  // pay the fine
  let S = game(2);
  M.goToJail(S, 0);
  ok(S.players[0].pos === 10 && S.players[0].jail, 'go to jail puts you in jail');
  ok(M.payJail(S) && !S.players[0].jail && S.players[0].cash === 1450, 'paying ₹50 frees you before the roll');
  S.script = [[4, 4]]; M.roll(S);
  ok(S.players[0].pos === 18 && (S.phase === 'roll' || S.phase === 'buy'), '... and you roll normally, doubles included');
  // the card
  S = game(2);
  M.goToJail(S, 0);
  const card = M.CARDS.kismat.findIndex((c) => c.free);
  S.decks.kismat = S.decks.kismat.filter((i) => i !== card);
  S.players[0].cards.push('kismat');
  ok(M.useJailCard(S) && !S.players[0].jail && !S.players[0].cards.length && S.decks.kismat[S.decks.kismat.length - 1] === card, 'a get-out card frees you and goes back under its deck');
  // doubles on a try
  S = game(2);
  M.goToJail(S, 0);
  S.script = [[5, 5]]; M.roll(S);
  ok(!S.players[0].jail && S.players[0].pos === 20 && S.phase === 'done', 'doubles in jail: out, move, but no extra roll');
  // three failed tries
  S = game(2);
  M.goToJail(S, 0);
  for (const d of [[1, 2], [3, 4]]) { S.script = [d]; M.roll(S); ok(S.players[0].jail && S.phase === 'done', 'a failed try ends the turn in jail'); S.phase = 'roll'; S.hasRolled = false; }
  S.script = [[2, 3]]; M.roll(S);
  ok(!S.players[0].jail && S.players[0].pos === 15 && S.players[0].cash === 1450, 'third failure: the fine is compulsory and you move by that roll');
  // third failure without the cash: a debt, and the move still happens
  S = game(2);
  M.goToJail(S, 0); S.players[0].jailTries = 2; S.players[0].cash = 20;
  S.script = [[1, 3]]; M.roll(S);
  ok(S.phase === 'debt' && S.debts[0].amt === 50 && S.players[0].pos === 14, 'third failure without ₹50: the fine becomes a debt and the token still moves');
  // landing on Go to Jail
  S = game(2);
  S.players[0].pos = 25; S.script = [[2, 3]]; M.roll(S);
  ok(S.players[0].pos === 10 && S.players[0].jail, 'landing on Go to Jail');
  // rent while in jail still collected
  S = game(2);
  give(S, 0, [21]); M.goToJail(S, 0); S.cur = 1; S.players[1].pos = 18; S.script = [[1, 2]]; S.phase = 'roll';
  M.roll(S);
  ok(S.players[0].cash === 1518, 'a jailed owner still collects rent');
}

// ------------------------------------------------------------ 7. passing Start
{
  let S = game(2);
  S.players[0].pos = 38; S.script = [[2, 3]]; M.roll(S);
  ok(S.players[0].pos === 3 && S.players[0].cash === 1700, 'passing Start pays ₹200');
  S = game(2);
  S.players[0].pos = 36; S.script = [[1, 3]]; M.roll(S);
  ok(S.players[0].pos === 0 && S.players[0].cash === 1700, 'landing on Start pays ₹200');
  S = game(2);
  S.players[0].pos = 27; S.script = [[1, 2]]; M.roll(S);
  ok(S.players[0].cash === 1500 && S.players[0].jail, 'sent to jail from beyond Start: no salary');
}

// ------------------------------------------------------------ 8. every card
{
  const run = (deck, idx, setup) => {
    const S = game(3);
    S.players[0].pos = deck === 'kismat' ? 7 : 2;
    if (setup) setup(S);
    S.decks[deck] = [idx].concat(S.decks[deck].filter((i) => i !== idx));
    M.drawCard(S, 0, deck);
    M.advance(S);
    return S;
  };
  const cash = (S, p = 0) => S.players[p].cash;
  const K = M.CARDS.kismat, Z = M.CARDS.khazana;
  const results = [];
  K.forEach((c, idx) => {
    let S, pass;
    if (c.to != null) {
      S = run('kismat', idx);
      const salary = c.to < 7 ? 200 : 0;
      pass = S.players[0].pos === c.to && cash(S) === 1500 + salary;
    } else if (c.nearest === 'station') {
      S = run('kismat', idx, (T) => { T.own[15] = 1; });
      pass = S.players[0].pos === 15 && cash(S) === 1450 && cash(S, 1) === 1550;
    } else if (c.nearest === 'utility') {
      S = run('kismat', idx, (T) => { T.own[12] = 2; T.script = [[3, 4]]; });
      pass = S.players[0].pos === 12 && cash(S) === 1430 && cash(S, 2) === 1570;
    } else if (c.cash) { S = run('kismat', idx); pass = cash(S) === 1500 + c.cash; }
    else if (c.free) { S = run('kismat', idx); pass = S.players[0].cards[0] === 'kismat' && !S.decks.kismat.includes(idx); }
    else if (c.back) { S = run('kismat', idx); pass = S.players[0].pos === 4 && cash(S) === 1300; }
    else if (c.jail) { S = run('kismat', idx); pass = S.players[0].jail && S.players[0].pos === 10 && cash(S) === 1500; }
    else if (c.repairs) { S = run('kismat', idx, (T) => { give(T, 0, G.brown); T.houses[1] = 5; T.houses[3] = 3; }); pass = cash(S) === 1500 - 100 - 75; }
    else if (c.each) { S = run('kismat', idx); pass = cash(S) === 1400 && cash(S, 1) === 1550 && cash(S, 2) === 1550; }
    results.push(pass ? '' : 'kismat ' + idx + ' (' + c.text + ')');
  });
  Z.forEach((c, idx) => {
    let S, pass;
    if (c.to != null) { S = run('khazana', idx); pass = S.players[0].pos === 0 && cash(S) === 1700; }
    else if (c.cash) { S = run('khazana', idx); pass = cash(S) === 1500 + c.cash; }
    else if (c.free) { S = run('khazana', idx); pass = S.players[0].cards[0] === 'khazana'; }
    else if (c.jail) { S = run('khazana', idx); pass = S.players[0].jail && cash(S) === 1500; }
    else if (c.fromEach) { S = run('khazana', idx); pass = cash(S) === 1500 + 2 * c.fromEach && cash(S, 1) === 1500 - c.fromEach; }
    else if (c.repairs) { S = run('khazana', idx, (T) => { give(T, 0, G.brown); T.houses[1] = 5; T.houses[3] = 2; }); pass = cash(S) === 1500 - 115 - 80; }
    results.push(pass ? '' : 'khazana ' + idx + ' (' + c.text + ')');
  });
  ok(results.every((r) => !r), 'all 32 cards do what they say' + (results.filter(Boolean).length ? ' -- ' + results.filter(Boolean).join('; ') : ''));
  // A non-jail card goes to the bottom of its deck; the deck stays a full permutation.
  const S = game(2);
  const top = S.decks.khazana[0];
  M.drawCard(S, 0, 'khazana');
  ok(M.CARDS.khazana[top].free || S.decks.khazana[S.decks.khazana.length - 1] === top, 'a drawn card goes back under the deck');
  // A card that collects from someone who cannot pay makes that someone the debtor.
  const T = game(3);
  T.players[2].cash = 5;
  T.players[0].pos = 2;
  const bday = Z.findIndex((c) => c.fromEach === 50);
  T.decks.khazana = [bday];
  M.drawCard(T, 0, 'khazana'); M.advance(T);
  ok(T.phase === 'debt' && M.debtor(T) === 2 && T.debts[0].to === 0, 'a player who cannot chip in owes it, even out of turn');
}

// ------------------------------------------------------------ 9. bankruptcy
{
  // to a player
  const S = game(3);
  give(S, 1, G.orange); S.houses[16] = 2; S.houses[18] = 2; S.houses[19] = 2;
  give(S, 0, [1, 3, 5]); S.mort[5] = true; S.houses[1] = 1; S.houses[3] = 1;
  S.bankHouses = 32 - 8;
  S.players[0].cash = 100; S.players[0].cards = ['khazana'];
  S.players[0].pos = 10; S.script = [[3, 3]];
  M.roll(S);
  ok(S.phase === 'debt' && S.debts[0].amt === 200 && S.debts[0].to === 1, 'cannot pay ₹200 rent: a debt to the owner');
  const before = S.players[1].cash;
  M.bankrupt(S, 0);
  ok(S.players[0].out && S.own[1] === 1 && S.own[3] === 1 && S.own[5] === 1, 'bankrupt to a player: every lot goes to the creditor');
  ok(S.houses[1] === 0 && S.houses[3] === 0 && S.bankHouses === 32 - 6, 'buildings go back to the bank first');
  ok(S.players[1].cash === before + 100 + 50 - 10 && S.mort[5], 'creditor gets the cash plus the half-price building refund, and pays 10% interest on the mortgaged station');
  eq(S.players[1].cards, ['khazana'], 'the get-out card goes to the creditor');
  ok(S.phase === 'roll' && S.cur === 1, 'the bankrupt player\'s turn ends and play moves on');
  // to the bank
  const T = game(3);
  give(T, 0, [37, 39]); T.mort[39] = true; T.houses[37] = 0;
  T.players[0].cash = 50; T.players[0].cards = ['kismat'];
  T.players[0].pos = 34; T.script = [[1, 3]];
  M.roll(T);
  ok(T.phase === 'debt' && T.debts[0].to < 0, 'cannot pay Wealth Tax: a debt to the bank');
  const deckLen = T.decks.kismat.length;
  M.bankrupt(T, 0);
  ok(T.own[37] === -1 && T.own[39] === -1 && !T.mort[39], 'bankrupt to the bank: lots return unmortgaged');
  ok(T.decks.kismat.length === deckLen + 1, 'the get-out card goes back under its deck');
  ok(T.phase === 'auction' && T.auction.i === 37 && T.auctionQueue[0] === 39, 'and the lots are auctioned, one at a time');
  // last player standing
  const U = game(2);
  U.players[0].cash = 0; U.debts.push({ from: 0, to: 1, amt: 10, why: 'test' }); M.advance(U);
  M.bankrupt(U, 0);
  ok(U.phase === 'over' && U.winner === 1 && U.endReason === 'last', 'last player standing wins');
}

// ------------------------------------------------------------ 10. auctions
{
  const S = game(3);
  S.script = [[2, 4]]; M.roll(S);
  ok(S.phase === 'buy' && S.pending === 6, 'landing on an unowned lot offers it');
  M.decline(S);
  ok(S.phase === 'auction' && M.auctionActor(S) === 0, 'declining starts an auction, the decliner bids first');
  ok(!M.bid(S, 2000), 'cannot bid more than your cash');
  M.bid(S, 40); M.bid(S, 60); M.passBid(S);
  ok(M.auctionActor(S) === 0 && S.auction.bidders.length === 2, 'a pass drops that bidder out for good');
  ok(!M.bid(S, 60), 'a bid must beat the high bid');
  M.bid(S, 70); M.passBid(S);
  ok(S.own[6] === 0 && S.players[0].cash === 1430 && !S.auction && S.phase === 'done', 'last bidder standing wins and pays their bid');
  const T = game(3);
  T.script = [[2, 4]]; M.roll(T); M.decline(T);
  M.passBid(T); M.passBid(T); M.passBid(T);
  ok(T.own[6] === -1 && T.phase === 'done', 'no bids: the lot stays with the bank');
  const U = game(2, { auctions: false });
  U.script = [[2, 4]]; M.roll(U); M.decline(U);
  ok(!U.auction && U.own[6] === -1 && U.phase === 'done', 'with auctions off, declining just leaves it');
}

// ------------------------------------------------------------ 11. trades and how computers judge them
{
  const S = game(2);
  give(S, 0, [16]); give(S, 1, [18]);
  S.houses[19] = 0;
  const o = { from: 0, to: 1, give: { props: [16], cash: 0, cards: 0 }, get: { props: [18], cash: 100, cards: 0 } };
  ok(M.doTrade(S, o) && S.own[16] === 1 && S.own[18] === 0 && S.players[0].cash === 1600, 'a trade swaps lots and cash');
  const T = game(2);
  give(T, 0, G.sky); T.houses[6] = 1; give(T, 1, [1]);
  ok(M.tradeError(T, { from: 0, to: 1, give: { props: [8], cash: 0, cards: 0 }, get: { props: [1], cash: 0, cards: 0 } }) !== '', 'a lot cannot be traded while its group has buildings');
  const U = game(2);
  give(U, 0, [39]); U.mort[39] = true; give(U, 1, [1]);
  M.doTrade(U, { from: 0, to: 1, give: { props: [39], cash: 0, cards: 0 }, get: { props: [1], cash: 0, cards: 0 } });
  ok(U.players[1].cash === 1500 - 20 && U.mort[39], 'a mortgaged lot arrives with its loan: the receiver pays 10% interest');

  // The monopoly test, every level, two and four players, every group: the computer owns the lot that
  // would complete an opponent's set and is offered its printed price in cash. It must always refuse.
  const refusals = [];
  for (const n of [2, 4]) for (const kind of ['easy', 'normal', 'hard']) for (const g of M.GROUP_KEYS) {
    const V = M.newGame({ seed: 3, players: Array.from({ length: n }, (_, i) => ({ name: 'P' + i, kind: i === 0 ? kind : 'human' })) });
    const [first, ...rest] = G[g];
    V.own[first] = 0; for (const i of rest) V.own[i] = 1;
    for (let turn = 0; turn < 7; turn++) {          // different turns, so Easy's noise is sampled
      V.turns = turn * 13;
      const offer = { from: 1, to: 0, give: { props: [], cash: M.SPACES[first].price, cards: 0 }, get: { props: [first], cash: 0, cards: 0 } };
      if (M.aiWouldAccept(V, 0, offer, M.LEVELS[kind])) refusals.push(n + 'p ' + kind + ' ' + g + ' turn ' + V.turns);
      const r = M.aiAnswer(V, offer);
      if (r.accept) refusals.push('answer ' + n + 'p ' + kind + ' ' + g);
    }
  }
  ok(!refusals.length, 'no computer (any level, 2 or 4 players, any group) sells the lot that completes a set for its list price' + (refusals.length ? ' -- ' + refusals.slice(0, 4).join(', ') : ''));
  // Twice list price is not enough either, at Normal and Hard.
  const twice = [];
  for (const kind of ['normal', 'hard']) for (const g of M.GROUP_KEYS) {
    const V = M.newGame({ seed: 3, players: [{ name: 'A', kind }, { name: 'B', kind: 'human' }, { name: 'C', kind: 'human' }] });
    const [first, ...rest] = G[g]; V.own[first] = 0; for (const i of rest) V.own[i] = 1;
    if (M.aiWouldAccept(V, 0, { from: 1, to: 0, give: { props: [], cash: 2 * M.SPACES[first].price, cards: 0 }, get: { props: [first], cash: 0, cards: 0 } }, M.LEVELS[kind])) twice.push(kind + ' ' + g);
  }
  ok(!twice.length, 'Normal and Hard refuse even twice the list price for a set-completing lot' + (twice.length ? ' -- ' + twice.join(', ') : ''));
  // A clearly good deal is taken: ₹500 for a lone lot nobody is collecting.
  const yes = [];
  for (const kind of ['easy', 'normal', 'hard']) for (const n of [2, 4]) {
    const V = M.newGame({ seed: 3, players: Array.from({ length: n }, (_, i) => ({ name: 'P' + i, kind: i === 0 ? kind : 'human' })) });
    V.own[6] = 0; V.own[8] = 2 % n; V.own[9] = n === 2 ? -1 : 3;
    if (!M.aiAnswer(V, { from: 1, to: 0, give: { props: [], cash: 500, cards: 0 }, get: { props: [6], cash: 0, cards: 0 } }).accept) yes.push(kind + ' ' + n + 'p');
  }
  ok(!yes.length, 'every level accepts ₹500 for a lone ₹100 lot' + (yes.length ? ' -- refused by ' + yes.join(', ') : ''));
  // Swapping into a set for both sides is acceptable when the cash evens it up; and a counter asks for more.
  const W2 = M.newGame({ seed: 3, players: [{ name: 'A', kind: 'hard' }, { name: 'B', kind: 'human' }] });
  W2.own[37] = 0; W2.own[39] = 1;
  const cheap = { from: 1, to: 0, give: { props: [], cash: 400, cards: 0 }, get: { props: [37], cash: 0, cards: 0 } };
  const ans = M.aiAnswer(W2, cheap);
  ok(!ans.accept, 'Hard will not sell Marine Drive to the Malabar Hill owner for ₹400');
  ok(!ans.counter || ans.counter.give.cash > 400, 'and if it counters, it asks for more cash');
  // Computers start trades that they themselves come out ahead on.
  const X = M.newGame({ seed: 5, players: [{ name: 'A', kind: 'hard' }, { name: 'B', kind: 'hard' }, { name: 'C', kind: 'hard' }] });
  give(X, 0, [16, 18]); give(X, 1, [19, 21]); give(X, 0, [23]); give(X, 1, []); X.own[24] = 1;
  const prop = M.aiFindTrade(X, 0, 'hard');
  const after = prop && M.applySnap(M.snap(X), prop);
  const done = after && M.GROUP_KEYS.filter((g) => M.GROUP_SQ[g].every((i) => after.own[i] === 0));
  ok(prop && done.length && M.tradeDelta(X, 0, prop, M.LEVELS.hard) > M.LEVELS.hard.thr && M.aiWouldAccept(X, 1, prop, M.LEVELS.hard),
    'Hard finds a trade that completes one of its sets, wins by its own measure and should be accepted' + (prop ? ' (' + M.describeTrade(X, prop) + ')' : ''));
  const Y = M.newGame({ seed: 5, players: [{ name: 'A', kind: 'easy' }, { name: 'B', kind: 'hard' }] });
  give(Y, 0, [16, 18]); Y.own[19] = 1;
  ok(!M.aiFindTrade(Y, 0, 'easy'), 'Easy never starts a trade');
}

// ------------------------------------------------------------ 12. save and resume
{
  const S = M.newGame({ seed: 99, players: [{ name: 'A', kind: 'hard' }, { name: 'B', kind: 'normal' }, { name: 'C', kind: 'easy' }] });
  for (let k = 0; k < 400; k++) M.aiStep(S);
  const text = M.serialize(S);
  const R = M.deserialize(text);
  ok(R && R.phase === S.phase && R.cur === S.cur && JSON.stringify(R.own) === JSON.stringify(S.own), 'a mid-game save loads back to the same position');
  for (let k = 0; k < 600; k++) { M.aiStep(S); M.aiStep(R); }
  ok(M.serialize(R) === M.serialize(S), 'and plays on identically (the dice generator state is part of the save)');
  ok(M.deserialize('not json') === null && M.deserialize('{}') === null && M.deserialize('null') === null, 'junk is rejected, not loaded');
  const old = JSON.parse(text); old.v = 1;
  ok(M.deserialize(JSON.stringify(old)) === null, 'a save from another version is rejected');
  const bad = JSON.parse(text); bad.own[5] = 9;
  ok(M.deserialize(JSON.stringify(bad)) === null, 'an impossible owner is rejected');
  const bad2 = JSON.parse(text); bad2.phase = 'auction'; bad2.auction = null;
  ok(M.deserialize(JSON.stringify(bad2)) === null, 'a phase whose data is missing is rejected');
  ok(!text.includes('"ev"'), 'the animation queue is not saved');
}

// ------------------------------------------------------------ 13. no soft-locks: random play always finishes
{
  // Seats play at random among the legal actions a person has — buy or not, bid odd amounts, mortgage,
  // build, sell, propose junk trades, refuse offers — and the game must always have someone able to act
  // and always end. Each step is checked to change the state.
  let stuck = 0, over = 0, maxSteps = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const S = M.newGame({ seed, players: [{ name: 'A', kind: 'human' }, { name: 'B', kind: 'human' }, { name: 'C', kind: 'easy' }, { name: 'D', kind: 'human' }], maxTurns: 600 });
    S.quiet = true;
    let r = seed * 7 + 3;
    const rnd = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; };
    let steps = 0;
    for (; steps < 60000 && S.phase !== 'over'; steps++) {
      const a = M.actor(S);
      if (a < 0) { stuck++; break; }
      const before = M.serialize(S);
      if (S.players[a].kind !== 'human') { M.aiStep(S); }
      else {
        const props = M.propsOf(S, a);
        const x = rnd();
        if (x < 0.1 && props.length) M.mortgage(S, a, props[Math.floor(rnd() * props.length)]);
        else if (x < 0.2 && props.length) M.build(S, a, props[Math.floor(rnd() * props.length)]);
        else if (x < 0.25 && props.length) M.sellHouse(S, a, props[Math.floor(rnd() * props.length)]);
        else if (x < 0.3 && props.length) M.unmortgage(S, a, props[Math.floor(rnd() * props.length)]);
        else if (x < 0.33 && (S.phase === 'roll' || S.phase === 'done')) {
          const others = M.active(S).filter((q) => q !== a), q = others[Math.floor(rnd() * others.length)];
          const theirs = M.propsOf(S, q);
          const o = { from: a, to: q, give: { props: props.slice(0, 1), cash: Math.floor(rnd() * 50), cards: 0 }, get: { props: theirs.slice(0, 1), cash: 0, cards: 0 } };
          if (S.players[q].kind === 'human') M.offerTrade(S, o); else if (M.aiAnswer(S, o).accept) M.doTrade(S, o);
        } else {
          switch (S.phase) {
            case 'roll': if (S.players[a].jail && rnd() < 0.3) M.payJail(S); M.roll(S); break;
            case 'buy': if (rnd() < 0.6) M.buy(S); if (S.phase === 'buy') M.decline(S); break;
            case 'auction': if (rnd() < 0.5) M.bid(S, (S.auction.high + 1 + Math.floor(rnd() * 80))); else M.passBid(S); break;
            case 'debt': if (!M.settleDebt(S) && rnd() < 0.5) { const m = props.find((i) => M.canMortgage(S, a, i)); const h = props.find((i) => M.canSell(S, a, i)); if (h != null) M.sellHouse(S, a, h); else if (m != null) M.mortgage(S, a, m); else M.bankrupt(S, a); } break;
            case 'trade': M.answerOffer(S, rnd() < 0.5); break;
            case 'done': M.endTurn(S); break;
          }
        }
      }
      // Something must always be possible: the forced move exists for every phase.
      if (M.serialize(S) === before && S.phase !== 'over') { const C = M.deserialize(before); C.quiet = true; if (!M.forceStep(C)) { stuck++; break; } }
    }
    maxSteps = Math.max(maxSteps, steps);
    if (S.phase === 'over') over++;
    if (S.players.some((P) => P.cash < 0) || S.houses.some((h, i) => h && S.own[i] < 0)) stuck++;
  }
  ok(stuck === 0 && over === 60, 'random human play: 60/60 games end, nobody ever stuck, cash never negative (' + over + ' ended, longest ' + maxSteps + ' steps)');
}

// ------------------------------------------------------------ 14. quick game and the head-start deal
{
  const S = M.simulate(11, ['hard', 'normal', 'easy', 'normal'], { rounds: 10 });
  ok(S.phase === 'over' && S.endReason === 'rounds' && S.round === 11, 'a 10-round quick game ends when round 11 would start');
  const worths = S.standings.filter((r) => !S.players[r.p].out).map((r) => r.worth);
  ok(worths.every((w, k) => !k || worths[k - 1] >= w) && S.winner === S.standings[0].p, 'and the richest player by net worth wins');
  let fair = true;
  for (let seed = 1; seed <= 50; seed++) {
    const D = M.newGame({ seed, dealTwo: true, players: Array.from({ length: 6 }, (_, i) => ({ name: 'P' + i, kind: 'hard' })) });
    for (let p = 0; p < 6; p++) {
      if (M.propsOf(D, p).length !== 2) fair = false;
      if (M.GROUP_KEYS.some((g) => M.hasSet(D, g, p))) fair = false;
    }
  }
  ok(fair, 'dealing two streets each, six players, 50 seeds: always two, never a whole set');
}

// ------------------------------------------------------------ 15. the shared snippet is verbatim
{
  const tetris = fs.readFileSync(path.join(__dirname, '..', '..', 'tetris', 'index.html'), 'utf8');
  const backBlock = (s) => { const a = s.lastIndexOf('<style>', s.indexOf('/* dgames: the way back')); const e = s.indexOf('</a>', s.indexOf('<a class="dg-home"')); return s.slice(a, e + 4); };
  ok(backBlock(html) === backBlock(tetris) && backBlock(html).length > 800, 'back button is byte-identical to tetris (' + backBlock(html).length + ' bytes)');
  ok(!html.includes('\r'), 'file is LF only');
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
