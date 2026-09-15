// Visual check with Playwright + Chromium. Steps the game clock manually so every screenshot lands
// on the intended moment regardless of render speed. Saves to test/shots/.
// Run: node test/visual.js   (needs: npm install && npx playwright install chromium)
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
(async () => {
  const out = path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file:///' + path.resolve(__dirname, '..', 'index.html').split(path.sep).join('/'));
  await page.waitForFunction(() => window.__dbg, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const shot = async (name) => { await page.screenshot({ path: path.join(out, name + '.png') }); console.log('shot', name); };
  const adv = (s) => page.evaluate(x => window.__dbg.advance(x), s);
  const st = () => page.evaluate(() => ({ state: window.__dbg.state, runupT: window.__dbg.runupT, z: window.__dbg.ballZ, vz: window.__dbg.ballVz, phase: window.__dbg.phase }));
  // advance until a condition holds, in small steps
  const until = async (fn, max = 20) => { let t = 0; while (t < max) { if (fn(await st())) return true; await adv(0.05); t += 0.05; } return false; };
  await shot('01-menu');
  await page.click('#segMode button[data-v="tournament"]'); await page.waitForTimeout(150); await shot('02-menu-tournament');
  await page.click('#segMode button[data-v="quick"]');
  await page.evaluate(() => window.__dbg.manual(true));
  await page.click('#play'); await adv(0.05);
  await until(s => s.runupT >= 1.0); await shot('03-runup-bowlercam');
  await until(s => s.runupT >= 1.5); await shot('04-gather');
  await until(s => s.runupT >= 1.72); await shot('05-stride');
  await until(s => s.state === 'flight'); await adv(0.05); await shot('06-release');
  await until(s => s.z >= -12); await shot('07-flight-backlift');
  // lofted cover drive, pressed 0.03 s early
  await until(s => s.z >= -1.8 + s.vz * 0.03);
  await page.evaluate(() => { window.__dbg.aim(0.6); window.__dbg.pressShot('loft'); });
  await adv(0.12); await shot('08-contact');
  await adv(0.3); await shot('09-follow-through');
  await adv(1.2); await shot('10-ball-in-air-running');
  await until(s => s.state === 'dead', 12); await adv(0.3); await shot('11-result');
  // ground shot: pull, timed well
  await until(s => s.state === 'flight', 12);
  await until(s => s.z >= -1.8 + s.vz * 0.01, 5);
  await page.evaluate(() => { window.__dbg.aim(-1.4); window.__dbg.pressShot('ground'); });
  await adv(0.14); await shot('12-pull-contact');
  await adv(0.9); await shot('13-ground-fielding');
  await until(s => s.state === 'dead', 15); await adv(0.3); await shot('14-ground-result');
  // straight drive, deliberately late
  await until(s => s.state === 'flight', 12);
  await until(s => s.z >= -1.8 + s.vz * -0.10, 5);
  await page.evaluate(() => { window.__dbg.aim(0.0); window.__dbg.pressShot('ground'); });
  await adv(0.15); await shot('15-drive-late');
  await until(s => s.state === 'dead', 15); await adv(0.3); await shot('16-late-result');
  await page.evaluate(() => window.__dbg.lefty()); await adv(0.05);
  await until(s => s.state === 'flight', 5); await until(s => s.z >= -10, 3); await shot('16c-left-hander');
  await page.evaluate(() => window.__dbg.celebrate(true)); await adv(2.0); await shot('16b-celebration');
  await page.evaluate(() => window.__dbg.manual(false));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200); await shot('17-paused');
  console.log('match', await page.evaluate(() => JSON.stringify(window.__dbg.match)));
  console.log('errors', errors.length ? errors : 'none');
  await browser.close();
})();
