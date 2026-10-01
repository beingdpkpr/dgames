# Wordsmith

A crossword tile game. Build words on a 15×15 board, against the computer or friends on the same device. Open `index.html` directly: no build step, no network, works over `file://`. The dictionary sits next to it in `words.js`.

Wordsmith plays by the familiar rules of the genre. The board layout, the tile set and every name are our own. "Scrabble" is a Hasbro/Mattel trademark, and its premium-square layout and tile distribution are part of its trade dress, so neither is copied here (see **Board** and **Tiles**).

## Playing

- **Opponents:** you against 1–3 computer players (Easy, Medium, Hard), or 2–4 people passing one device. Between turns in pass-and-play the racks are hidden behind a "Show my tiles" card.
- **Placing tiles:** drag a tile from the rack to the board, or tap a tile and then a square. Tap a placed tile to send it back, or drag it somewhere else. You can drag tiles within the rack to reorder them. **Shuffle** mixes the rack and **Recall** takes back everything you placed.
- **Small screens:** on a phone a square is about 23 px, smaller than a fingertip. With a tile selected, the first tap on the board zooms in around that spot and the next tap places the tile. Pinch and double-tap also zoom, one finger pans a zoomed board, and the magnifier button in the top bar zooms back out. The board zooms out by itself after each play.
- **Score preview:** while you place tiles, the Play button and a badge on the board show what the play would score. The status line lists the words it makes. An illegal shape (a gap, two rows, not joined) disables Play and says why.
- **Words:** two modes.
  - **Checked** (the default): every word is looked up when you press Play. A word the dictionary lacks is refused with "Not in the dictionary: QX". You lose nothing and can try again.
  - **Challenge:** plays are not checked. Against the computer, a computer opponent challenges a wrong word (Easy half the time, Medium most of the time, Hard always). At a pass-and-play table, everyone sees "Challenge?" after each play. A wrong word comes off the board, scores nothing and costs the turn. A good word earns its player 5 points. You can also challenge the computer's last play, but its words are always good, so that only gives it 5 points.
- **Swap** puts 1–7 tiles back in the bag for new ones, but only while the bag holds at least 7. **Pass** skips the turn.
- **Menu:** the tiles you have not seen yet (bag plus other racks), the move list, how to play, sound, new game.
- **Saving:** the game saves after every turn (`dgames.wordsmith.save`, versioned). On reopening, the setup card offers Resume. A save that will not parse, comes from another version, or does not account for all 100 tiles is discarded, and a note says so. A bad save never crashes the page.
- **High scores:** your best final scores against the computer, using the shared dgames high-score table (`dgames.hiscores.wordsmith`).
- **Keys:** Enter plays, Escape recalls tiles or closes a dialog.

## Rules

These are the standard mechanics, checked against published rule summaries:

- The first word covers the centre star and has at least two letters.
- Every later play is one unbroken line across or down, joined to the tiles already on the board.
- Every new word a play makes is scored: the main word plus every cross-word.
- Letter and word premiums count only on the turn a tile first covers them.
- A blank scores 0.
- Using all seven tiles adds **50**.
- The game ends when a player uses their last tile with the bag empty, or after **six scoreless turns in a row** (passes, swaps and withdrawn plays).
- At the end, everyone subtracts the value of the tiles left on their rack. A player who went out adds the total of everyone else's.

## Board

```
d . . T . . . d . . . T . . d      T  triple word  (8)
. t . . . D . . . D . . . t .      D  double word  (16 + the star)
. . . . d . . D . . d . . . .      t  triple letter (12)
T . . D . . . . . . . D . . T      d  double letter (24)
. . d . . . t . t . . . d . .      *  centre star: doubles the first word
. D . . . . . d . . . . . D .
. . . . t . d . d . t . . . .
d . D . . d . * . d . . D . d
. . . . t . d . d . t . . . .
. D . . . . . d . . . . . D .
. . d . . . t . t . . . d . .
T . . D . . . . . . . D . . T
. . . . d . . D . . d . . . .
. t . . . D . . . D . . . t .
d . . T . . . d . . . T . . d
```

The layout is designed from one octant (`PREM_OCTANT` in the code) and mirrored, so it is symmetric under every rotation and reflection and no seat or direction is favoured. The counts are close to the genre norm (61 premium squares).

- **Triple words** sit on the fourth square in from each corner, not in the corners. That puts them three squares from the triple letters and diagonal double words, so opening one up is a real risk.
- **Double words** form a ring of eight half-way out, a diamond of four at (3,3), and four just off the centre lines.
- **Triple letters** guard the inner ring.
- **Double letters** sit in the corners, on the centre lines, and as a tight ring around the star. Openings score a little more and the first moves have choices.

Every row and column has a premium square. In self-play, Hard against Hard averages about 460 points a player (see **The computer**). The tile set is worth 203 points, against the classic 187.

## Tiles

100 tiles: 98 letters and 2 blanks. They are derived from letter frequency, not copied:

1. **Frequency** of each letter is the mean of two measurements:
   - its share of the letters in the dictionary's 2–8-letter words, leaving out words ending in S so plurals do not inflate S;
   - its share of running English text (the standard Lewand table).

   The first measures what can be played. The second keeps the set feeling like English.
2. **Count** = that share of 98 tiles, at least 1, rounded by largest remainder.
3. **Value** = `1 + round(1.4 × log2(f_E / f) − 1)`, clamped to 1..10. Every halving of frequency is worth about 1.4 points.

| | | | | | | | | | | | | | |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A ×8 **1** | B ×2 **4** | C ×3 **3** | D ×4 **2** | E ×12 **1** | F ×2 **4** | G ×2 **3** | H ×4 **2** | I ×7 **1** | J ×1 **8** | K ×1 **5** | L ×5 **2** | M ×3 **3** | N ×6 **1** |
| O ×7 **1** | P ×2 **3** | Q ×1 **9** | R ×6 **1** | S ×5 **2** | T ×7 **1** | U ×3 **3** | V ×1 **5** | W ×2 **4** | X ×1 **8** | Y ×2 **4** | Z ×1 **8** | blank ×2 **0** | |

The tiles total 203 points. Compared with the classic set: H is commoner and cheaper (4 tiles at 2), S is rarer and worth 2, T and O have 7 each, and Q is worth 9.

## Dictionary

**ENABLE** (Enhanced North American Benchmark LExicon), compiled by Alan Beale and M. Cooper, is **in the public domain**. Its distribution page states: "ENABLE is in the Public Domain." The source used is `enable1.txt` (172,823 lines, sha256 `3f161302…63b1a89`) from <https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt>. No TWL, SOWPODS or Collins material is used, because those lists are licensed.

The game keeps the 168,551 words of 2–15 letters. ENABLE predates a few words that newer official lists added, so for example QI and ZA are not accepted.

`tools/build-words.js` rebuilds `words.js`:

```
node wordsmith/tools/build-words.js enable1.txt
```

It refuses an input with a different sha256 unless given `--any`. It builds the DAWG with the game's own code, lifted from `index.html`, and checks the DAWG reproduces the list exactly. It then checks the packed form round-trips through the game's own decoders. `words.js` records the word count, edge count and the sha256 of the list, and `test/dict.js` recomputes all three from the DAWG.

**Encoding**, measured on the 168,551 words:

| Option | Bytes on disk | Cost at load |
|---|---|---|
| plain word list in a JS string | 1,666,091 | build a trie/DAWG at load |
| word list, gzip + base64 | 587,164 | inflate, then build a DAWG (~0.4 s on desktop, seconds on a slow phone) |
| front-coded list, gzip + base64 | 306,656 | the same build |
| DAWG as raw `Uint32Array`, base64 | 643,392 | none |
| DAWG, gzip + base64 | 436,188 | inflate |
| **DAWG packed (flag byte + varint child deltas), gzip + base64** | **359,387** | **inflate + one linear pass** |

The packed DAWG is the one shipped: 120,636 edges in `words.js`, 351 KB on disk and ~265 KB gzipped on the wire. It loads in one linear pass with nothing to build. The front-coded list is 52 KB smaller, but building a DAWG from it at load costs more than the bytes save on a phone.

The page decodes it with the browser's `DecompressionStream('gzip')`. Where that is missing (Safari before 16.4), it falls back to a small inflate written in the logic section. The tests hold that inflate to node's zlib byte for byte.

**Load time** is base64 → inflate → unpack, from script start to "Start" enabled. It was measured in Chrome with Playwright, and runs vary with machine load:

| | DecompressionStream | hand inflate |
|---|---|---|
| desktop | 40–110 ms | — |
| 4× CPU throttle | 200–580 ms | 160–430 ms |

**Offline:** `words.js` is a plain `<script src>`, so it loads over `file://`, where `fetch()` of a local file does not. Online, the root service worker caches it at runtime like any other same-origin file. This was checked by serving the repo over http with Playwright: after one visit the cache held `wordsmith/index.html` and `wordsmith/words.js`, and with the network off the page reloaded and unpacked all 168,551 words.

## The computer

**Move generation** is the standard Appel–Jacobson algorithm (1988) over the DAWG:

- For each row and column it precomputes every empty square's cross-check: the 26-bit set of letters that make a valid word with the tiles above and below, plus those tiles' points.
- From each anchor square (an empty square next to a tile, or the star), it builds every left part that fits the free squares to its left out of the rack.
- It then extends right through the anchor, threading existing tiles and honouring the cross-checks.
- Blanks try every letter.

Each move is scored as it is recorded. Because every recorded word is a path to an end-of-word edge, the generator cannot produce a word the dictionary lacks.

**Levels:**

- **Easy** plays real words on purpose: up to four tiles, words up to six letters, no blanks while anything else works. From that pool it picks a score between the 50th and 85th percentile, never the best play.
- **Medium** keeps its blanks for plays of 30 or more and picks from the top fifth of all moves by score.
- **Hard** maximises score plus a rack-leave value. The leave values are hand-set: blanks and S are flexible; Q without U, V, W and U are clumsy; duplicates clog; a rack of about 3 vowels to 4 consonants draws best. Hard swaps a hopeless rack when swapping is worth more than the best play. With the bag empty, it plays to go out and charges itself for the tiles it would be left holding.

**Strength:** from `node test/bots.js`, 40 games a pair with seats alternating:

| Pair | Wins | Average score |
|---|---|---|
| Hard v Easy | 40/40 (100%) | 619 – 137 |
| Hard v Medium | 40/40 (100%) | 548 – 235 |
| Medium v Easy | 40/40 (100%) | 360 – 196 |
| Hard v Hard | — | 439 – 483, 23 turns a game |

Hard averages about 1.5 bingos a game. All 200 games in the report finished.

**Never freezes the page.** The search runs in a Web Worker built from a Blob of the page's own logic section, and Chrome allows that from a `file://` page. The dictionary is posted to the worker once. If a worker cannot be made, or dies, the generator runs on the main thread one board line per slice, in 10 ms slices between frames. Add `?noworker` to the URL to force that path.

Checked with Playwright's `longtask` observer over 8–10 computer turns per configuration: there were **no long tasks on the main thread while the computer thinks**, on the desktop and at 4× CPU throttle, in both worker and sliced modes.

**Think time** per move is generate + choose, Hard, measured in Chrome:

| | median | max seen |
|---|---|---|
| desktop, worker | 2–10 ms | 17 ms (740 ms once on a cold worker with a two-blank rack) |
| desktop, main-thread slices | 3–40 ms | 52 ms |
| 4× throttle, main-thread slices | 50–130 ms | 340 ms |

In node over 6,600 moves, the median was 1–2 ms. The 95th percentile was 8–28 ms, and the worst position took 195 ms: two blanks give 30–40k legal moves. DevTools CPU throttling does not reach dedicated workers, so the slow-phone figure is the sliced main-thread path. The computer always takes at least 0.65 s so its reply does not feel instant. Its tiles then fly in from its score chip.

## Look

- A deep green board with ivory tiles. The premium squares are muted blues (letters) and dusty rose and terracotta (words), labelled 2L/3L/2W/3W, with a star in the centre.
- Tiles placed this turn have a brass ring. The last play is outlined.
- Placing a tile gives a small pop and a synthesised wooden knock.
- A score rises from the word ("+24"). A bingo shows a banner over the board with a short burst of tile-coloured confetti.
- Reduced-motion settings cut the animations.

**Layout:**

- **Portrait:** players across the top, then the board, then the status line, rack and buttons. On a tall phone the move list fills the space under the board.
- **Landscape:** a side panel on the left, under the back button, holds the players, move list, rack and buttons, and the board takes the full height on the right.

The page never scrolls. Measured at the brief's sizes:

| viewport | layout | board | square | zoomed square | rack tile | smallest button |
|---|---|---|---|---|---|---|
| 390×844 | portrait | 378 | 24.4 | 42 | 47 | 44 |
| 375×667 | portrait | 363 | 23.4 | 42 | 45 | 44 |
| 360×640 | portrait | 348 | 22.4 | 42 | 43 | 44 |
| 844×390 | landscape | 378 | 24.4 | 42 | 55 | 44 |
| 667×375 | landscape | 363 | 23.4 | 42 | 35 | 44 |
| 1280×800 | landscape | 788 | 50.8 | (no zoom) | 55 | 44 |

**The board view is separable.** Everything that draws the board or maps a screen point to a square sits behind one small `view` object: `layout`, `render(cells, pending, last)`, `animatePlacement(sqs, from)`, `squareAt(x, y)`, `highlight(sq)`, `floatText`, `pill`, and the zoom calls particular to this flat view. A different view, such as the shared 3D tabletop planned for these games, can replace it without touching the game.

## Tests

`npm test` at the root runs the first four. Each lifts the logic section of `index.html` (above `// ---------- UI ----------`) into node's vm.

- `node test/rules.js` checks:
  - the tile set and layout as designed, including symmetry;
  - scoring against hand-worked numbers: letter-then-word premiums, premiums used only once, a parallel play scoring three words, one tile on a 2W doubling both its words, the 50-point bingo, blanks at 0;
  - legality: centre star, two letters, one line, no gaps, joined, squares free;
  - swap limits, six scoreless turns, the end-of-game adjustment (two and three players);
  - challenge withdrawal restoring board, bag order, rack and score exactly, and the 5 points for a failed challenge;
  - saves: a round trip, and damaged, old and junk saves returning null without throwing;
  - the whole page script, UI half included, compiling;
  - the back button and high-score module byte-identical to `tetris/index.html`.
- `node test/dict.js` checks that `words.js` decodes through the game's own base64, inflate and unpack, and that the hand inflate matches zlib (stored, fixed and dynamic blocks). The DAWG must hold exactly 168,551 words, sorted, with the recorded sha256, and lookups must be right at the edges.
- `node test/movegen.js` checks the generator three ways:
  - **Brute force:** on positions from real play, every placement of 4 tiles (small dictionary) or 3 tiles (full dictionary), blanks included, is enumerated the slow way. The generator must give exactly the same set and scores, with no duplicates.
  - **Known best move:** RETAINS on an empty board scores 90, found independently from every anagram at every placement.
  - **Fuzz:** about 120,000 generated moves over 188 positions, each legal, scored as the referee scores it, made of dictionary words and using rack tiles.
- `node test/ai.js` checks:
  - Hard beats Easy, Hard beats Medium and Medium beats Easy over 8 seeded games each; all were 8/8 when written;
  - 2, 3 and 4-player games terminate with all 100 tiles accounted for after every turn;
  - Easy's short real words and middling picks;
  - Hard swapping QVVWUUI only while the bag allows it, passing when nothing is possible, going out in the end-game;
  - the worker's job shape.
- `node test/bots.js` is a report, not a test. It plays the long level-against-level matches above and is listed under `reportOnly` in the root `package.json`.
