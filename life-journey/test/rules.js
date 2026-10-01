// Headless rules check (no browser). Lifts the pure section of index.html -- everything above the
// `// ---------- UI ----------` marker: the track, the cards, money and the computer players -- into node's
// vm and drives exact scenarios. Possible because nothing there reads a clock or Math.random: spins come
// from a generator whose state lives in the game (S.rng), and a test scripts them with S.script = [7, 3].
// Run: node test/rules.js
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { Math, console, Array, Object, Number, String, JSON, Set, Map, Infinity, Error };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const M = ctx.__life;
const T = M.TRACK;

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (cond) console.log('ok   ' + msg); else { failures++; console.log('FAIL ' + msg); } };
const eq = (a, b, msg) => { const A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, msg + (A === B ? '' : ' -- got ' + A + ', want ' + B)); };

// A quiet two-human game (nobody decides for them), event log cleared.
function game(n = 2, extra = {}) {
  const S = M.newGame(Object.assign({ seed: 11, players: Array.from({ length: n }, (_, i) => ({ name: 'P' + i, kind: 'human' })) }, extra));
  S.ev = []; return S;
}
const first = (type, road) => T.find((x) => x.type === type && (road === undefined || x.road === road));
const prevOf = (id) => T.find((x) => x.next.includes(id));
// Put the current player on `node`, already working (so pay days pay), ready to spin `spins`.
function at(S, node, spins, career = 'teacher', toward) {
  const P = S.players[S.cur];
  P.node = node; P.career = career; S.phase = 'spin'; S.choice = null; S.forkPick = null; S.script = spins.slice();
  if (toward != null && T[node].next.length > 1) S.forkPick = T[node].next.indexOf(toward);   // already chose this road
  return P;
}
const types = (ev) => ev.map((e) => e.t);

// ------------------------------------------------------------ 1. the track is well formed
{
  ok(T.length > 120 && T.length < 160, `track has ${T.length} spaces`);
  eq([T[M.START].type, T[M.RETIRE].type, T[M.RETIRE].next.length], ['start', 'retire', 0], 'starts at Start, ends at Retirement, nothing after it');
  ok(T.every((n, i) => n.id === i), 'ids are positions');
  ok(T.every((n) => n.next.every((j) => j > n.id)), 'every edge goes forward (no loops, so every walk ends)');
  ok(T.every((n) => n.id === M.RETIRE || n.next.length >= 1), 'only Retirement is a dead end');
  ok(T.every((n) => n.next.length <= 2), 'at most two roads out of any space');
  const forks = T.filter((n) => n.next.length === 2);
  eq(forks.map((n) => n.fork), ['school', 'family', 'town', 'risk'], 'four forks: school, family, town, risk');
  ok(forks.every((n) => n.options.length === 2 && n.options.every((o, k) => o.first === n.next[k])), 'each fork lists its two roads in edge order');
  // Every path, every branch combination, reaches Retirement; count them and their lengths.
  const paths = [];
  const walk = (id, len) => { const n = T[id]; if (!n.next.length) { paths.push([id, len]); return; } for (const j of n.next) walk(j, len + 1); };
  walk(M.START, 0);
  ok(paths.length === 16 && paths.every(([id]) => id === M.RETIRE), `all ${paths.length} branch combinations end at Retirement`);
  const lens = paths.map((p) => p[1]).sort((a, b) => a - b);
  ok(lens[0] >= 95 && lens[lens.length - 1] <= 120, `journeys are ${lens[0]} to ${lens[lens.length - 1]} spaces long`);
  // Every space is reachable from Start.
  const seen = new Set([M.START]); const q = [M.START];
  while (q.length) { const n = T[q.shift()]; for (const j of n.next) if (!seen.has(j)) { seen.add(j); q.push(j); } }
  ok(seen.size === T.length, 'every space is reachable from Start');
  // The two roads of each fork rejoin at the same space, and only there.
  for (const f of forks) {
    const ends = f.options.map((o) => { let id = o.first; while (T[id].road === o.key) id = T[id].next[0]; return id; });
    const roads = f.options.map((o) => T.filter((n) => n.road === o.key));
    ok(ends[0] === ends[1] && T[ends[0]].lane === 0, `${f.fork} fork: both roads rejoin at space ${ends[0]}`);
    ok(roads.every((r) => r.every((n) => n.next.length === 1)), `${f.fork} fork: no side exits along its roads`);
    eq(T.filter((n) => n.next.includes(ends[0])).length, 2, `${f.fork} fork: exactly the two road ends lead into the rejoin`);
  }
  // Every stop type and space type has a description and every space type is used.
  const used = new Set(T.map((n) => n.type));
  ok([...used].every((t) => M.SPACE_INFO[t]), 'every space type has a name and description');
  ok(Object.keys(M.STOPS).every((t) => used.has(t)), 'every stop type appears on the board');
  // Geometry: spaces never overlap one another.
  // Drawn radii: 15.5 for a space, 24 for a stop's ring. Inner lanes on a bend are the tightest spot.
  const rad = (n) => (M.STOPS[n.type] || n.type === 'start' ? 24 : 15.5);
  let minGap = Infinity;
  for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) minGap = Math.min(minGap, Math.hypot(T[i].x - T[j].x, T[i].y - T[j].y) - rad(T[i]) - rad(T[j]));
  ok(minGap >= 2, `drawn spaces never touch (smallest gap ${minGap.toFixed(1)} units)`);
  ok(T.every((n) => n.x > 20 && n.x < M.WORLD.W - 20 && n.y > 20 && n.y < M.WORLD.H - 20), 'every space is inside the world');
}

// ------------------------------------------------------------ 2. moving, stop spaces, pay days
{
  // Start is a fork: the first thing a player does is choose a road, before spinning.
  const S = game(2);
  eq([S.phase, S.choice.kind, S.choice.pre], ['choose', 'path', true], 'a new game opens with the road choice at Start');
  ok(!M.spin(S), 'cannot spin before choosing the road');
  ok(!M.choose(S, 'nonsense'), 'an unknown option is refused');
  M.choose(S, 'work'); S.script = [3];
  M.spin(S);
  // Work road: the first space is the First Job stop, so a 3 stops after one step.
  eq([S.players[0].node, S.phase, S.choice.kind], [first('job').id, 'choose', 'career'], 'First Job stops a car mid-move (spin 3, moved 1)');
  eq(S.choice.opts.length, 2, 'two careers to pick from');
  ok(S.choice.opts.every((o) => !M.CAREER[o.id.slice(2)].degree), 'no-degree careers only');
  const pick = S.choice.opts[0].id.slice(2);
  M.choose(S, S.choice.opts[0].id);
  eq([S.players[0].career, S.cur, S.phase], [pick, 1, 'choose'], 'career taken; turn passes to the next player (also at the fork)');
}
{
  // College road costs tuition up front, borrowing what is missing.
  const S = game(2);
  M.choose(S, 'college');
  eq([S.players[0].cash, S.players[0].loans], [0, 1], 'college: ₹100K fees from ₹50K cash = one ₹50K loan, cash 0');
  S.script = [10]; M.spin(S);
  eq(S.players[0].node, first('event', 'college').id + 9, 'spin 10 on the college road moves 10 spaces');
  ok(!S.players[0].career, 'no career yet on the college road');
}
{
  // Graduation stops you even with steps left, and offers degree careers.
  const S = game(2);
  const grad = first('grad');
  const P = at(S, grad.id - 2, [9], null);
  P.career = null;
  M.spin(S);
  eq([P.node, S.choice.kind, P.degree], [grad.id, 'career', true], 'Graduation Day stops a 9 after 2 steps and grants the degree');
  ok(S.choice.opts.every((o) => M.CAREER[o.id.slice(2)].degree), 'graduates choose from degree careers');
}
{
  // Pay day pays when passed, and when landed on, once per pass.
  const S = game(2);
  const pd = T.find((n) => n.type === 'payday' && n.lane === 0 && T[n.next[0]].type !== 'payday' && !M.STOPS[T[n.next[0]].type] && T[n.next[0]].type !== 'event' && T[n.next[0]].next.length === 1);
  const before = prevOf(pd.id);
  let P = at(S, before.id, [2]);
  const c0 = P.cash; S.ev = [];
  M.spin(S);
  const pays = S.ev.filter((e) => e.t === 'payday');
  ok(pays.length === 1 && pays[0].n === 65, 'passing a pay day pays the salary once (Teacher, ₹65K)');
  const S2 = game(2); P = at(S2, before.id, [1]); const c1 = P.cash; S2.ev = [];
  M.spin(S2);
  eq([P.node, P.cash - c1, S2.ev.filter((e) => e.t === 'payday').length], [pd.id, 65, 1], 'landing on a pay day pays once');
  ok(c0 >= 0, '');
  // A raise adds to every later pay day.
  const S3 = game(2); P = at(S3, before.id, [1]); P.raise = 15; const c3 = P.cash;
  M.spin(S3);
  eq(P.cash - c3, 80, 'a ₹15K raise makes a Teacher pay day ₹80K');
  // No career, no pay.
  const S4 = game(2); P = at(S4, before.id, [1], null); P.career = null; const c4 = P.cash;
  M.spin(S4); eq(P.cash, c4, 'a pay day pays nothing to someone with no job yet');
}
{
  // Count pay days on a scripted drive: every one passed is paid.
  const S = game(2);
  let P = at(S, first('payday').id - 1, []);
  const start = P.node, c0 = P.cash;
  S.script = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1].map(() => 1);
  const want = T.slice(start + 1, start + 6).filter((n) => n.type === 'payday').length;
  S.script = [5];
  // land may draw an event or a tile; isolate the pay days
  M.spin(S);
  eq(S.ev.filter((e) => e.t === 'payday').length, want, `a 5-space drive passes ${want} pay day(s) and is paid for each`);
  ok(c0 !== undefined, '');
}
{
  // A fork passed mid-move asks for the road on the way, then finishes the move on the chosen road.
  const S = game(2);
  const fork = T.find((n) => n.fork === 'risk');
  const P = at(S, fork.id - 1, [4]);
  M.spin(S);
  eq([P.node, S.phase, S.choice.kind, S.choice.pre, S.moveLeft], [fork.id, 'choose', 'path', false, 3], 'passing the risk fork stops for the choice with 3 steps left');
  M.choose(S, 'steady');
  const steadyFirst = fork.options.find((o) => o.key === 'steady').first;
  eq([P.node, P.roads.risk], [steadyFirst + 2, 'steady'], 'then drives the 3 remaining steps down the steady road');
  // The road event names its fork: by the time the UI shows it the car is already down the road (this crashed the board once).
  const road = S.ev.filter((e) => e.t === 'road').pop();
  eq([road.node, T[road.node].options.some((o) => o.key === road.key)], [fork.id, true], 'the road event carries the fork it was chosen at');
  // And a car that stopped on a fork chooses at the start of its next turn.
  const S2 = game(2); const Q = at(S2, fork.id, []);
  M.endTurn(S2); M.endTurn(S2);
  eq([S2.cur, S2.phase, S2.choice && S2.choice.pre], [0, 'choose', true], 'a car sitting on a fork chooses before spinning');
  M.choose(S2, 'startup'); S2.script = [2]; M.spin(S2);
  eq(Q.node, fork.options.find((o) => o.key === 'startup').first + 1, 'and its spin follows the startup road');
}
{
  // Quick games move double; stops still stop.
  const S = game(2, { quick: true });
  const P = at(S, first('event', undefined).id, [3]);
  P.node = T.find((n) => n.lane === 0 && n.type === 'payday').id;
  const from = P.node;
  let dist = 0, id = from; while (dist < 6 && !M.STOPS[T[T[id].next[0]].type] && T[id].next.length === 1) { id = T[id].next[0]; dist++; }
  M.spin(S);
  eq(P.node, id, `quick game: a spin of 3 moves ${dist} spaces`);
}
{
  // Retirement stops a car with steps to spare.
  const S = game(2);
  const P = at(S, M.RETIRE - 2, [10]);
  M.spin(S);
  eq([P.node, S.choice.kind], [M.RETIRE, 'retire'], 'Retirement stops a spin of 10 after 2 steps');
}

// ------------------------------------------------------------ 3. money and loans
{
  const S = game(2);
  const P = S.players[0]; P.cash = 30;
  M.pay(S, 0, 120, 'test');
  eq([P.cash, P.loans], [10, 2], 'paying ₹120K with ₹30K borrows two ₹50K loans and leaves ₹10K');
  M.pay(S, 0, 10, 'test');
  eq([P.cash, P.loans], [0, 2], 'paying exactly what you have needs no loan');
  S.phase = 'spin'; S.cur = 0;
  ok(!M.repayLoan(S), 'cannot repay a loan without ₹50K in hand');
  M.takeLoan(S); eq([P.cash, P.loans], [50, 3], 'a manual loan adds ₹50K');
  ok(M.repayLoan(S), 'repaying before a spin is allowed');
  eq([P.cash, P.loans], [0, 2], 'repaying costs ₹50K and clears one loan');
  S.phase = 'choose';
  ok(!M.takeLoan(S) && !M.repayLoan(S), 'no banking in the middle of a choice');
}

// ------------------------------------------------------------ 4. every space type
{
  const run = (type, road, script = [], setup) => {
    const S = game(3); const target = first(type, road); const P = at(S, prevOf(target.id).id, [1].concat(script), 'teacher', target.id); P.cash = 1000;
    if (setup) setup(S, P);
    const c = S.players.map((Q) => Q.cash); S.ev = [];
    M.spin(S);
    return { S, P, d: S.players.map((Q, i) => Q.cash - c[i]) };
  };
  let r = run('life'); eq([r.P.tiles.length, r.S.cur], [1, 1], 'Life Tile space: one tile, turn over');
  r = run('baby'); eq([r.P.kids, r.d], [1, [10, -5, -5]], 'Baby: one more peg, ₹5K gift from each of the two others');
  r = run('twins'); eq([r.P.kids, r.d], [2, [20, -10, -10]], 'Twins: two pegs, two gifts from each');
  r = run('twins', undefined, [], (S, P) => { P.kids = 3; }); eq([r.P.kids, r.P.tiles.length], [4, 1], 'Twins with one seat left: the car fills up and the extra becomes a life tile');
  r = run('trip'); eq([r.d[0], r.P.tiles.length], [-20, 1], 'Big Trip: pay ₹20K, take a tile');
  r = run('pet'); eq(r.P.tiles.length, 1, 'A dog adopts you: a tile');
  r = run('festival'); eq(r.d, [20, -10, -10], 'Festival Night: ₹10K from each other player');
  r = run('burn'); eq(r.d[0], -40, 'Burn rate: pay ₹40K');
  r = run('investor', undefined, [6]); eq(r.d[0], 120, 'Investor call, spin 6: +₹120K');
  r = run('investor', undefined, [5]); eq(r.d[0], -20, 'Investor call, spin 5: −₹20K');
  r = run('pitch', undefined, [3]); eq(r.d[0], -60, 'Pitch Day, spin 3: investors pass, −₹60K');
  r = run('pitch', undefined, [4]); eq(r.d[0], 100, 'Pitch Day, spin 4: small deal +₹100K');
  r = run('pitch', undefined, [8]); eq([r.d[0], r.P.tiles.length], [400, 1], 'Pitch Day, spin 8: +₹400K and a tile');
  r = run('event'); ok(r.S.ev.some((e) => e.t === 'card'), 'Life Event space draws a card');
}
{
  // Weddings: the three options, gifts included.
  const opt = (id) => { const S = game(3); const w = first('wedding'); const P = at(S, w.id - 1, [1]); P.cash = 200; S.players.forEach((Q) => { if (Q !== P) Q.cash = 100; }); M.spin(S); M.choose(S, id); return { S, P }; };
  let r = opt('big'); eq([r.P.cash, r.P.tiles.length, r.P.spouse, r.S.players[1].cash, r.S.players[2].cash], [120, 2, true, 90, 90], 'big wedding: −₹100K, +₹10K from each other player, two memories, partner');
  r = opt('small'); eq([r.P.cash, r.P.tiles.length, r.P.spouse], [185, 1, true], 'small ceremony: −₹15K, one tile, partner');
  r = opt('single'); eq([r.P.cash, r.P.tiles.length, r.P.spouse], [210, 1, false], 'not now: +₹10K saved, one tile, no partner');
}
{
  // Houses: buy at Find a Home (with a loan when short), sell by spin, the deck stays whole.
  const S = game(2);
  const P = at(S, first('home').id - 1, [1]);
  P.cash = 40;
  M.spin(S);
  eq([S.choice.kind, S.choice.opts.length, S.choice.opts[2].id], ['house', 3, 'rent'], 'Find a Home offers two houses or keep renting');
  const h = S.choice.opts[0].house, H = M.HOUSE[h];
  M.choose(S, 'h:' + h);
  const loans = Math.ceil((H.price - 40) / M.LOAN);
  eq([P.houses, P.loans, P.cash], [[h], loans, 40 + loans * M.LOAN - H.price], `buying the ${H.name} (${H.price}) with ₹40K borrows ${loans} loans`);
  eq(S.decks.house.length + 1, M.HOUSES.length, 'the unchosen house goes back to the deck');
  S.cur = 0; S.phase = 'spin'; S.script = [5];
  const c = P.cash; M.sellHouse(S, 0, 0);
  eq([P.cash - c, P.houses.length, S.decks.house.length], [H.low, 0, M.HOUSES.length], 'selling on a spin of 5 gets the low price and returns the card');
  P.houses.push(h); S.decks.house.splice(S.decks.house.indexOf(h), 1);
  S.script = [6]; const c2 = P.cash; M.sellHouse(S, 0, 0);
  eq(P.cash - c2, H.high, 'selling on a spin of 6 gets the high price');
  ok(M.HOUSES.every((x) => x.low < x.price && x.high > x.price && (x.low + x.high) / 2 > x.price), 'every house: low < price < high, and worth more than its price on average');
  // keep renting
  const S2 = game(2); const Q = at(S2, first('home').id - 1, [1]); M.spin(S2); const before = Q.cash; M.choose(S2, 'rent');
  eq([Q.houses.length, Q.cash, S2.decks.house.length], [0, before, M.HOUSES.length], 'keep renting: no house, no cost, both cards back');
}
{
  // Property Fair: buy, sell, or pass.
  const S = game(2);
  const P = at(S, first('fair').id - 1, [1]);
  P.houses = ['tinroof']; S.decks.house = S.decks.house.filter((x) => x !== 'tinroof');
  M.spin(S);
  eq(S.choice.opts.map((o) => o.id), ['buy', 'sell:0', 'pass'], 'the fair offers buy, sell each house, or walk past');
  S.script = [9]; const c = P.cash;
  M.choose(S, 'sell:0');
  eq([P.cash - c, P.houses.length], [160, 0], 'selling the Tin-Roof Bungalow on a 9: +₹160K');
  const S2 = game(2); const Q = at(S2, first('fair').id - 1, [1]); M.spin(S2); M.choose(S2, 'buy');
  eq([S2.choice.kind, S2.choice.why], ['house', 'fair'], 'buy at the fair shows two houses');
}
{
  // Midlife Crossroads: keep, switch, night school.
  const S = game(2);
  const P = at(S, first('crossroads').id - 1, [1], 'chef'); P.cash = 500; S.decks.basic = S.decks.basic.filter((x) => x !== 'chef');
  M.spin(S);
  eq(S.choice.opts.map((o) => o.id), ['keep', 'switch', 'night'], 'no degree: keep, switch or night school');
  const c = P.cash;
  M.choose(S, 'night');
  ok(P.degree && c - P.cash === M.NIGHT_SCHOOL && S.choice.kind === 'career' && S.choice.opts.some((o) => o.id === 'keep'), 'night school costs ₹60K, grants the degree, then degree careers or keep');
  const pick = S.choice.opts[0].id.slice(2);
  M.choose(S, 'c:' + pick);
  ok(P.career === pick && S.decks.basic.includes('chef'), 'the old career card goes back to its deck');
  const S2 = game(2); const Q = at(S2, first('crossroads').id - 1, [1], 'doctor'); Q.degree = true; S2.decks.degree = S2.decks.degree.filter((x) => x !== 'doctor'); M.spin(S2);
  eq(S2.choice.opts.map((o) => o.id), ['keep', 'switch'], 'with a degree: keep or switch');
  M.choose(S2, 'switch'); M.choose(S2, 'keep');
  ok(Q.career === 'doctor' && S2.decks.degree.length === M.CAREERS.filter((x) => x.degree).length - 1, 'switch then keep changes nothing and returns both cards');
  // careers are unique: dealt cards never appear twice
  const all = S2.decks.degree.concat(S2.decks.basic, S2.players.map((x) => x.career).filter(Boolean));
  eq(new Set(all).size, all.length, 'no career card is ever duplicated');
}

// ------------------------------------------------------------ 5. every event card
{
  ok(M.EVENTS.length >= 30, `${M.EVENTS.length} event cards`);
  eq(new Set(M.EVENTS.map((e) => e.id)).size, M.EVENTS.length, 'card ids are unique');
  for (const E of M.EVENTS) {
    for (const spin of E.fx.some((f) => f.k === 'spin') ? [1, 10] : [0]) {
      const S = game(3); S.cur = 0;
      const P = S.players[0]; P.cash = 500; P.kids = 2; P.houses = ['tinroof', 'studio']; P.career = 'teacher';
      S.players[1].cash = 100; S.players[2].cash = 3;   // player 2 must borrow to pay a gift
      if (spin) S.script = [spin];
      const c = S.players.map((Q) => Q.cash), t0 = P.tiles.length, r0 = P.raise, l2 = S.players[2].loans;
      M.applyFx(S, 0, E.fx);
      let want = 0, tiles = 0, raise = 0, each = 0;
      for (const f of E.fx) {
        if (f.k === 'gain') want += f.n; else if (f.k === 'pay') want -= f.n; else if (f.k === 'tile') tiles++;
        else if (f.k === 'raise') raise += f.n; else if (f.k === 'kidGain') want += 2 * f.n; else if (f.k === 'kidPay') want -= 2 * f.n;
        else if (f.k === 'housePay') want -= 2 * f.n; else if (f.k === 'collect') { want += 2 * f.n; each += f.n; }
        else if (f.k === 'spin') want += spin >= f.at ? f.win : -f.lose;
      }
      const got = [P.cash - c[0], P.tiles.length - t0, P.raise - r0, c[1] - S.players[1].cash];
      eq(got, [want, tiles, raise, each], `card "${E.title}"${spin ? ' (spin ' + spin + ')' : ''}`);
      if (each) ok(S.players[2].loans > l2 && S.players[2].cash >= 0, `card "${E.title}": a player with ₹3K borrows to pay the gift`);
      ok(E.text.length > 20 && E.text.length < 160 && E.title.length < 24, `card "${E.title}": text fits the card`);
    }
  }
  // The deck cycles: draw 3 decks' worth, each card appears 3 times.
  const S = game(2); const n = M.EVENTS.length, seen = {};
  for (let i = 0; i < n * 3; i++) { S.ev = []; S.phase = 'spin'; S.cur = 0; const e = T.find((x) => x.type === 'event' && prevOf(x.id).next.length === 1); at(S, prevOf(e.id).id, [1]); M.spin(S); const c = S.ev.find((x) => x.t === 'card'); seen[c.id] = (seen[c.id] || 0) + 1; }
  ok(Object.keys(seen).length === n && Object.values(seen).every((v) => v === 3), 'the event deck reshuffles: three passes draw every card three times');
}

// ------------------------------------------------------------ 6. retirement and scoring
{
  const S = game(3);
  const P = at(S, M.RETIRE - 1, [1]);
  P.cash = 200; P.loans = 3; P.houses = ['tinroof', 'mansion']; P.tiles = [0, 39];   // tiles worth 50 + 250
  S.decks.house = S.decks.house.filter((h) => !P.houses.includes(h));
  M.spin(S);
  S.script = [9, 2];   // houses: tinroof spin 9 (high 160), mansion spin 2 (low 380)
  M.choose(S, 'hill');
  // 200 + bonus 100 (first) + pension 40 + 160 + 380 - 3*60
  eq([P.retired, P.cash, P.loans, P.houses.length, P.place], [true, 200 + 100 + 40 + 160 + 380 - 180, 0, 0, 0], 'retiring first to the hills: bonus, pension, houses sold by spin, loans settled at ₹60K each');
  eq(P.final, P.cash + 300, 'final worth = cash + life tiles');
  eq(S.cur, 1, 'the retired player is skipped from now on');
  const Q = at(S, M.RETIRE - 1, [1]); Q.cash = 0; Q.loans = 1;
  M.spin(S); S.script = [7]; M.choose(S, 'coast');
  eq([Q.cash, Q.place], [60 + 100 - 60, 1], 'second to retire, by the sea, spin 7: +₹60K bonus, +₹100K, −₹60K loan');
  const R = at(S, M.RETIRE - 1, [1]); R.cash = 10;
  M.spin(S); S.script = [2]; M.choose(S, 'coast');
  eq(R.cash, 10 + 40 - 20, 'third, by the sea, spin 2: +₹40K bonus, −₹20K repairs');
  eq([S.phase, S.endReason, S.winner], ['over', 'retired', 0], 'when everyone has retired the game is over and the richest wins');
  eq(S.result.map((r) => r.i), [0, 1, 2], 'ranked by final worth');
  eq(M.RETIRE_BONUS.slice(0, 3), [100, 60, 40], 'bonuses 100, 60, 40 by order');
  // A cash shortfall at settlement is the one negative cash allowed, and it counts.
  const S2 = game(2); const X = at(S2, M.RETIRE - 1, [1]); X.cash = 0; X.loans = 5; M.spin(S2); M.choose(S2, 'hill');
  eq(X.cash, 100 + 40 - 300, 'five loans at retirement can leave you below zero, and that is the final count');
  // Ties: more life tiles wins.
  const S3 = game(2); S3.players[0].cash = 100; S3.players[1].cash = 50; S3.players[1].tiles = [0]; S3.players[0].tiles = [];
  S3.players.forEach((Y) => { Y.retired = true; });
  eq(M.ranking(S3).map((r) => r.i), [1, 0], 'a tie on worth goes to the player with more life tiles');
  ok(M.TILES.length === 40 && M.TILES.every((t) => t.value >= 50 && t.value <= 250), '40 life tiles worth ₹50K to ₹250K');
  const S4 = game(2); S4.decks.tile = []; const id = M.choose && (() => { M.applyFx(S4, 0, [{ k: 'tile' }]); return S4.players[0].tiles[0]; })();
  eq([id, M.tileValue(id)], [M.SPARE_TILE, 50], 'an empty tile pile still pays a ₹50K tile');
}

// ------------------------------------------------------------ 7. computer players
{
  // Each personality answers every kind of choice with a legal option.
  let bad = 0, n = 0;
  for (const kind of ['cautious', 'risky']) for (let seed = 1; seed <= 40; seed++) {
    const S = M.newGame({ seed, players: [{ name: 'a', kind }, { name: 'b', kind }] });
    while (S.phase !== 'over' && S.steps < 5000) {
      if (S.phase === 'choose') { const id = M.aiChoose(S); n++; if (!S.choice.opts.some((o) => o.id === id)) bad++; S.rng = (S.rng + 1) >>> 0; }
      M.aiAct(S); S.ev = [];
    }
  }
  ok(bad === 0, `computer choices are always legal (${n} choices checked)`);
  // Style shows: risky takes the startup and the big wedding far more often than cautious.
  const share = (kind, f) => { let k = 0; for (let s = 1; s <= 200; s++) { const S = M.simulate(s, [kind, kind]); k += S.players.filter(f).length; } return k / 400; };
  const st = [share('risky', (P) => P.roads.risk === 'startup'), share('cautious', (P) => P.roads.risk === 'startup')];
  ok(st[0] > 0.6 && st[1] < 0.3, `startup road: risky ${(st[0] * 100).toFixed(0)}%, cautious ${(st[1] * 100).toFixed(0)}%`);
  const bw = [share('risky', (P) => P.wedding === 'big'), share('cautious', (P) => P.wedding === 'big')];
  ok(bw[0] > bw[1] + 0.3, `big wedding: risky ${(bw[0] * 100).toFixed(0)}%, cautious ${(bw[1] * 100).toFixed(0)}%`);
  const ln = [share('risky', (P) => P.dest === 'coast'), share('cautious', (P) => P.dest === 'coast')];
  eq(ln, [1, 0], 'risky retires to the coast, cautious to the hills');
  // aiAct leaves human seats alone unless forced
  const S = game(2); ok(!M.aiAct(S) && M.aiAct(S, true), 'aiAct does nothing for a human seat unless forced');
}

// ------------------------------------------------------------ 8. determinism and saves
{
  const a = M.simulate(77, ['cautious', 'risky', 'risky']), b = M.simulate(77, ['cautious', 'risky', 'risky']);
  eq(a.result, b.result, 'the same seed plays the same game');
  // Save mid-game, resume, and the rest plays out identically.
  const S = M.newGame({ seed: 5, players: [{ name: 'a', kind: 'cautious' }, { name: 'b', kind: 'risky' }] });
  for (let i = 0; i < 40; i++) { M.aiAct(S); S.ev = []; }
  const text = M.serialize(S);
  const R = M.deserialize(text);
  ok(R && R.cur === S.cur && R.rng === S.rng && JSON.stringify(R.players) === JSON.stringify(S.players), 'a save round-trips');
  while (S.phase !== 'over') { M.aiAct(S); S.ev = []; }
  while (R.phase !== 'over') { M.aiAct(R); R.ev = []; }
  eq(R.result, S.result, 'a resumed game ends exactly as the original');
  const good = JSON.parse(text);
  const broken = [
    'not json', '', 'null', '[]', JSON.stringify(Object.assign({}, good, { v: 0 })),
    JSON.stringify(Object.assign({}, good, { players: [good.players[0]] })),
    JSON.stringify(Object.assign({}, good, { players: good.players.map((P) => Object.assign({}, P, { node: 9999 })) })),
    JSON.stringify(Object.assign({}, good, { players: good.players.map((P) => Object.assign({}, P, { career: 'astronaut' })) })),
    JSON.stringify(Object.assign({}, good, { players: good.players.map((P) => Object.assign({}, P, { houses: ['castle'] })) })),
    JSON.stringify(Object.assign({}, good, { players: good.players.map((P) => Object.assign({}, P, { cash: 'lots' })) })),
    JSON.stringify(Object.assign({}, good, { phase: 'choose', choice: null })),
    JSON.stringify(Object.assign({}, good, { phase: 'dancing' })),
    JSON.stringify(Object.assign({}, good, { cur: 7 })),
    JSON.stringify(Object.assign({}, good, { decks: null })),
    JSON.stringify(Object.assign({}, good, { decks: Object.assign({}, good.decks, { event: ['nope'] }) })),
  ];
  ok(broken.every((t) => M.deserialize(t) === null), `${broken.length} broken or old saves are all rejected (never a crash)`);
}

// ------------------------------------------------------------ 9. original names, and the shared snippets
{
  const banned = /game of life|hasbro|milton bradley|millionaire (acres|estates)|countryside acres|spin to win|life tiles?|day of reckoning|share the wealth|jeevan|yatra/i;
  const page = html.replace(/<style>[\s\S]*?<\/style>/g, '');
  ok(!banned.test(page), 'no trademarked names or phrases anywhere in the page' + (page.match(banned) ? ' -- found "' + page.match(banned)[0] + '"' : ''));
  const tetris = fs.readFileSync(path.join(__dirname, '..', '..', 'tetris', 'index.html'), 'utf8');
  const hsBlock = (s) => { const a = s.indexOf('// ---------- dgames high scores ----------'); const f = s.indexOf('function makeHiScores(', a); return s.slice(a, s.indexOf('\n}\n', f) + 3); };
  const backBlock = (s) => { const a = s.lastIndexOf('<style>', s.indexOf('/* dgames: the way back')); const e = s.indexOf('</a>', s.indexOf('<a class="dg-home"')); return s.slice(a, e + 4); };
  ok(hsBlock(html) === hsBlock(tetris) && hsBlock(html).length > 4000, 'high-score module is byte-identical to tetris (' + hsBlock(html).length + ' bytes)');
  ok(backBlock(html) === backBlock(tetris) && backBlock(html).length > 800, 'back button is byte-identical to tetris (' + backBlock(html).length + ' bytes)');
  ok(!html.includes('\r'), 'LF line endings');
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
