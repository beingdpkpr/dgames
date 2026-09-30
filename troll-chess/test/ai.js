// Headless check of the computer player. Loads the pure section of index.html (everything above
// `// ---------- UI ----------`) and plays whole games computer against computer.
// Run: node test/ai.js
//
// The engine throws on any action the rules do not allow, so a finished game is also proof that every
// action the computer chose was legal: every move, revive square and Wild placement, across Reverses.
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { Math, console, Array, Object, Number, String, JSON, Set, Map, Error, RegExp, Infinity };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const C = ctx.__cc;

let failures = 0, checks = 0;
const assert = (ok, msg) => { checks++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures++; };
const sq = (name) => (8 - +name[1]) * 8 + C.FILES.indexOf(name[0]);
function rngFrom(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function game(fen, cards) {
  const s = C.newGame({ seed: 5, p0: 'w' });
  const f = C.fromFEN(fen); s.pos = f.pos; s.turn = f.turn === 'w' ? 0 : 1;
  for (const k of cards.slice().reverse()) s.deck.push({ k, col: 'r' });
  return s;
}

// ---------------------------------------------------------------- 1. it sees the obvious
{
  // Black left its king in check (it drew a Skip); White holds a 1 and must take the king.
  const s = game('4k3/8/8/8/8/8/8/4R1K1 w - - 0 1', ['1']);
  C.draw(s);
  for (const lv of ['easy', 'normal', 'hard']) {
    const a = C.aiAction(s, lv, rngFrom(1));
    assert(a.type === 'move' && a.m.to === sq('e8'), `${lv}: takes a king that was left in check`);
  }
  // A queen hangs for nothing.
  const h = game('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1', ['1']);
  C.draw(h);
  for (const lv of ['normal', 'hard']) {
    const a = C.aiAction(h, lv, rngFrom(2));
    assert(a.type === 'move' && a.m.from === sq('d1') && a.m.to === sq('d5'), `${lv}: takes a hanging queen`);
  }
  // Its own queen is attacked by a pawn: move it.
  const q = game('4k3/8/8/8/2p5/3Q4/8/4K3 w - - 0 1', ['1']);
  C.draw(q);
  C.apply(q, C.aiAction(q, 'normal', rngFrom(3)));
  const qAt = q.pos.b.indexOf('wQ');
  assert(qAt >= 0 && !C.attacked(q.pos, qAt, 'b'), 'normal: does not leave its queen where the pawn takes it');
  // Draw 2 brings the most valuable piece back.
  const r = game('4k3/8/8/8/8/8/8/4K3 w - - 0 1', ['d2']);
  r.captured.w = ['P', 'Q', 'N'];
  C.draw(r);
  const rv = C.aiAction(r, 'normal', rngFrom(4));
  assert(rv.type === 'revive' && rv.t === 'Q' && C.reviveTargets(r, 'Q').includes(rv.sq), 'normal: revives the queen first, on an allowed square');
  // In check with a Wild: it uses it to get out (or at least ends out of check).
  const w = game('4k3/8/8/8/8/8/3PPP2/r3K3 w - - 0 1', ['wild']);
  C.draw(w);
  const wa = C.aiAction(w, 'normal', rngFrom(5));
  let out = false;
  if (wa.type === 'wild') { C.apply(w, wa); out = !C.inCheck(w.pos, 'w'); }
  assert(out, 'normal: in check with a Wild, it places a piece so the king is safe');
}

// ---------------------------------------------------------------- 2. whole games
function play(levels, seed, maxTurns) {
  const s = C.newGame({ seed, p0: seed % 2 ? 'w' : 'b' });
  const rand = rngFrom(seed * 7 + 1);
  let actions = 0, worst = 0, reverses = 0, revives = 0, wilds = 0;
  while (s.phase !== 'over' && s.turnNo <= maxTurns) {
    const lv = levels[s.turn];
    const t = Date.now();
    const a = C.aiAction(s, lv, rand);
    worst = Math.max(worst, Date.now() - t);
    const before = s.phase;
    const card = C.apply(s, a);
    if (a.type === 'draw' && card.k === 'rev') reverses++;
    if (a.type === 'revive') revives++;
    if (a.type === 'wild') wilds++;
    if (before === 'draw' && s.phase === 'draw' && a.type !== 'draw') throw new Error('stuck');
    if (++actions > maxTurns * 8) throw new Error('too many actions');
  }
  return { s, actions, worst, reverses, revives, wilds };
}
{
  let finished = 0, errors = 0, played = 0, rev = 0, revv = 0, wl = 0, turns = 0, worst = 0;
  const pairs = [['easy', 'easy'], ['normal', 'easy'], ['easy', 'normal'], ['normal', 'normal']];
  for (let seed = 1; seed <= 24; seed++) {
    try {
      const r = play(pairs[seed % pairs.length], seed, 250);
      played++; rev += r.reverses; revv += r.revives; wl += r.wilds; worst = Math.max(worst, r.worst);
      if (r.s.phase === 'over') { finished++; turns += r.s.turnNo; }
    } catch (e) { errors++; console.log('     seed ' + seed + ': ' + e.message); }
  }
  assert(errors === 0, `24 games of easy/normal play through with every action accepted by the rules (${rev} Reverses, ${revv} revives, ${wl} Wilds)`);
  assert(finished >= 20, `${finished}/24 end in a win inside 250 turns (average ${finished ? Math.round(turns / finished) : 0} turns)`);
  assert(worst < 1500, `slowest easy/normal decision ${worst}ms`);
}
{
  // Hard is the slow one: time a stretch of real play.
  let worst = 0, errors = 0, total = 0, n = 0;
  for (const seed of [101, 102]) {
    try {
      const s = C.newGame({ seed, p0: 'w' });
      const rand = rngFrom(seed);
      while (s.phase !== 'over' && s.turnNo <= 30) {
        const t = Date.now();
        const a = C.aiAction(s, s.turn === 0 ? 'hard' : 'normal', rand);
        const dt = Date.now() - t;
        if (s.turn === 0 && a.type === 'move') { worst = Math.max(worst, dt); total += dt; n++; }
        C.apply(s, a);
      }
    } catch (e) { errors++; console.log('     hard seed ' + seed + ': ' + e.message); }
  }
  assert(errors === 0, 'hard plays 30 turns against normal with every action accepted');
  assert(worst < 4000, `hard: slowest move ${worst}ms, average ${n ? Math.round(total / n) : 0}ms over ${n} moves`);
}
{
  // Hard should beat easy most of the time. Card luck is real, so the bar is a majority, not a sweep.
  let hardWins = 0, games = 0;
  for (let seed = 201; seed <= 206; seed++) {
    const r = play(seed % 2 ? ['hard', 'easy'] : ['easy', 'hard'], seed, 200);
    if (r.s.phase !== 'over') continue;
    games++;
    const hardSeat = seed % 2 ? 0 : 1;
    if (r.s.winner === hardSeat) hardWins++;
  }
  assert(games >= 4 && hardWins > games / 2, `hard beats easy in ${hardWins}/${games} finished games`);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
