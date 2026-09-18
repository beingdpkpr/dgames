#!/usr/bin/env node
// Screenshots every game at phone and desktop size so someone can LOOK at them. Run: npm run visual
//
// This exists because everything else that checks the UI here checks numbers. Contrast ratios, tap
// target sizes, layout arithmetic — all real, all blind to a die face drawn inside another die face,
// or a label sitting on top of an element that a CSS transform pushed outside its own box. Both of
// those shipped, and both were found in the first screenshot anyone took.
//
// NOT a test. It needs a browser, it asserts nothing, and it is deliberately out of `<game>/test/` so
// the root runner never walks it into the CI gate. It prints page errors, which is the one thing here
// that IS pass/fail: a game that throws on load is the cheapest possible catch.
//
// Playwright lives in cricket-3d/node_modules (the only game that needed it before now).
// Needs: npm ci in cricket-3d/, then npx playwright install chromium
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(__dirname, '..', 'cricket-3d', 'node_modules', 'playwright'));

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'test-shots');
const fileUrl = (p) => 'file:///' + path.resolve(ROOT, p).split(path.sep).join('/');

// swiftshader so the WebGL games render without a GPU; copied from cricket-3d/test/visual.js, which
// has been doing this for one game all along.
const LAUNCH = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

const PHONE = { width: 390, height: 844 };
const LAND = { width: 844, height: 390 };
const DESK = { width: 1280, height: 800 };

// `enter` clicks through to the screen that actually matters. A menu is the least interesting thing a
// game draws, and it is the only thing you see without this.
const GAMES = [
  { name: 'launcher', file: 'index.html' },
  { name: 'tic-tac-toe', file: 'tic-tac-toe/index.html' },
  { name: 'dots-and-boxes', file: 'dots-and-boxes/index.html' },
  { name: 'ludo', file: 'ludo/index.html', enter: async (p) => { await p.click('#die'); await p.waitForTimeout(900); } },
  { name: 'battleship', file: 'battleship/index.html', enter: async (p) => { await p.click('#start'); await p.waitForTimeout(400); await p.click('#random'); await p.waitForTimeout(400); } },
  { name: 'duck-hunt', file: 'duck-hunt/index.html', enter: async (p) => { await p.click('#start'); await p.waitForTimeout(1800); } },
  { name: 'penfight', file: 'penfight/index.html', enter: async (p) => { await p.click('#btnToPick'); await p.waitForTimeout(900); } },
  { name: 'strike-force', file: 'strike-force/index.html', landscape: true, enter: async (p) => { await p.click('#btnStart'); await p.waitForTimeout(1500); } },
  { name: 'cricket-3d', file: 'cricket-3d/index.html', landscape: true, enter: async (p) => { await p.click('#play'); await p.waitForTimeout(2500); } },
  { name: 'rush-lane', file: 'rush-lane/index.html', landscape: true, enter: async (p) => {
      await p.waitForFunction(() => { const b = document.getElementById('start-button'); return b && !b.disabled; }, null, { timeout: 60000 }).catch(() => {});
      await p.click('#start-button'); await p.waitForTimeout(3000);
    } },
];

// A game that repaints every frame never reaches the "stable" state Playwright waits for by default,
// so duck-hunt and penfight simply timed out. Freeze animations and cap the wait.
const shoot = (page, name) => page.screenshot({ path: path.join(OUT, name), animations: 'disabled', timeout: 15000 });

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: LAUNCH });
  let totalErrors = 0;

  for (const g of GAMES) {
    if (only.length && !only.includes(g.name)) continue;
    const sizes = [['phone', PHONE, true], ['desktop', DESK, false]];
    if (g.landscape) sizes.splice(1, 0, ['landscape', LAND, true]);

    for (const [label, viewport, touch] of sizes) {
      const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
      page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 140)); });

      try {
        await page.goto(fileUrl(g.file), { timeout: 60000 });
        await page.waitForTimeout(g.landscape ? 2500 : 1000);
        await shoot(page, `${g.name}-${label}-1-open.png`);
        if (g.enter) {
          await g.enter(page);
          await shoot(page, `${g.name}-${label}-2-playing.png`);
        }
      } catch (e) {
        errors.push('harness: ' + e.message.split('\n')[0]);
      }

      totalErrors += errors.length;
      console.log(`${errors.length ? 'ERR ' : 'ok  '} ${g.name}/${label}${errors.length ? '  ' + errors.join(' | ') : ''}`);
      await ctx.close();
    }
  }

  await browser.close();
  console.log(`\nshots in ${OUT}`);
  console.log(totalErrors ? `${totalErrors} page/console error(s) — read them, a throw on load is the worst kind` : 'no page errors');
})();
