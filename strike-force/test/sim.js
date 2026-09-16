// Headless simulation check (no browser). Loads the pure SIM section out of index.html with node's vm
// and drives it frame by frame. Run: node test/sim.js
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { Math, console, Array, Object, Number, String, Infinity, Map, Set, JSON }; ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(src, ctx);
const S = ctx.__sf, C = S.C;

let failures = 0, checks = 0;
const assert = (ok, msg) => { checks++; if (!ok) { failures++; console.log('FAIL', msg); } };
const NONE = { left: false, right: false, up: false, down: false, jump: false, fire: false };
const inp = (o) => ({ ...NONE, ...o });
function newGame(opts) { const g = S.createGame(opts); S.startGame(g); g.player.invincible = 0; return g; }
function place(g, x) { const p = g.player; p.x = x; p.y = S.findGroundY(g.level, x, p.w) - p.h; p.vx = p.vy = 0; g.camera.x = Math.max(0, Math.min(g.level.width - C.W, x - C.W / 2)); }
function run(g, input, n, each) { for (let i = 0; i < n; i++) { S.step(g, typeof input === 'function' ? input(i) : input); if (each && each(i) === false) return i; } return n; }

// 1. physics
{
  const g = newGame(); const y0 = g.player.y;
  run(g, NONE, 120);
  assert(g.player.onGround && Math.abs(g.player.y - y0) < 0.01, 'standing player does not fall through the ground (y ' + y0 + ' -> ' + g.player.y + ')');
  // jump height: hold jump, measure apex above the start
  const g2 = newGame(); run(g2, NONE, 2); const base = g2.player.y; let apex = base;
  run(g2, inp({ jump: true }), 60, () => { apex = Math.min(apex, g2.player.y); });
  const jumpH = base - apex;
  assert(jumpH >= 100, 'held jump reaches at least one platform step (100px): got ' + jumpH.toFixed(1));
  // tap jump is lower than held jump (variable height)
  const g3 = newGame(); run(g3, NONE, 2); const base3 = g3.player.y; let apex3 = base3;
  run(g3, (i) => inp({ jump: i < 4 }), 60, () => { apex3 = Math.min(apex3, g3.player.y); });
  assert(base3 - apex3 < jumpH - 20, 'tapped jump is lower than held jump (' + (base3 - apex3).toFixed(1) + ' vs ' + jumpH.toFixed(1) + ')');
  // land on a one-way platform when jumping up onto it (plat at 500,380 w120)
  const g4 = newGame(); place(g4, 540); run(g4, NONE, 2);
  run(g4, (i) => inp({ jump: i < 25 }), 120);
  assert(Math.abs(g4.player.y + g4.player.h - 380) < 0.01, 'jumping under a one-way platform passes through and lands on it (feet at ' + (g4.player.y + g4.player.h) + ')');
  // wall: block at 4100 (y 410..470). Running right from 4050 must stop at its face.
  const g5 = newGame(); place(g5, 4050);
  run(g5, inp({ right: true }), 120);
  assert(g5.player.x + g5.player.w <= 4100 + 1e-9 && g5.player.x > 4070, 'player cannot pass through a wall (x ' + g5.player.x.toFixed(1) + ')');
  // crouch lowers hitbox, feet stay put; standing up restores it
  const g6 = newGame(); const feet = g6.player.y + g6.player.h;
  run(g6, inp({ down: true }), 5);
  assert(g6.player.crouch && g6.player.h === C.CROUCH_H && Math.abs(g6.player.y + g6.player.h - feet) < 0.01, 'crouch lowers the hitbox and keeps the feet on the ground');
  run(g6, NONE, 5);
  assert(!g6.player.crouch && g6.player.h === C.PLAYER_H, 'standing up restores the hitbox');
  // falling into a pit kills (gap 1300..1400)
  const g7 = newGame(); place(g7, 1330); g7.player.y = 500;
  run(g7, NONE, 90);
  assert(g7.lives === C.LIVES - 1, 'falling into a pit costs a life');
}

// 2. aim table: every held-direction combination, both facings, ground and air
{
  const table = [ // keys [left,right,up,down] -> expected [dx,dy,crouch] on the ground / [dx,dy] in the air, given facing f
    { k: [0, 0, 0, 0], g: (f) => [f, 0, false], a: (f) => [f, 0] },
    { k: [0, 0, 1, 0], g: () => [0, -1, false], a: () => [0, -1] },
    { k: [0, 0, 0, 1], g: (f) => [f, 0, true], a: () => [0, 1] },
    { k: [0, 0, 1, 1], g: (f) => [f, 0, false], a: (f) => [f, 0] },
    { k: [1, 0, 0, 0], g: () => [-1, 0, false], a: () => [-1, 0] },
    { k: [0, 1, 0, 0], g: () => [1, 0, false], a: () => [1, 0] },
    { k: [1, 1, 0, 0], g: (f) => [f, 0, false], a: (f) => [f, 0] },
    { k: [1, 0, 1, 0], g: () => [-1, -1, false], a: () => [-1, -1] },
    { k: [0, 1, 1, 0], g: () => [1, -1, false], a: () => [1, -1] },
    { k: [1, 0, 0, 1], g: () => [-1, 1, false], a: () => [-1, 1] },
    { k: [0, 1, 0, 1], g: () => [1, 1, false], a: () => [1, 1] },
    { k: [1, 1, 1, 0], g: () => [0, -1, false], a: () => [0, -1] },
    { k: [1, 1, 0, 1], g: (f) => [f, 0, true], a: () => [0, 1] },
    { k: [1, 0, 1, 1], g: () => [-1, 0, false], a: () => [-1, 0] },
    { k: [0, 1, 1, 1], g: () => [1, 0, false], a: () => [1, 0] },
    { k: [1, 1, 1, 1], g: (f) => [f, 0, false], a: (f) => [f, 0] },
  ];
  let n = 0;
  for (const row of table) for (const f of [1, -1]) for (const ground of [true, false]) {
    const input = { left: !!row.k[0], right: !!row.k[1], up: !!row.k[2], down: !!row.k[3] };
    const got = S.aimFrom(input, f, ground), exp = ground ? row.g(f) : row.a(f);
    const ok = got.dx === exp[0] && got.dy === exp[1] && (!ground || got.crouch === exp[2]) && (ground || !got.crouch);
    assert(ok, 'aim ' + JSON.stringify(row.k) + ' facing ' + f + (ground ? ' ground' : ' air') + ': got ' + JSON.stringify(got) + ' expected ' + JSON.stringify(exp));
    n++;
  }
  console.log('aim table:', n, 'combinations checked');
}

// 3. bullets
{
  const g = newGame(); place(g, 200);
  run(g, inp({ fire: true }), 1);
  assert(g.bullets.length === 1 && g.bullets[0].owner === 'player' && g.bullets[0].vx > 0, 'firing spawns one forward bullet');
  const frames = run(g, NONE, 400, () => g.bullets.length > 0);
  assert(g.bullets.length === 0 && frames < 400, 'bullet despawns once off-screen (after ' + frames + ' frames)');
  // spread shot makes 3 bullets
  const gs = newGame(); place(gs, 200); gs.player.weapon = 'spread'; gs.player.weaponTimer = 600;
  run(gs, inp({ fire: true }), 1);
  assert(gs.bullets.length === 3, 'spread shot fires 3 bullets');
  // player bullets kill a troop after hp hits
  const g2 = newGame(); place(g2, 200);
  const e = S.spawnEnemy(g2, { type: 'troop', x: 320 }); e.state = 'walk'; e.cd = 9999;
  const s0 = g2.score;
  let hits = 0, lastHp = e.hp;
  const fr = run(g2, inp({ fire: true }), 120, () => { if (e.hp < lastHp) { hits++; lastHp = e.hp; } return e.state !== 'dead'; });
  assert(e.state === 'dead' && hits === S.ENEMY.troop.hp, 'troop dies after ' + S.ENEMY.troop.hp + ' hits (hits ' + hits + ', frames ' + fr + ')');
  assert(!g2.enemies.includes(e), 'dead troop is removed from the enemy list');
  assert(g2.score === s0 + C.SCORE.troop, 'kill awards ' + C.SCORE.troop + ' points');
  // enemy bullet damages the player and starts invincibility; a second one during i-frames does not
  const g3 = newGame(); place(g3, 200); g3.enemies = [];
  const p = g3.player;
  S.fireEnemyBullet(g3, p.x + p.w / 2 + 40, p.y + p.h / 2, -1, 0);
  run(g3, NONE, 20);
  assert(p.hp === C.MAX_HP - 1 && p.invincible > 0, 'enemy bullet takes one hp (hp ' + p.hp + ') and triggers i-frames (' + p.invincible + ')');
  S.fireEnemyBullet(g3, p.x + p.w / 2 + 40, p.y + p.h / 2, -1, 0);
  run(g3, NONE, 20);
  assert(p.hp === C.MAX_HP - 1, 'no damage during invincibility frames');
  run(g3, NONE, C.HIT_INV);
  S.fireEnemyBullet(g3, p.x + p.w / 2 + 40, p.y + p.h / 2, -1, 0);
  run(g3, NONE, 20);
  assert(p.hp === C.MAX_HP - 2, 'damage resumes once invincibility ends');
  // classic mode: one hit kills
  const g4 = newGame({ classic: true }); place(g4, 200); g4.enemies = [];
  S.fireEnemyBullet(g4, g4.player.x + g4.player.w / 2 + 40, g4.player.y + g4.player.h / 2, -1, 0);
  run(g4, NONE, 20);
  assert(g4.state === 'dead' && g4.lives === C.LIVES - 1, 'classic: one hit kills');
}

// 4. checkpoint respawn keeps score, decrements lives
{
  const g = newGame(); place(g, 1100); g.score = 1234;
  run(g, NONE, 2);
  assert(g.checkpoint === 0, 'passing x=1000 registers checkpoint 0');
  g.player.y = 700; // fell into a pit
  run(g, NONE, C.DEATH_FRAMES + 5);
  assert(g.state === 'playing', 'respawns after the death animation');
  assert(Math.abs(g.player.x - 1000) < 1, 'respawn at checkpoint x=1000 (x ' + g.player.x + ')');
  assert(g.score === 1234, 'score kept on respawn');
  assert(g.lives === C.LIVES - 1, 'lives decremented on respawn');
  assert(g.player.hp === C.MAX_HP && g.player.invincible > 0, 'respawn restores hp with spawn protection');
  run(g, NONE, 10);
  assert(g.player.onGround, 'respawned player stands on the ground');
}

// 5. scripted bot: run right, jump at gaps/walls, fire forward; must reach the boss arena
function bot(g) {
  const p = g.player, L = g.level;
  const aheadX = p.x + p.w + 30, feetY = p.y + p.h + 2;
  const gapAhead = p.onGround && !S.pointIn(L, aheadX, feetY, false) && !S.pointIn(L, aheadX, feetY + 30, false);
  const wallAhead = p.onGround && (p.blocked || S.pointIn(L, aheadX - 10, p.y + p.h - 6, true));
  return inp({ right: true, fire: true, jump: gapAhead || wallAhead || (!p.onGround && p.vy < 0) });
}
{
  const MAXF = 60 * 120;
  const g = newGame({ god: true });
  const frames = run(g, () => bot(g), MAXF, () => !g.bossActive);
  assert(g.bossActive, 'god-mode bot reaches the boss arena (frames ' + frames + ', x ' + g.player.x.toFixed(0) + ', state ' + g.state + ')');
  console.log('bot (god): reached boss arena in', frames, 'frames, checkpoints', g.checkpoint + 1, 'score', g.score);
  // same bot without god mode, 5 runs: reported, not asserted
  let reached = 0; const outcomes = [];
  for (let r = 0; r < 5; r++) {
    const gg = newGame();
    const f = run(gg, () => bot(gg), MAXF, () => !gg.bossActive && gg.state !== 'gameover');
    if (gg.bossActive) reached++;
    outcomes.push((gg.bossActive ? 'arena@' + f : 'gameover@x' + Math.round(gg.player.x)) + ' lives ' + gg.lives + ' hp ' + gg.player.hp);
  }
  console.log('bot (mortal): reached arena', reached + '/5', outcomes.join(' '));
  // boss fight: god-mode bot keeps firing in the arena; boss must die and the game must be won
  const w = run(g, () => bot(g), 60 * 90, () => g.state !== 'won');
  assert(g.state === 'won', 'boss dies under sustained fire and the game is won (frames ' + w + ', state ' + g.state + ')');
  assert(g.score >= C.SCORE.boss + C.SCORE.win, 'win adds boss and completion bonus (score ' + g.score + ')');
}

// 6. game over after losing all lives
{
  const g = newGame(); place(g, 200); g.score = 500;
  for (let i = 0; i < C.LIVES; i++) { g.player.y = 700; run(g, NONE, C.DEATH_FRAMES + 5); }
  assert(g.state === 'gameover' && g.lives === 0, 'losing all lives ends the game (state ' + g.state + ', lives ' + g.lives + ')');
  assert(g.score === 500, 'score preserved on the game-over screen');
  const g2 = S.createGame(); assert(g2.state === 'title' && g2.score === 0 && g2.lives === C.LIVES, 'a new game starts fresh');
}

console.log(failures ? failures + ' FAILURE(S) of ' + checks + ' checks' : 'all ' + checks + ' checks passed');
process.exit(failures ? 1 : 0);
