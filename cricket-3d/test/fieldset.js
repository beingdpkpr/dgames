// Headless check that the field is fully set before the bowler runs in: plays through deliveries
// with random shots and, on every frame where the game state is 'runup' or 'flight', asserts every
// non-bowler fielder sits exactly at its home position and does not move frame-to-frame; also asserts
// every non-bowler fielder is at home on the very first frame of each run-up.
// Run: node test/fieldset.js  (needs the same `three` package as test/balance.js)
const vm = require('vm'); const fs = require('fs'); const THREE = require('three');
THREE.WebGLRenderer = class { constructor(){ this.shadowMap={}; } setPixelRatio(){} setSize(){} render(){} };
const noop = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
const els = {}; const mkEl = (id) => els[id] || (els[id] = { id, width: 300, height: 300, textContent:'', innerHTML:'', className:'', style:{}, children:[], classList:{add(){},remove(){},toggle(){}}, addEventListener(){}, appendChild(){}, querySelector: (q) => mkEl(id + q), getContext: () => noop, dataset:{}, offsetWidth:0 });
let rafCb = null;
const ctx = { THREE, console, Math, performance:{now:()=>0}, innerWidth:1280, innerHeight:720, devicePixelRatio:1, document:{getElementById:mkEl, createElement:()=>mkEl('tmp'+Math.random())}, addEventListener(){}, requestAnimationFrame(cb){rafCb=cb;}, localStorage:{getItem:()=>null,setItem(){}}, Object, Number, String, Array, Float32Array, Set, JSON, Error };
ctx.window = ctx; ctx.globalThis = ctx;
const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
let src = html.slice(html.indexOf("'use strict';"), html.lastIndexOf('</script>')) + "\nglobalThis.__g = { get state(){return state;}, ball, pressShot, match, get simTime(){return simTime;}, set aimTheta(v){aimTheta=v;}, startMatch, get shot(){return shot;}, get runupT(){return runupT;}, CONTACT_Z, set totalOvers(v){totalOvers=v;}, allFielders };";
vm.createContext(ctx); vm.runInContext(src, ctx); const g = ctx.__g;

let t = 0;
let deliveries = 0;
const failures = [];
let prevInSpan = false;
let lastPos = null;   // { fielderName: {x, z} }, only meaningful across consecutive in-span frames

function fail(msg) { if (failures.length < 40) failures.push(msg); }

function checkFrame() {
  const st = g.state;
  const inSpan = st === 'runup' || st === 'flight';
  if (!inSpan) { prevInSpan = false; lastPos = null; return; }
  const isFirstOfRunup = st === 'runup' && !prevInSpan;
  const here = {};
  for (const f of g.allFielders) {
    if (f.isBowler) continue;
    const atHome = f.pos.x === f.home.x && f.pos.z === f.home.z;
    here[f.name] = { x: f.pos.x, z: f.pos.z };
    if (!atHome) {
      fail(`[${st}${isFirstOfRunup ? ' first-frame' : ''}] ${f.name} not at home: pos=(${f.pos.x.toFixed(3)},${f.pos.z.toFixed(3)}) home=(${f.home.x.toFixed(3)},${f.home.z.toFixed(3)})`);
    }
    if (prevInSpan && lastPos && lastPos[f.name]) {
      const lp = lastPos[f.name];
      if (lp.x !== f.pos.x || lp.z !== f.pos.z) {
        fail(`[${st}] ${f.name} moved mid-runup/flight: (${lp.x.toFixed(3)},${lp.z.toFixed(3)}) -> (${f.pos.x.toFixed(3)},${f.pos.z.toFixed(3)})`);
      }
    }
  }
  if (isFirstOfRunup) deliveries++;
  lastPos = here;
  prevInSpan = true;
}

let inn = 0;
while (deliveries < 30 && inn < 10) {
  inn++;
  g.totalOvers = 5; g.startMatch();
  let frames = 0, plan = null, lastBalls = 0, lastChange = 0;
  while (g.state !== 'end' && frames < 60 * 60 * 20) {
    t += 1000 / 60; frames++; const cb = rafCb; rafCb = null; cb(t);
    checkFrame();
    if (g.state === 'flight' && !plan) plan = { delta: (Math.random() - 0.5) * 0.4, theta: (Math.random() - 0.5) * 3.5, type: Math.random() < 0.4 ? 'loft' : 'ground', done: false };
    if (g.state === 'flight' && plan && !plan.done && !g.shot) { const zPress = g.CONTACT_Z + g.ball.vel.z * plan.delta; if (g.ball.pos.z >= zPress) { g.aimTheta = plan.theta; g.pressShot(plan.type); plan.done = true; } }
    if (g.state === 'runup') plan = null;
    if (g.match.over.length !== lastBalls) { lastBalls = g.match.over.length; lastChange = frames; }
    if (frames - lastChange > 60 * 40) { console.log('STUCK', g.state, g.ball.phase); break; }
  }
}

if (deliveries < 30) { console.error(`FAIL: only observed ${deliveries} deliveries (need >= 30) across ${inn} innings`); process.exit(1); }
if (failures.length) {
  console.error(`FAIL: ${failures.length} violation(s) over ${deliveries} deliveries`);
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}
console.log(`PASS: field fully set before every run-up, no fielder movement during runup/flight, across ${deliveries} deliveries (${inn} innings)`);
