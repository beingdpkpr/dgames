// Headless high-score check (no browser). Loads the makeHiScores module out of index.html with an
// in-memory localStorage and asserts rank ordering (desc), the top-10 cap and initials handling; then
// loads the whole game the way test/balance.js does, auto-bats a 2-over quick innings to its end and
// asserts the game's own hook (quickHiScore) submits runs / "<wkts> wkts, <balls> balls" to the
// cricket-3d.quick.2 table, and nothing for tournament mode or a duck. Run: node test/hiscore.js
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let failures = 0;
const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures++; };
const memStorage = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m }; };

// ---- 1. the module alone ----
const modStart = html.indexOf('// ---------- dgames high scores ----------'), modEnd = html.indexOf('//  Constants and tuning');
assert(modStart > 0 && modEnd > modStart, 'module found in index.html');
const modSrc = html.slice(modStart, modEnd) + '\nglobalThis.__m = { makeHiScores };';
const mctx = { localStorage: memStorage(), console, Date, JSON, Math }; mctx.globalThis = mctx;
vm.createContext(mctx); vm.runInContext(modSrc, mctx);
const hs = mctx.__m.makeHiScores({ key: 'cricket-3d.quick.5', order: 'desc', max: 10, label: v => `${v} runs` });
assert(hs.rank(1) === 0, 'empty table: any score ranks first');
for (const v of [30, 10, 20]) hs.add(v, 'abc', `${v} d`);
assert(hs.list().map(e => e.value).join(',') === '30,20,10', 'list sorted descending');
assert(hs.rank(25) === 1 && hs.rank(31) === 0 && hs.rank(5) === 3, 'rank: 25 -> #2, 31 -> #1, 5 -> #4');
assert(hs.rank(20) === 2, 'a tie ranks below the existing equal entry');
assert(hs.list()[0].initials === 'ABC', 'initials upper-cased');
assert(hs.add(1, 'deepak', '').initials === 'DEE', 'initials cut to three letters');
assert(hs.add(2, '', '').initials === '???', 'empty initials become ???');
for (let i = 0; i < 12; i++) hs.add(100 + i, 'x', '');
assert(hs.list().length === 10, 'table capped at 10 entries');
assert(hs.list()[0].value === 111 && hs.list()[9].value === 102, 'cap keeps the ten best (111 .. 102)');
assert(hs.rank(101) === -1 && hs.rank(102) === -1 && hs.rank(103) === 9, 'rank -1 below the tenth entry, 103 takes #10');
assert(mctx.localStorage.map.has('dgames.hiscores.cricket-3d.quick.5'), 'stored under dgames.hiscores.<key>');
const hsAsc = mctx.__m.makeHiScores({ key: 'asc', order: 'asc' });
hsAsc.add(50, 'a'); hsAsc.add(20, 'b');
assert(hsAsc.rank(10) === 0 && hsAsc.rank(30) === 1 && hsAsc.list()[0].value === 20, 'asc order: smaller is better');

// ---- 2. the game hook, driven headlessly ----
const THREE = require('three');
THREE.WebGLRenderer = class { constructor(){ this.shadowMap={}; } setPixelRatio(){} setSize(){} render(){} };
const noop = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
const els = {}; const mkEl = (id) => els[id] || (els[id] = { id, width: 300, height: 300, textContent:'', innerHTML:'', className:'', style:{}, children:[], classList:{add(){},remove(){},toggle(){}}, addEventListener(){}, appendChild(){}, querySelector: (q) => mkEl(id + q), getContext: () => noop, dataset:{}, offsetWidth:0 });
let rafCb = null;
const ctx = { THREE, console, Math, performance:{now:()=>0}, innerWidth:1280, innerHeight:720, devicePixelRatio:1, document:{getElementById:mkEl, createElement:()=>mkEl('tmp'+Math.random())}, addEventListener(){}, requestAnimationFrame(cb){rafCb=cb;}, localStorage: memStorage(), Object, Number, String, Array, Float32Array, Set, JSON, Error };
ctx.window = ctx; ctx.globalThis = ctx;
const src = html.slice(html.indexOf("'use strict';"), html.lastIndexOf('</script>')) + "\nglobalThis.__g = { get state(){return state;}, ball, pressShot, match, set aimTheta(v){aimTheta=v;}, startMatch, get shot(){return shot;}, CONTACT_Z, set totalOvers(v){totalOvers=v;}, set mode(v){mode=v;}, quickHiScore, hiScores };";
vm.createContext(ctx); vm.runInContext(src, ctx); const g = ctx.__g;
assert(g.quickHiScore() === null, 'nothing to submit before a match (0 runs)');

let t = 0;
function playInnings(overs) {
  g.totalOvers = overs; g.startMatch();
  let frames = 0, plan = null, lastBalls = 0, lastChange = 0;
  while (g.state !== 'end' && frames < 60 * 60 * 20) {
    t += 1000 / 60; frames++; const cb = rafCb; rafCb = null; cb(t);
    if (g.state === 'flight' && !plan) plan = { delta: (Math.random() - 0.5) * 0.1, theta: (Math.random() - 0.5) * 3.5, type: Math.random() < 0.4 ? 'loft' : 'ground', done: false };
    if (g.state === 'flight' && plan && !plan.done && !g.shot) { const zPress = g.CONTACT_Z + g.ball.vel.z * plan.delta; if (g.ball.pos.z >= zPress) { g.aimTheta = plan.theta; g.pressShot(plan.type); plan.done = true; } }
    if (g.state === 'runup') plan = null;
    if (g.match.over.length !== lastBalls) { lastBalls = g.match.over.length; lastChange = frames; }
    if (frames - lastChange > 60 * 40) { console.log('STUCK', g.state, g.ball.phase); break; }
  }
}
let q = null;
for (let n = 0; n < 5 && !(q && q.value > 0); n++) { playInnings(2); q = g.quickHiScore(); }
assert(g.state === 'end', 'innings reached the end state');
assert(g.match.runs > 0, `innings scored runs (${g.match.runs}/${g.match.wkts} off ${g.match.balls})`);
assert(q && q.value === g.match.runs, 'hook value = runs scored');
assert(q && q.detail === `${g.match.wkts} wkts, ${g.match.balls} balls`, `hook detail = "${q && q.detail}"`);
assert(q && q.hs.key === 'cricket-3d.quick.2', 'hook table key = cricket-3d.quick.2');
assert(q && q.hs === g.hiScores(2) && g.hiScores(5) !== g.hiScores(2), 'one table instance per overs setting');
assert(q && q.hs.rank(q.value) === 0 && q.hs.list().length === 0, 'headless run did not prompt or record (no DOM body)');
assert(ctx.localStorage.map.get('cricket3d_best') === String(g.match.runs), 'old single best score still written');
g.mode = 'tournament';
assert(g.quickHiScore() === null, 'tournament results are not submitted');
g.mode = 'quick'; g.match.runs = 0;
assert(g.quickHiScore() === null, 'a duck is not submitted');

console.log(failures ? failures + ' FAILURE(S)' : 'all checks passed');
process.exit(failures ? 1 : 0);
