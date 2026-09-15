// Headless balance check: auto-bats 20 innings with random timing (±0.2 s) and random aim,
// then prints the outcome distribution. Run: npm install three@0.128.0 && node test/balance.js
const vm = require('vm'); const fs = require('fs'); const THREE = require('three');
THREE.WebGLRenderer = class { constructor(){ this.shadowMap={}; } setPixelRatio(){} setSize(){} render(){} };
const els = {}; const mkEl = (id) => els[id] || (els[id] = { id, textContent:'', innerHTML:'', className:'', style:{}, children:[], classList:{add(){},remove(){},toggle(){}}, addEventListener(){}, appendChild(){}, dataset:{}, offsetWidth:0 });
let rafCb = null;
const ctx = { THREE, console, Math, performance:{now:()=>0}, innerWidth:1280, innerHeight:720, devicePixelRatio:1, document:{getElementById:mkEl, createElement:()=>mkEl('tmp'+Math.random())}, addEventListener(){}, requestAnimationFrame(cb){rafCb=cb;}, localStorage:{getItem:()=>null,setItem(){}}, Object, Number, String, Array, Float32Array, Set, JSON, Error };
ctx.window = ctx; ctx.globalThis = ctx;
const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
let src = html.slice(html.indexOf("'use strict';"), html.lastIndexOf('</script>')) + "\nglobalThis.__g = { get state(){return state;}, ball, pressShot, match, get simTime(){return simTime;}, set aimTheta(v){aimTheta=v;}, startMatch, get shot(){return shot;}, get runupT(){return runupT;}, CONTACT_Z, set totalOvers(v){totalOvers=v;} };";
vm.createContext(ctx); vm.runInContext(src, ctx); const g = ctx.__g;
const tally = {}, timing = {}, msgs = {}; const byType = {};
let totalRuns=0, totalW=0, totalBalls=0, t=0;
for (let inn=0; inn<20; inn++) {
  g.totalOvers = 5; g.startMatch();
  let frames=0, plan=null, lastBalls=0, lastChange=0;
  while (g.state !== 'end' && frames < 60*60*20) {
    t += 1000/60; frames++; const cb=rafCb; rafCb=null; cb(t);
    if (g.state==='flight' && !plan) plan={ delta:(Math.random()-0.5)*0.4, theta:(Math.random()-0.5)*3.5, type:Math.random()<0.4?'loft':'ground', done:false };
    if (g.state==='flight' && plan && !plan.done && !g.shot) { const zPress=g.CONTACT_Z+g.ball.vel.z*plan.delta; if (g.ball.pos.z>=zPress){ g.aimTheta=plan.theta; g.pressShot(plan.type); plan.done=true; } }
    if (g.state==="runup") plan=null;
    if (g.match.balls!==lastBalls){ lastBalls=g.match.balls; lastChange=frames; const r=g.match.over[g.match.over.length-1]; tally[r]=(tally[r]||0)+1; const tm=els.timing.textContent.replace(/Dropped by .*/,'Dropped').replace(/.* · \d+ km\/h$/,'noshot').replace(/^(Diving stop|Misfield).*/,'dive/misfield').replace(/.*dives\.\.\. misses!$/,'dive miss'); timing[tm]=(timing[tm]||0)+1; const m=els.msg.textContent; msgs[m]=(msgs[m]||0)+1; if (plan){ const k=plan.type+' |d|'+(Math.abs(plan.delta)<0.06?'<.06':Math.abs(plan.delta)<0.12?'<.12':Math.abs(plan.delta)<0.17?'<.17':'>.17'); const o=byType[k]=byType[k]||{n:0,W:0,'4':0,'6':0,runs:0}; o.n++; if(r==='W')o.W++; else if(r==='4')o['4']++; else if(r==='6')o['6']++; else o.runs+= +r; } }
    if (frames-lastChange>60*40){ console.log('STUCK', g.state, g.ball.phase); break; }
  }
  totalRuns+=g.match.runs; totalW+=g.match.wkts; totalBalls+=g.match.balls;
}
console.log('innings 20: avg', (totalRuns/20).toFixed(1), 'runs,', (totalW/20).toFixed(1), 'wkts,', (totalBalls/20).toFixed(1), 'balls');
console.log('results', JSON.stringify(tally));
console.log('timing', JSON.stringify(timing));
console.log('msgs', JSON.stringify(msgs));
for (const k of Object.keys(byType).sort()) { const o=byType[k]; console.log(k.padEnd(16), 'n', String(o.n).padStart(3), 'W%', (100*o.W/o.n).toFixed(0).padStart(3), '4%', (100*o['4']/o.n).toFixed(0).padStart(3), '6%', (100*o['6']/o.n).toFixed(0).padStart(3)); }
