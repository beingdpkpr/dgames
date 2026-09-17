#!/usr/bin/env node
// Runs every game's tests. Discovers them by walking <game>/test/*.js, so adding a game or a test file
// needs no edit here. Run: npm test   (or: node scripts/run-tests.js)
//
// Two things get skipped rather than run, and both announce themselves instead of passing quietly:
//
//  1. Tests listed in the `dgames.browserTests` block of package.json. They drive a real browser, which
//     is too slow and too fragile for the default suite. `npm run test:visual` runs those and only those.
//  2. Files listed in `dgames.reportOnly`. These assert nothing and always exit 0 — they print a tuning
//     distribution for a human to read. A file that cannot fail cannot gate anything, so running one in
//     CI only makes the gate slower. `npm run test:all` includes them when you actually want to read one.
//  3. Tests whose `require()`s cannot be resolved. Every cricket-3d test needs `three` or `playwright`
//     from cricket-3d/node_modules, which is gitignored — so on a fresh clone they would explode with
//     "Cannot find module" and look like real failures. Skipping names the missing package and the fix.
//
// A skip is never a pass. The summary counts them separately and `--strict` turns any skip into a failure,
// which is what CI uses once it has installed the dependencies: there, a skip means the install silently
// failed and the coverage we think we have is imaginary.
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const BROWSER_TESTS = new Set((pkg.dgames && pkg.dgames.browserTests) || []);
// Files that are reports rather than tests: they assert nothing and always exit 0, so running them in a
// gate costs time and buys no signal. Kept out of the default suite for that reason, not for being slow.
const REPORT_ONLY = new Set((pkg.dgames && pkg.dgames.reportOnly) || []);
const isExcluded = (f) => BROWSER_TESTS.has(f) || REPORT_ONLY.has(f);

const args = new Set(process.argv.slice(2));
const only = args.has('--only-browser') ? 'browser' : args.has('--all') ? 'all' : 'default';
const strict = args.has('--strict');

// <game>/test/*.js. Sorted so the output is the same every run and a diff of two CI logs is readable.
function findTests() {
  const out = [];
  for (const game of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!game.isDirectory() || game.name.startsWith('.') || game.name === 'node_modules' || game.name === 'scripts') continue;
    const dir = path.join(ROOT, game.name, 'test');
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.js')) out.push(game.name + '/test/' + f);
    }
  }
  return out.sort();
}

// The packages a test pulls in that node cannot supply on its own. Bare specifiers only: './x' is the
// test's own file, and a builtin is always there.
function externalDeps(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const name = m[1];
    if (name.startsWith('.') || name.startsWith('/')) continue;
    if (module.constructor.builtinModules.includes(name.replace(/^node:/, ''))) continue;
    names.add(name);
  }
  return [...names];
}

function missingDeps(file) {
  const from = path.dirname(path.join(ROOT, file));
  return externalDeps(file).filter((name) => {
    try { require.resolve(name, { paths: [from] }); return false; } catch { return true; }
  });
}

const tests = findTests().filter((f) => (only === 'browser' ? BROWSER_TESTS.has(f) : only === 'all' || !isExcluded(f)));
if (!tests.length) {
  console.log(only === 'browser' ? 'no browser tests configured' : 'no tests found');
  process.exit(0);
}

let passed = 0, failed = 0, skipped = 0;
const failures = [];

for (const file of tests) {
  const missing = missingDeps(file);
  if (missing.length) {
    const game = file.split('/')[0];
    console.log(`skip ${file}  (needs ${missing.map((m) => `'${m}'`).join(', ')} — run \`npm ci\` in ${game}/)`);
    skipped++;
    continue;
  }
  // cwd is the game folder, matching how each game's own package.json scripts invoke these ("node test/x.js").
  const r = spawnSync(process.execPath, [path.join('test', path.basename(file))], {
    cwd: path.join(ROOT, file.split('/')[0]), encoding: 'utf8', timeout: 5 * 60 * 1000,
  });
  if (r.status === 0) {
    console.log(`ok   ${file}`);
    passed++;
  } else {
    const why = r.error ? r.error.message : r.signal ? `killed by ${r.signal}` : `exit ${r.status}`;
    console.log(`FAIL ${file}  (${why})`);
    failed++;
    failures.push({ file, out: ((r.stdout || '') + (r.stderr || '')).trimEnd() });
  }
}

for (const f of failures) {
  console.log(`\n--- ${f.file} ---`);
  console.log(f.out || '(no output)');
}

const parts = [`${passed} passed`];
if (failed) parts.push(`${failed} failed`);
if (skipped) parts.push(`${skipped} skipped`);
console.log(`\n${parts.join(', ')}`);

if (strict && skipped) {
  console.log('--strict: a skipped test counts as a failure, because the dependencies were meant to be installed');
  process.exit(1);
}
process.exit(failed ? 1 : 0);
