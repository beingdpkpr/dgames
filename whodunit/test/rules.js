// The rules, headless. Lifts everything above the `// ---------- UI ----------` marker in index.html into
// node's vm: dealing, the board graph and movement (doors, blocking, secret passages), suggestions and
// the order of answers, accusations, the notebook's privacy, save/resume, and the shared back button.
// Run: node test/rules.js
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { Math, console, Array, Object, Number, String, JSON, Set, Map, Infinity, Int8Array, WeakMap, Error };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const M = ctx.__whodunit;
const { NS, NW, NR, NC, cellId } = M;
const W0 = NS, R0 = NS + NW;

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (cond) console.log('ok   ' + msg); else { failures++; console.log('FAIL ' + msg); } };
const t0 = Date.now();
const kinds = (n, k) => Array.from({ length: n }, (_, i) => ({ name: 'P' + i, kind: (k && k[i]) || 'hard' }));
const C = (x, y) => 'c' + cellId(x, y);
// Put a game into a known position: given hands, every token parked in a room unless placed.
function rig(S, hands, env) {
  S.envelope = env;
  S.players.forEach((P, p) => { P.hand = hands[p].slice().sort((a, b) => a - b); S.obs[p] = [{ t: 'hand', cards: P.hand.slice() }]; });
}

// ------------------------------------------------------------ dealing
{
  let bad = 0, unbalanced = 0, games = 0;
  for (let n = 3; n <= 6; n++) for (let seed = 1; seed <= 200; seed++) {
    const S = M.newGame({ seed, players: kinds(n) });
    games++;
    const [s, w, r] = S.envelope;
    if (M.cardType(s) !== 0 || M.cardType(w) !== 1 || M.cardType(r) !== 2) bad++;
    const all = S.envelope.concat(...S.players.map((P) => P.hand));
    if (all.length !== NC || new Set(all).size !== NC) bad++;
    const sizes = S.players.map((P) => P.hand.length);
    if (Math.max(...sizes) - Math.min(...sizes) > 1 || sizes.reduce((a, b) => a + b, 0) !== NC - 3) unbalanced++;
    if (S.obs.some((o, p) => o.length !== 1 || o[0].t !== 'hand' || o[0].cards.join() !== S.players[p].hand.join())) bad++;
  }
  ok(bad === 0, `${games} deals (3–6 players): one suspect, one weapon and one room in the envelope; every card dealt exactly once; each player starts knowing only their hand`);
  ok(unbalanced === 0, 'hands differ by at most one card and hold all 18 others');
  const counts = new Array(NC).fill(0);
  for (let seed = 1; seed <= 3000; seed++) M.newGame({ seed, players: kinds(4) }).envelope.forEach((c) => counts[c]++);
  const sus = counts.slice(0, NS), rooms = counts.slice(R0);
  ok(Math.min(...sus) > 3000 / NS * 0.8 && Math.max(...sus) < 3000 / NS * 1.2 && Math.min(...rooms) > 3000 / NR * 0.75, 'every suspect and room ends up in the envelope about equally often (3000 seeds)');
}

// ------------------------------------------------------------ the board
{
  let corr = 0; for (let y = 0; y < 19; y++) for (let x = 0; x < 19; x++) if (M.isCorr(x, y)) corr++;
  ok(corr === 361 - 9 * 25, 'nine 5×5 rooms and a gallery of ' + corr + ' squares');
  let doorsOk = true;
  M.ROOMS.forEach((R, r) => R.doors.forEach(([rx, ry, cx, cy]) => {
    if (M.ROOM_AT[cellId(rx, ry)] !== r || !M.isCorr(cx, cy) || Math.abs(rx - cx) + Math.abs(ry - cy) !== 1) doorsOk = false;
  }));
  ok(doorsOk, 'every door joins an edge square of its room to the gallery square beside it');
  ok(M.SUSPECTS.every((s) => M.isCorr(s.start[0], s.start[1]) && (s.start[0] % 18 === 0 || s.start[1] % 18 === 0)), 'every start square is on the gallery at the edge of the house');
  ok(M.ROOMS.filter((R) => R.passage >= 0).every((R, i, a) => M.ROOMS[R.passage].passage === M.ROOMS.indexOf(R)) && M.ROOMS.filter((R) => R.passage >= 0).length === 4, 'four corner rooms, joined in pairs by secret passages');
  ok(M.ROOM_DIST.every((row, a) => row.every((d, b) => a === b || (d < Infinity && d >= 3))), 'every room can be walked to from every other');
}

// ------------------------------------------------------------ movement
{
  const S = M.newGame({ seed: 3, players: kinds(4) });
  const park = () => { S.pos = S.pos.map(() => ({ r: 4 })); };
  const at = (s, x, y) => { S.pos[s] = { r: -1, x, y }; };
  const me = S.players[0].suspect;
  const targets = (steps) => [...M.reach(S, 0, steps).targets.keys()].sort();

  park(); S.pos[me] = { r: 0 };
  ok(targets(1).join() === [C(5, 2), C(2, 5)].sort().join(), 'leaving a room: a roll of 1 reaches exactly its door squares');
  ok(!targets(12).includes('r0'), 'you cannot end your move back in the room you left');
  park(); at(me, 5, 1);
  ok(!targets(1).includes('r0') && targets(1).length === 3, 'a gallery square beside a wall but not a door does not lead in');
  park(); at(me, 5, 2);
  ok(targets(1).includes('r0'), 'from the square outside a door, stepping in costs one step');
  park(); at(me, 6, 3);
  ok(targets(1).includes('r1') && targets(1).includes('r0') === false, 'the Library door opens off (6,3)');
  // blocking: another token on the Terrace's east door square
  park(); S.pos[me] = { r: 0 }; at((me + 1) % NS, 5, 2);
  ok(targets(1).join() === C(2, 5), 'a token on a door square blocks that door');
  park(); at(me, 5, 1); at((me + 1) % NS, 5, 2);
  ok(!targets(2).includes(C(5, 3)) && targets(4).includes(C(5, 3)), 'tokens block the gallery: the way round takes four steps instead of two');
  park(); at(me, 5, 1); at((me + 1) % NS, 5, 2);
  ok(!targets(6).includes(C(5, 2)), 'you cannot land on an occupied square');
  // paths are walks of single orthogonal steps, of the reported length, never longer than the roll
  let badPath = 0, tested = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const G = M.newGame({ seed, players: kinds(4) });
    for (let k = 0; k < 30; k++) {
      M.aiStep(G);
      if (G.phase !== 'move') continue;
      const R = M.reach(G, G.cur, G.roll);
      R.targets.forEach((d, key) => {
        tested++;
        const p = M.pathTo(R, key);
        if (p.length - 1 !== d || d > G.roll || d < 1) badPath++;
        for (let i = 1; i < p.length; i++) {
          const a = p[i - 1], b = p[i];
          if (a[0] === 'c' && b[0] === 'c') { const ca = +a.slice(1), cb = +b.slice(1); if (Math.abs(ca % 19 - cb % 19) + Math.abs(Math.floor(ca / 19) - Math.floor(cb / 19)) !== 1) badPath++; }
          else if (b[0] === 'r' && !M.DOORS_AT[+a.slice(1)].includes(+b.slice(1))) badPath++;
          else if (a[0] === 'r' && !M.ROOMS[+a.slice(1)].doors.some((d2) => cellId(d2[2], d2[3]) === +b.slice(1))) badPath++;
          if (i < p.length - 1 && p[i][0] === 'r') badPath++;
        }
      });
    }
  }
  ok(badPath === 0 && tested > 1000, `${tested} reachable targets: every path is single steps through the gallery, enters and leaves rooms by doors, passes through no room, and is no longer than the roll`);
  // the secret passages
  const P = M.newGame({ seed: 4, players: kinds(3) });
  P.pos[P.players[0].suspect] = { r: 0 };
  ok(M.canPassage(P) && M.takePassage(P) && M.roomOf(P, 0) === 8 && P.phase === 'suggest', 'Rooftop Terrace → Cellar by the passage, and you may suggest there');
  const Q = M.newGame({ seed: 4, players: kinds(3) });
  Q.pos[Q.players[0].suspect] = { r: 1 };
  ok(!M.canPassage(Q) && !M.takePassage(Q), 'the Library has no passage');
  Q.pos[Q.players[0].suspect] = { r: 2 };
  ok(M.takePassage(Q) && M.roomOf(Q, 0) === 6, 'Prayer Room → Stables');
  // moveTo validates
  const V = M.newGame({ seed: 5, players: kinds(3) });
  M.roll(V);
  ok(!M.moveTo(V, 'r99') && !M.moveTo(V, C(9, 9)) && V.phase === 'move', 'moves to squares that are not lit are refused');
  ok(M.moveTo(V, V.targets[0]), 'a lit square is accepted');
}

// ------------------------------------------------------------ suggestions and answers
{
  const S = M.newGame({ seed: 9, players: kinds(4, ['hard', 'hard', 'human', 'hard']) });
  const s = 2, w = W0 + 3, r = R0 + 1;
  rig(S, [[0, 1, W0, W0 + 1, R0], [3, 4, W0 + 2, R0 + 2, R0 + 3], [w, r, 5, R0 + 4], [s, W0 + 4, W0 + 5, R0 + 5]], [s === 2 ? 0 : 0, W0, R0]);
  S.envelope = [1, W0 + 1, R0 + 8]; // not used here
  S.pos[S.players[0].suspect] = { r: 1 };
  S.phase = 'suggest';
  ok(M.suggest(S, s, w - W0), 'player 0 suggests in the Library');
  ok(S.pos[s].r === 1 && S.wpos[w - W0] === 1, 'the named suspect and weapon are brought to the Library');
  ok(S.players.some((P, j) => P.suspect === s) ? S.players.find((P) => P.suspect === s).summoned : true, 'a player whose token was brought there may suggest there next turn');
  ok(S.phase === 'refute' && S.pending.q === 2, 'player 1 cannot answer, so player 2 (a person, holding two) is asked — player 3, who also holds one, is never reached');
  ok(S.pending.match.slice().sort().join() === [w, r].sort().join(), 'player 2 is offered exactly their matching cards');
  ok(!M.refute(S, 5) && S.phase === 'refute', 'showing a card that does not match is refused');
  ok(M.refute(S, r) && S.phase === 'reveal', 'player 2 shows the Library');
  const shows = S.obs.map((o) => o.filter((x) => x.t === 'show' || x.t === 'showx').slice(-1)[0]);
  ok(shows[0].t === 'show' && shows[0].card === r && shows[0].p === 2, 'the suggester alone learns which card');
  ok([1, 2, 3].every((p) => shows[p].t === 'showx' && !('card' in shows[p]) && shows[p].p === 2), 'everybody else learns only that player 2 showed one of the three');
  ok(S.obs.every((o) => o.some((x) => x.t === 'pass' && x.p === 1)) && !S.obs.some((o) => o.some((x) => x.t === 'pass' && x.p === 3)), 'everyone sees player 1 pass; player 3 was never asked');
  const e = S.log[S.log.length - 1];
  ok(e.t === 'suggest' && e.shownBy === 2 && e.passes.join() === '1' && !('card' in e), 'the public log says who passed and who showed, not what');
  ok(M.ackReveal(S) && S.phase === 'end', 'the suggester notes the card; the turn can end');

  // nobody answers
  const N = M.newGame({ seed: 10, players: kinds(3) });
  rig(N, [[0, 1, W0, W0 + 1, R0, R0 + 1], [2, 3, W0 + 2, W0 + 3, R0 + 2, R0 + 3], [4, W0 + 4, R0 + 4, R0 + 5, R0 + 6, R0 + 7]], [5, W0 + 5, R0 + 8]);
  N.pos[N.players[0].suspect] = { r: 8 }; N.phase = 'suggest';
  M.suggest(N, 5, 5);
  ok(N.phase === 'reveal' && N.sugg.shownBy === -1 && N.sugg.passes.join() === '1,2', 'nobody holds them: both others pass and nobody shows');
  const K = M.know(N, 0);
  ok(M.solvedFrom(K) && M.solvedFrom(K).join() === N.envelope.join(), 'and the suggester now knows the envelope');
  // a computer answering shows one card, and prefers one it has shown that player before
  const A = M.newGame({ seed: 11, players: kinds(3) });
  rig(A, [[0, 1, W0, W0 + 1, R0, R0 + 1], [2, 3, W0 + 2, W0 + 3, R0 + 2, R0 + 3], [4, W0 + 4, R0 + 4, R0 + 5, R0 + 6, R0 + 7]], [5, W0 + 5, R0 + 8]);
  A.players[1].shown.push([0, R0 + 2]);
  A.pos[A.players[0].suspect] = { r: 2 }; A.phase = 'suggest';
  M.suggest(A, 2, 2);
  ok(A.sugg.shownBy === 1 && A.sugg.card === R0 + 2 && A.phase === 'reveal', 'a Hard computer holding two re-shows the card that player has already seen');
}

// ------------------------------------------------------------ accusations
{
  const S = M.newGame({ seed: 12, players: kinds(4, ['human', 'hard', 'hard', 'hard']) });
  rig(S, [[0, 1, W0, W0 + 1, R0], [2, W0 + 2, R0 + 1, R0 + 2, R0 + 3], [3, W0 + 3, R0 + 4, R0 + 5], [4, W0 + 4, R0 + 6, R0 + 7]], [5, W0 + 5, R0 + 8]);
  ok(M.canAccuse(S) && M.accuse(S, [4, W0 + 5, R0 + 8]), 'player 0 accuses (wrongly) before rolling');
  ok(S.players[0].out && S.phase === 'start' && S.cur === 1, 'a wrong accusation puts you out and passes the turn');
  ok(S.obs.every((o) => o.some((x) => x.t === 'accwrong' && x.p === 0)), 'everyone learns that those three are not all right');
  // the out player still answers
  S.pos[S.players[1].suspect] = { r: 0 }; S.phase = 'suggest';
  M.suggest(S, 0, 5);
  ok(S.phase === 'refute' && S.pending.q === 0, 'player 1 suggests a card only the out player holds: the out player is asked (players 2 and 3 pass)');
  ok(M.refute(S, 0) && S.sugg.shownBy === 0, 'and must show it');
  M.ackReveal(S); M.endTurn(S); // 1 -> 2
  M.roll(S); if (S.phase === 'move') M.moveTo(S, S.targets[0]); if (S.phase === 'suggest') M.skipSuggest(S); M.endTurn(S); // 2 -> 3
  M.roll(S); if (S.phase === 'move') M.moveTo(S, S.targets[0]); if (S.phase === 'suggest') M.skipSuggest(S); M.endTurn(S); // 3 -> 1 (0 skipped)
  ok(S.cur === 1, 'the out player is skipped in the turn order');
  ok(M.accuse(S, [5, W0 + 5, R0 + 8]) && S.phase === 'over' && S.winner === 1 && S.endReason === 'solved', 'a right accusation wins at once');
  const N = M.newGame({ seed: 13, players: kinds(3) });
  rig(N, [[0, 1, W0, W0 + 1, R0, R0 + 1], [2, 3, W0 + 2, W0 + 3, R0 + 2, R0 + 3], [4, W0 + 4, R0 + 4, R0 + 5, R0 + 6, R0 + 7]], [5, W0 + 5, R0 + 8]);
  [0, 1, 2].forEach(() => M.accuse(N, [0, W0, R0]));
  ok(N.phase === 'over' && N.winner === -1 && N.endReason === 'nobody', 'if every detective accuses wrongly the game ends unsolved');
}

// ------------------------------------------------------------ the notebook shows only what its owner has learned
{
  let wrongMarks = 0, leaks = 0, cases = 0, showLeak = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const n = 3 + (seed % 4);
    const S = M.newGame({ seed, players: kinds(n, ['human', 'easy', 'normal', 'hard', 'easy', 'normal']) });
    let steps = 0;
    while (S.phase !== 'over' && steps++ < 4000) {
      M.aiStep(S, true);
      if (steps % 23 !== 0) continue;
      for (let p = 0; p < n; p++) for (const help of ['cards', 'passes', 'full']) {
        cases++;
        const nb = M.notebook(S, p, help);
        const truthOwner = (c) => { const i = S.players.findIndex((P) => P.hand.indexOf(c) >= 0); return i < 0 ? n : i; };
        for (let c = 0; c < NC; c++) for (let o = 0; o <= n; o++) {
          if (nb[c][o] === 1 && truthOwner(c) !== o) wrongMarks++;
          if (nb[c][o] === -1 && truthOwner(c) === o) wrongMarks++;
        }
        // Same observations and hand sizes, different hidden cards: the notebook must not change.
        const T = JSON.parse(JSON.stringify(S));
        const others = []; T.players.forEach((P, q) => { if (q !== p) others.push(...P.hand); });
        others.push(...T.envelope);
        others.reverse();
        T.players.forEach((P, q) => { if (q !== p) P.hand = others.splice(0, P.hand.length); });
        T.envelope = others;
        if (JSON.stringify(M.notebook(T, p, help)) !== JSON.stringify(nb)) leaks++;
      }
    }
    S.obs.forEach((o, p) => o.forEach((x) => {
      if (x.t === 'show') { const e = S.log.find((l) => l.t === 'suggest' && l.turn === x.turn); if (!e || e.by !== p) showLeak++; }
      if (x.t === 'showx' && 'card' in x) showLeak++;
    }));
  }
  ok(wrongMarks === 0, `notebook marks are always true (${cases} notebooks over 24 games, every player, all three fill-in levels)`);
  ok(leaks === 0, 'a notebook does not change when the other hands and the envelope are reshuffled behind the same observations: it reads nothing it has not been shown');
  ok(showLeak === 0, 'a player only ever records a shown card for their own suggestions');
}

// ------------------------------------------------------------ computers: accusations and termination
{
  let wrong = { easy: 0, normal: 0, hard: 0 }, unfinished = 0, capped = 0, games = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const lineup = [['hard', 'normal', 'easy'], ['hard', 'hard', 'normal', 'easy'], ['easy', 'normal', 'hard', 'easy', 'normal'], ['hard', 'normal', 'easy', 'hard', 'normal', 'easy']][seed % 4];
    const S = M.simulate(seed, lineup, { dice: seed % 3 === 0 ? 2 : 1 });
    games++;
    if (S.phase !== 'over') unfinished++;
    if (S.endReason === 'cap') capped++;
    S.log.forEach((e) => { if (e.t === 'accuse' && !e.ok) wrong[lineup[e.by]]++; });
  }
  ok(unfinished === 0 && capped === 0, `${games} computer games (3–6 players, one or two dice) all end with an accusation, none at the turn cap`);
  ok(wrong.hard === 0 && wrong.normal === 0, 'Hard and Normal never accuse wrongly (Easy gambled wrongly ' + wrong.easy + ' times)');
}

// ------------------------------------------------------------ save / resume
{
  const S = M.simulate(21, ['hard', 'normal', 'easy', 'hard'], { onStep: () => {} });
  ok(S.phase === 'over', 'reference game finishes');
  // replay to the middle, save, and continue both
  const A = M.newGame({ seed: 21, dice: 1, players: ['hard', 'normal', 'easy', 'hard'].map((k, i) => ({ name: 'P' + i, kind: k })) });
  for (let i = 0; i < 60; i++) M.aiStep(A);
  const text = M.serialize(A);
  const B = M.deserialize(text);
  ok(B && B.turn === A.turn && B.phase === A.phase, 'a mid-game save loads');
  let same = true;
  for (let i = 0; i < 4000 && A.phase !== 'over'; i++) { M.aiStep(A); M.aiStep(B); if (M.serialize(A) !== M.serialize(B)) { same = false; break; } }
  ok(same && A.phase === 'over' && A.winner === S.winner, 'and plays on identically to the end (the dice state is part of the save)');
  const bad = [
    'not json', '{}', 'null', '[]',
    text.replace('"v":1', '"v":2'),
    JSON.stringify(Object.assign(JSON.parse(text), { envelope: [0, 0, 0] })),
    JSON.stringify(Object.assign(JSON.parse(text), { phase: 'dancing' })),
    JSON.stringify(Object.assign(JSON.parse(text), { pos: [] })),
    (() => { const o = JSON.parse(text); o.players[0].hand.push(o.players[1].hand[0]); return JSON.stringify(o); })(),
    (() => { const o = JSON.parse(text); o.obs[0].push({ t: 'show', p: 1, card: o.players[0].hand[0] }); return JSON.stringify(o); })(),
    (() => { const o = JSON.parse(text); o.players.length = 2; return JSON.stringify(o); })(),
  ];
  ok(bad.every((t) => M.deserialize(t) === null), 'unreadable, other-version or impossible saves are rejected (' + bad.length + ' kinds), never loaded half-broken');
  const noNotes = JSON.parse(text); delete noNotes.notes;
  ok(M.deserialize(JSON.stringify(noNotes)).notes !== undefined, 'a save without notebook marks loads with an empty set');
}

// ------------------------------------------------------------ the page
{
  const tetris = fs.readFileSync(path.join(__dirname, '..', '..', 'tetris', 'index.html'), 'utf8');
  const backBlock = (s) => { const a = s.lastIndexOf('<style>', s.indexOf('/* dgames: the way back')); const e = s.indexOf('</a>', s.indexOf('<a class="dg-home"')); return s.slice(a, e + 4); };
  ok(backBlock(html) === backBlock(tetris) && backBlock(html).length > 800, 'back button is byte-identical to tetris (' + backBlock(html).length + ' bytes)');
  const tm = /Cluedo|\bClue\b|Mustard|Scarlet|Peacock|\bPlum\b|Mrs\.? White|Reverend|Candlestick|Lead Pipe|Wrench|Spanner|Revolver|Conservatory|Billiard|Ballroom|Lounge|Tudor/;
  const m = html.match(tm);
  ok(!m, 'no trademarked names from the original game appear in the page' + (m ? ' (found "' + m[0] + '")' : ''));
  ok(!/\r/.test(html), 'LF line endings');
  ok(/\[hidden\] \{ display: none !important; \}/.test(html), '[hidden] wins over author display rules');
}

console.log(`\n${checks - failures}/${checks} passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failures ? 1 : 0);
