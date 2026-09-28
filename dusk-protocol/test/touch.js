// Touch pad and shared-snippet checks, no browser. A pad button wired to a code the game ignores
// looks fine and does nothing, so every code the pad emits must be one the game reads. The shared
// snippets (touch pad, back button) must be byte-identical to tetris's copy. Run: node test/touch.js
'use strict';
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const tetris = fs.readFileSync(path.join(__dirname, '..', '..', 'tetris', 'index.html'), 'utf8');
let failures = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) failures++; };

// the snippets, sliced by their own first and last lines
const padOf = (s) => { const a = s.indexOf('// ---------- dgames touch controls ----------'); const b = s.indexOf('\n}\n', s.indexOf('function makeTouchPad', a)); return s.slice(a, b + 2); };
const backOf = (s) => { const e = s.indexOf('<a class="dg-home"'); const a = s.lastIndexOf('<style>', e); return s.slice(a, s.indexOf('</a>', e) + 4); };
ok(padOf(html).length > 1000 && padOf(html) === padOf(tetris), 'touch pad snippet is byte-identical to tetris');
ok(backOf(html).length > 200 && backOf(html) === backOf(tetris), 'back button snippet is byte-identical to tetris');
const ui = html.slice(html.indexOf('// ---------- UI ----------'));
ok(ui.includes('// ---------- dgames touch controls ----------'), 'the pad snippet sits after the UI marker, outside the sim');

// every code the pad sends is read by the game
// lastIndexOf: the snippet's own usage comment contains the same words
const at = ui.lastIndexOf('const pad = makeTouchPad({');
const call = ui.slice(at, ui.indexOf('});', at));
const codes = [...call.matchAll(/'(Key[A-Z]|Space|Arrow\w+)'/g)].map((m) => m[1]);
ok(codes.length === 9, `pad sends ${codes.length} codes: ${codes.join(' ')}`);
const read = (c) => ui.includes('keys.' + c) || ui.includes("e.code === '" + c + "'");
for (const c of codes) ok(read(c), `${c} is read by the game`);
ok(/label: 'FIRE', main: true/.test(call) && /'USE'/.test(call) && /'SCOPE'/.test(call) && /'CROUCH'/.test(call) && /'RELOAD'/.test(call), 'buttons: FIRE (main), SCOPE, CROUCH, RELOAD, USE');
// looking is the game's job on a phone: a finger on the right half, or dragged off FIRE / SCOPE
ok(/innerWidth \* 0\.4/.test(ui) && /textContent === 'FIRE'/.test(ui), 'touch look: right-hand drags and drags that start on FIRE steer the view');

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
