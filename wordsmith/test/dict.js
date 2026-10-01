// The dictionary: words.js decodes, through the game's own base64 + inflate + unpack, to a DAWG holding exactly
// the word list it was built from (count and sha256 of the list both recomputed here from the DAWG), the
// hand-written inflate agrees with node's zlib byte for byte, and lookups behave at the edges (prefixes,
// case, lengths). Run: node test/dict.js
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const { performance } = require('perf_hooks');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf("'use strict';"), html.indexOf('// ---------- UI ----------'));
const ctx = { console, Math, Map, Set, Uint32Array, Int32Array, Int8Array, Uint8Array, Uint16Array, Array, Object, String, JSON, Number, Error, performance };
ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
const W = ctx.__ws;
const text = fs.readFileSync(path.join(__dirname, '..', 'words.js'), 'utf8');
const wctx = {}; vm.createContext(wctx); vm.runInContext(text, wctx);
const DICT = wctx.WORDSMITH_DICT;

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (cond) console.log('ok   ' + msg); else { failures++; console.log('FAIL ' + msg); } };

ok(/public domain/i.test(text.slice(0, 600)) && /ENABLE/.test(text.slice(0, 600)), 'words.js names its source (ENABLE) and its public-domain status');
ok(DICT && typeof DICT.gz === 'string' && DICT.words > 160000, 'words.js assigns WORDSMITH_DICT (' + (DICT && DICT.words) + ' words, ' + (text.length / 1024).toFixed(0) + ' KB)');

let t = performance.now();
const bytes = W.b64bytes(DICT.gz);
const ref = zlib.gunzipSync(Buffer.from(DICT.gz, 'base64'));
ok(Buffer.from(bytes).equals(Buffer.from(DICT.gz, 'base64')), 'the game\'s base64 decoder matches node\'s');
t = performance.now();
const mine = W.gunzip(bytes);
const tInflate = performance.now() - t;
ok(Buffer.from(mine).equals(ref), 'the game\'s inflate matches zlib byte for byte (' + mine.length + ' bytes, ' + tInflate.toFixed(0) + ' ms)');
t = performance.now();
const E = W.unpackDawg(mine);
const tUnpack = performance.now() - t;
ok(E.length === DICT.edges, 'unpacked DAWG has the edge count the header promises (' + E.length + ', ' + tUnpack.toFixed(0) + ' ms)');
const D = W.makeDict(E);
const words = [];
W.allWords(D, (w) => words.push(w));
ok(words.length === DICT.words, 'enumerating the DAWG gives ' + words.length + ' words');
ok(crypto.createHash('sha256').update(words.join('\n')).digest('hex') === DICT.check, 'sha256 of the enumerated list matches the one recorded at build time');
let sorted = true; for (let i = 1; i < words.length; i++) if (words[i - 1] >= words[i]) { sorted = false; break; }
ok(sorted && words.every((w) => /^[A-Z]{2,15}$/.test(w)), 'all words 2-15 letters A-Z, strictly sorted (no duplicates)');

for (const w of ['AA', 'QUIXOTIC', 'ZYZZYVA', 'RETAINS', 'JINX', 'CWM', 'QAT', 'XU']) ok(W.hasWord(D, w), w + ' is in');
for (const w of ['QI', 'ZA', 'XYZZY', 'A', 'RETAINSS', 'QUIXOTI', 'quixotic', 'ABCDEFGHIJKLMNOP', '']) ok(!W.hasWord(D, w), JSON.stringify(w) + ' is out' + (w === 'QI' || w === 'ZA' ? ' (ENABLE predates QI and ZA)' : ''));
const pre = W.walk(D, 'QUIXOTI');
ok(pre && pre.node && !pre.t, 'a prefix walks to a node but is not itself a word');

// a small hand-made list through build -> pack -> gzip -> inflate -> unpack
{
  const list = ['cat', 'cats', 'CAR', 'cart', 'carts', 'dog', 'dogs', 'do', 'zebra', 'x', 'toolongtobeawordhere', 'ca-t'];
  const e1 = W.buildDawg(list);
  const e2 = W.unpackDawg(W.gunzip(new Uint8Array(zlib.gzipSync(Buffer.from(W.packDawg(e1))))));
  ok(e1.length === e2.length && e1.every((v, i) => v === e2[i]), 'build/pack/gzip/inflate/unpack round trip on a small list');
  const d = W.makeDict(e2), got = [];
  W.allWords(d, (w) => got.push(w));
  ok(got.join(',') === 'CAR,CART,CARTS,CAT,CATS,DO,DOG,DOGS,ZEBRA', 'case folded; 1-letter, 16+-letter and non-letter entries dropped (' + got.join(',') + ')');
}
// a stored (uncompressed) block and a fixed-Huffman block go through the inflate too
{
  const data = Buffer.from('wordsmith '.repeat(50));
  for (const level of [0, 1]) {
    const gz = zlib.gzipSync(data, { level, strategy: level ? zlib.constants.Z_FIXED : undefined });
    ok(Buffer.from(W.gunzip(new Uint8Array(gz))).equals(data), 'inflate handles a ' + (level ? 'fixed-Huffman' : 'stored') + ' block');
  }
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
