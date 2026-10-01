# Mahanagar

*Buy the city.* A property-trading board game across eight Indian cities, for two to six players on one device. Each seat is a human or a computer at Easy, Normal or Hard. Open `index.html` directly — no dependencies, and nothing is fetched except an optional display font (Rozha One; offline it falls back to Georgia).

The mechanics are the classic property-trading ones. The name, the board, the street names, the card texts, the tokens and the look are original to this game: Varanasi to Mumbai in eight colour groups, four railway stations, a power grid and a water board, and two card decks — **Kismat** (fate: mostly journeys) and **Khazana** (treasury: mostly money). `test/rules.js` fails if a trademarked board name or card wording ever appears in the page.

## The board

| Group | City | Streets |
|---|---|---|
| brown | Varanasi | Assi Ghat, Godowlia |
| sky | Lucknow | Aminabad, Chowk, Hazratganj |
| pink | Jaipur (the Pink City) | Johari Bazaar, Bapu Bazaar, MI Road |
| orange | Hyderabad | Charminar, Abids, Banjara Hills |
| red | Kolkata | College Street, Esplanade, Park Street |
| yellow | Bengaluru | Malleshwaram, Koramangala, Indiranagar |
| green | Delhi | Chandni Chowk, Khan Market, Connaught Place |
| navy | Mumbai | Marine Drive, Malabar Hill |

Stations: Chennai Central, Howrah Junction, Delhi Junction, Mumbai Central. Corners: Start, Jail, Chai Break (free parking), Go to Jail.

On a 360 px phone each edge space is about 28 px wide, too narrow for a name, so the board carries colour, an icon and the price; tapping any space opens its full deed (owner, rent table with the current level highlighted, house cost, mortgage values, and build/sell/mortgage buttons when it is yours to manage).

## Rules implemented

- 2–6 players, ₹1500 each, ₹200 for passing or landing on Start. Pass-and-play for people on one device.
- Two dice; doubles roll again; a third double in a turn goes straight to jail without moving.
- Jail: pay ₹50 before rolling, use a get-out card, or roll for doubles. Doubles free you and move you (no extra roll). After a third failed try the fine is compulsory and you move by that roll — if you cannot pay, it becomes a debt and you still move. You collect rent while inside.
- Unowned lot: buy at its price or decline; declining sends it to **auction** (option, on by default), an open ascending auction round the table from the current player in which you raise or drop out for good. No bids leaves it with the bank.
- Rent: bare rent, doubled when one owner holds the whole city (even if part of it is mortgaged), then houses 1–4 and a hotel; stations ₹25/50/100/200 for one to four owned; utilities 4× the dice, 10× with both. Kismat's "nearest station" cards charge double; its power-cut card charges ten times a fresh roll.
- Building only on a whole, unmortgaged city, **evenly** (a house only on a lot with the fewest; selling only from the lot with the most). A hotel needs four houses everywhere and returns them to the bank. The bank has **32 houses and 12 hotels**; when they run out nobody can build. Selling a hotel in a shortage gives the houses the bank has and sells the rest at half price too.
- Buildings sell back at half price. Mortgage pays half the price; lifting it costs that plus 10%, rounded up in integer arithmetic (a ₹200 station lifts for ₹110 — `Math.ceil(200 * 0.55)` would say 111). A lot can only be mortgaged once its whole city is bare.
- Trades between any players: lots, cash and get-out cards both ways, only while the lots' cities are bare. A mortgaged lot arrives with its loan and the receiver pays the 10% interest at once.
- Debts: a payment you cannot cover is not taken in part; the game waits while you sell or mortgage, then you pay or declare bankruptcy. Cash never goes negative. A card that collects from every player can put someone else in debt out of turn.
- Bankruptcy to a player: buildings go back to the bank at half price, then cash, lots (mortgages included, the creditor paying 10% interest on each) and get-out cards go to the creditor. To the bank: lots return unmortgaged and are auctioned one at a time. Last player standing wins.
- House rule (off by default): **Chai Break jackpot** — taxes and fines go into a pot for whoever lands on Chai Break.
- **Quick games**: a round limit (30, 20 or 12 rounds) after which the richest by net worth wins (cash + printed price, half for a mortgaged lot + buildings at cost), and an optional head start dealing two random streets each, re-drawn so nobody starts with a whole city.
- **Save and resume**: the game saves itself to `localStorage` after every move (`dgames.mahanagar.save`; options in `dgames.mahanagar.opts`). The save is versioned and shape-checked; anything that does not parse, has another version or would load an impossible state is discarded with a notice and a fresh game offered. The dice generator's state is part of the save, so a resumed game plays on exactly as it would have.

Every phase has a move that is always legal (roll, decline, drop out, pay-or-go-bankrupt, refuse the offer, end the turn), and the computer falls back to it if its own choice is refused, so no reachable state leaves the game with nobody able to act. `test/rules.js` plays 60 games in which three seats choose at random among everything a person can do, and checks every one ends.

## Computer players

Everything is decided from one valuation: what a player's position is worth — cash, plus each holding valued at what it would fetch plus the rent it is expected to earn over a horizon of opponent turns. The expected rent uses the measured chance of a roll ending on each square (`FREQ`, from 2,000,000 rolls of this engine; `test/sim.js` re-measures it and fails on drift). That makes a whole city worth far more than its printed price: a complete orange set with three houses takes about ₹50 per opponent turn, a lone orange lot under ₹0.5. A set's development value is scaled by how much of the build the owner can actually afford, so buying a set with your last rupee is not mistaken for a coup.

- **Buying**: Normal buys while keeping ₹80; Hard values the lot (its own gain plus keeping it from whoever would gain most), keeps a reserve, and declines on purpose when nobody else could afford the auction that follows.
- **Auctions**: bid up to their valuation, jumping half the remaining gap so computer-only auctions take a few bids. Normal and Hard never cap below the printed price: at 0.9× an Easy that never bought anything and only bid at auction beat Normal in 58% of 200 two-player games.
- **Building**: one house at a time on the lot that adds most expected rent per rupee (which races sets to the third house), while cash stays above a reserve scaled to the danger ahead — the rents 2–12 squares on and the worst on the board, less half of what loose lots would raise by mortgage.
- **Raising cash**: mortgage lots outside any set (least valuable first), then sell houses from the set that loses least rent, then mortgage bare sets.
- **Jail**: leave early while there is property to buy; stay and roll for doubles late, when the board is dangerous.
- **Trading**: a trade is judged by the change in the AI's own worth minus `w` times the other side's gain (1 in a two-player game). Handing someone a set without getting one is judged with `w = 1` plus a premium of half that city's price, so no level sells a set-completing lot for its list price — tested for every group, every level, two and four players. Computers look for the lots that finish one of their sets, pay in cash and/or a lot that finishes a set for the seller, and set the cash so the seller should accept. At most one offer per turn, a cool-down per pair (eight rounds toward a person), and an empty search is not repeated until ownership changes. When a person proposes, the computer accepts, refuses, or counters asking for more cash.
- **Levels**: Easy is short-sighted (horizon 10 turns), sloppy (noise on trade judgement, though never on giving a set away), buys three times in four, builds at random and never starts a trade. Normal uses rules of thumb and a 16-turn horizon. Hard uses the full valuation with a 30-turn horizon.

Two computers with the same model can never both gain from a two-player swap — by their shared measure it is zero-sum — so with nobody holding a set a game could stall for a thousand turns. From round 25, while nobody has a whole city, a swap that finishes a set for both sides is accepted at a small loss.

### How much the level matters (`node test/bots.js`, 400 seeded games per line-up, seats rotated)

| Line-up | Share of wins per seat |
|---|---|
| 2 Hard, 2 Normal | Hard 33.3% ±1.7, Normal 16.8% ±1.3 |
| 2 Hard, 2 Easy | Hard 38.3% ±1.7, Easy 11.8% ±1.1 |
| 2 Normal, 2 Easy | Normal 40.6% ±1.7, Easy 9.4% ±1.0 |
| Hard, Normal, Easy ×2 (6 players) | Hard 33.1%, Normal 14.6%, Easy 2.3% |
| Hard v Normal (2 players) | Hard 51.2% ±2.5 |
| Hard v Easy (2 players) | Hard 54.8% ±2.5 |
| Normal v Easy (2 players) | Normal 53.5% ±2.5 |

With three or more players the levels separate clearly. **Head to head they barely do**: in a two-player game every trade is zero-sum between the two, so the computers rarely find one both accept, and the dice decide most games. Measured, not assumed — several tuning attempts (longer horizon, looser reserve, more aggressive bidding) each moved it by under two points.

## Length

Four computers end a full game after a median of about 180 turns (45 rounds); the longest of 200 seeded games in `test/sim.js` ran 933 turns. A hard cap of 1500 turns ends a game by net worth — it was hit by 0 of 200 four-player games, 1 of 60 two-Hard games and 5 of 400 six-player games. At normal speed a computer turn takes about 4.4 s in the browser, so a 20-round quick game against three computers is about 8 minutes. *Fast* in the menu halves every animation.

## Tests

`node test/rules.js` (107 checks, ~2 s): the board and its original names; rent in every case (110 house/hotel cases, stations 1–4, utilities, card multipliers, mortgaged lots); even building and the housing shortage; mortgage values and the no-build-on-mortgaged-set rule; doubles and three doubles; every jail exit; passing Start; all 32 cards; bankruptcy to a player and to the bank; auctions; trades and how computers judge them; save/resume round trip and rejection of bad saves; 60 random-play games that must all end; the quick-game limit; the deal; and that the back button is byte-identical to Tetris's.

`node test/sim.js` (~10 s): the landing table still matches the board; 200 four-player, 60 two-player and 60 six-player computer games all finish and stay under the turn cap (≤2%); 60 quick games stop at round 21; two Hard beat two Easy (81.5% of 200).

`node test/bots.js` is the level report above; it asserts nothing and is listed under `dgames.reportOnly` in the root `package.json`.

The rules and computer players live above the `// ---------- UI ----------` marker in `index.html` and never touch the DOM, a clock or `Math.random`, which is what lets the tests load them with node's `vm`. The page exposes `window.__mahanagarUI` (start a seeded game, let the Hard computer play the human seats, set the animation speed) for browser-driven checks.
