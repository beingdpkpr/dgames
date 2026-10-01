# Life Journey

*A whole life in one sitting.* A family board game for two to six players on one device: spin, drive your car down a winding road from school to retirement, pick your roads at the forks, and see whose life was worth the most. Each seat is a human (pass-and-play) or a computer with a personality — **Cautious** or **Risky**. Open `index.html` directly; nothing is fetched except an optional display font (Fredoka; offline it falls back to the system font).

The mechanics are the classic life-journey ones: a 1–10 spinner, stop spaces, pay days, careers and salaries, houses, loans, hidden-value rewards counted at the end. The name, the track, the careers, houses, event cards, memories, texts and art are original to this game, in an Indian setting with plain English text. `test/rules.js` fails if a trademarked name or phrase from the well-known version appears anywhere in the page.

## The journey

Start → **college** (₹100K fees, the bank lends it; Graduation Day offers two degree jobs) or **start working** (First Job offers two jobs; pay days start at once) → **Wedding Season** (a big family wedding, a small ceremony, or not now — all three are fine choices) → **Find a Home** (two houses, or keep renting) → the **family road** (babies and twins, gifts from everyone) or the **adventure road** (trips and a dog) → **city lights** (more pay days and events) or **hometown** (more memories, Festival Night) → the **startup gamble** (no pay days, investor calls, Pitch Day) or the **steady road** → **Midlife Crossroads** (keep, switch careers, or night school) → **Property Fair** (buy, sell on a spin, or walk past) → **Retirement**.

141 spaces; a single journey is 100–103 of them depending on the roads. Red stop spaces stop a car even with steps left; a fork passed mid-move asks for the road on the way and finishes the move down it.

## Rules implemented

- Spinner 1–10, decided by the rules before the wheel moves; the wheel then decelerates onto that number, clicking past every peg. Quick games move double the spin.
- **Pay Day** pays your salary (plus any raises) every time you pass or land on it.
- **Event cards** (32, original and mostly funny): money in or out, raises, memories, per-child and per-house costs, gifts from every player, and spin-to-find-out gambles.
- **Memories** (40, ₹50K–₹250K) are taken face down and revealed at the retirement party.
- **Careers**: 10 degree jobs (₹65K–₹110K) and 10 that need none (₹50K–₹80K); each card is unique, unchosen cards go back to the deck.
- **Houses** (10 cards): buy at Find a Home and the Property Fair; at retirement every house is sold — spin 1–5 for its low price, 6–10 for its high one. Every house is worth a little more than its price on average.
- **Loans** of ₹50K, taken automatically when a payment is short (cash never goes negative during the game) or by hand from the Bank before a spin. Repay before a spin for ₹50K; any still open at retirement cost ₹60K each.
- **Children**: up to four pegs ride in the car; a baby beyond that becomes a memory.
- **Retirement**: a bonus by order (₹100K, 60K, 40K, 20K, 10K, 10K), then the hills (a ₹40K pension) or the sea (spin 6+: +₹100K, else −₹20K), houses sold, loans settled, and you are out of the turn order. When everyone has retired the richest — cash plus memories — wins; a tie goes to more memories.
- **Save and resume**: saved to `localStorage` after every move (`dgames.life-journey.save`; options in `dgames.life-journey.opts`). Versioned and shape-checked: anything unreadable, from another version, or describing an impossible state is cleared with a notice and a fresh game offered. The spinner's generator state is part of the save, so a resumed game plays on exactly as it would have.
- Best final worth table on this device (the shared dgames high-score module).

## Computer players

Two personalities, deciding with a little randomness from the game's own generator. **Cautious** keeps cash, avoids loans, mostly takes the steady road and the small ceremony, buys the cheaper house only if it barely needs a loan, repays loans early and retires to the hills. **Risky** takes the startup road and the big wedding, buys the dearer house on credit, keeps loans open, and retires by the sea. Both pick the best salary on offer.

Over 300 seeded four-player games each road at every fork averages within 15% of its alternative (`test/sim.js` checks this), so every choice is a real one. Risky wins a little more than its share in bigger games (see `test/bots.js`).

## Game length

From `test/sim.js` and `test/bots.js` (computer players, seeded): a median of **22 turns per player** for the full journey (10th–90th percentile 19–25, longest seen 32) and **13** in Quick (11–16). No game in thousands has needed the turn cap. Measured in Chromium at normal speed a computer turn takes about 7.5 s, so a four-player game runs roughly 11–15 minutes and a three-player one 8–11, more when people stop to read the cards; Fast animations roughly halves it.

## The board view

The board is an SVG view behind a small interface (`makeBoardView`: `build`, `render(S)`, `step(S, p, to)`, `follow(p)`, `payday`, `bubble`, `pulse`, `nodeAt`, `setMode`, `resize`) with the spinner as its own component (`makeSpinner().spin(v)`), so a shared 3D table can replace it later. Track geometry (`TRACK[i].x/y/tx/ty`, `WORLD`) lives with the rules, so any view places the spaces the same way. On a phone the camera follows the car; drag to look around, and the frame button shows the whole map. Tap any space to see what it does.

## Tests

- `node test/rules.js` — the track (every branch combination reaches Retirement, forks rejoin, nothing overlaps), stop spaces mid-move, pay days passed and landed on, forks chosen before a spin and mid-move, loans and the retirement penalty, every space type, every event card (both outcomes of the spin cards), weddings, houses bought and sold, the fair, the crossroads, retirement and scoring, computer choices always legal, determinism, save round-trip and 15 broken saves rejected, original names, and the two shared snippets byte-identical to tetris.
- `node test/sim.js` — 1,500 seeded computer games, full and quick, two to six players: all end, none capped, length in its target band, roads balanced.
- `node test/bots.js` — report only: length distributions, Cautious vs Risky win shares, average final worth by every choice.
