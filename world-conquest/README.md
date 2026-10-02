# World Conquest

*Take the world by dice and diplomacy.* A world conquest strategy game for two to six players on one device. Each seat is a human (pass-and-play) or a computer at Easy, Normal or Hard. Open `index.html` directly — no dependencies, nothing fetched.

The mechanics are those of the classic dice-and-armies conquest board game. The map — its shapes, the territory list, who borders whom, the sea lanes and the continent bonuses — is original to this game, as are the card marks and every line of text. `test/rules.js` fails if the page names the trademarked game or its publisher, or if any territory shares a name with the classic board.

## The map

Forty territories in six continents, with real geographic area names (Deccan, Patagonia, Maghreb…) in plain English:

| Continent | Territories | Ways in | Bonus |
|---|---|---|---|
| North America | Yukon, Hudson Bay, Labrador, Cascadia, Great Plains, Appalachia, Mexico | 3 | 4 |
| South America | Orinoco, Andes, Amazonia, Bahia, Pampas, Patagonia | 2 | 3 |
| Europe | Nordic, Isles, Iberia, Rhineland, Baltic, Alps, Balkans | 4 | 5 |
| Africa | Maghreb, Nile, Sahara, Sahel, Horn, Rift Valley, Kalahari | 3 | 4 |
| Asia | Anatolia, Arabia, Persia, Steppe, Taiga, Gobi, Deccan, Manchuria, Mekong | 5 | 6 |
| Oceania | Borneo, Papua, Outback, Tasman | 1 | 2 |

**How it is drawn.** The world is a small picture in the source: one character per cell of a hex grid (`MAP_ROWS`), a continent letter or `.` for sea. Each territory names one hint cell. Territories grow out from their seed cells, through their own cells only — so every territory is one piece — and never across a continent's edge. A step costs the territory's weight, and the weights are tuned until a continent's territories come out about the same size (smallest 11 cells, largest 28), while the seeds drift to the middle of their regions (Lloyd's method) so the shapes stay round. Borders are the hex edges between two different owners, chained from one junction to the next and smoothed once (edge midpoints, two relaxation passes, one corner-cutting pass), so both sides of every border use the very same line and the map cannot disagree with the rules about who touches whom. Adjacency is computed from shared edges; the only hand-made links are eleven dashed **sea lanes** (Labrador–Isles, Isles–Nordic, Isles–Rhineland, Iberia–Maghreb, Balkans–Nile, Bahia–Sahel, Yukon–Manchuria round the back of the world, Mekong–Borneo, Borneo–Papua, Borneo–Outback, Papua–Tasman).

**Continent bonuses** follow one formula: *bonus = round((territories + ways in) ÷ 2 − 1)*, at least 2, where a "way in" is a territory with a neighbour in another continent. A bigger continent pays more, and so does one with more fronts to hold. This reproduces the familiar scale (a small continent with one door is worth 2; a sprawling one with five doors, 6). The table above is computed by the game and checked by the test.

## Rules implemented

- **Setup.** The territories are dealt at random, one army on each; the rest of each player's starting armies (40 / 35 / 30 / 25 / 20 for 2 / 3 / 4 / 5 / 6 players) are spread at random over their own territories — the same rule for every seat, human or computer, so it is quick on a phone and nobody starts better placed. With **two players** a grey neutral army joins and holds a third of the world; it never attacks, only defends, and never needs to be beaten.
- **Reinforce.** Territories ÷ 3 (rounded down, at least 3), plus every continent held whole, plus alliance aid. Tap your territories to place (each tap adds one), fine-tune with − and +, Confirm.
- **Cards.** Take at least one territory in a turn to earn one card. Each card shows a territory and a mark (Ship, Tower, Star); two are wild. A set — three of a mark, one of each, or any two with a wild — trades for 4, 6, 8, 10, 12, 15, then 5 more each time, counted across the whole table. A traded card showing a territory you own puts 2 extra armies there. With 5 or more cards you must trade (every 5-card hand holds a set — the test checks all of them).
- **Attack.** From a territory with 2+ armies to a neighbour. The attacker rolls up to 3 dice (one fewer than its armies), the defender up to 2; highest against highest, second against second; ties go to the defender. **Roll** throws once; **Blitz** keeps rolling until you win or are down to the number you set with − and + (the panel shows the exact chance of taking the territory). Win and you must move in at least as many armies as dice you rolled, up to all but one.
- **Fortify.** Once, from one territory to another of yours joined through your own land. It ends the turn.
- **Elimination.** Take a player's last territory and you take their cards; holding 6 or more, you trade at once (down to 4 or fewer), place those armies and attack on.
- **Winning.** *Classic*: be the last player standing. *Quick* (about 20–30 minutes): hold 24 of the 40 territories or 3 whole continents at any moment — or lead on score (2 per territory + 1 per army) at the end of round 12.

## Truces and alliances

A light diplomacy layer that works with computer players. Open **Talk**:

- **Truce**: neither of you attacks the other for 3 rounds.
- **Alliance against the leader**: a truce, plus **+2 armies a turn** for both of you while it lasts. Only when there is a clear *leader* (score at least 1.3× everyone else's — they wear a crown), and the leader cannot be in it.
- **One offer per turn**, during Reinforce or Attack. A computer answers at once; a human is asked on the spot (pass the device).
- **Breaking a pact**: you may attack a partner, but you are asked first, and it costs **30 trust** and **one of your cards**, handed to the victim. Keeping a pact to its end earns both sides **10 trust**.
- **Trust** (0–100, everyone starts at 60) is shown on every player's chip and in Talk. Computers weigh it when you ask.

**It can never stall.** Nobody may hold more than *(players left − 2)* pacts, so everyone always has someone they are free to fight; when a knock-out shrinks the table, the soonest-ending pacts lapse to restore that; with two players left every pact ends and no new one can be signed; the same two must wait 2 rounds after a pact before the next; pacts last 3 rounds at most. `test/sim.js` checks these at every step of 25 whole five-player games.

**Computer diplomacy.** Each computer has a character — *keeps its word*, *fights first* or *breaks deals when it pays* — shown in Talk. They propose alliances against the leader (Hard always, Normal half the time, Easy rarely) and truces to a stronger neighbour so they can fight elsewhere; they accept by weighing the shared border, whether the asker is the leader (Hard almost never helps the leader), their character, and the asker's trust. A loyal or Easy computer never breaks a pact. A cunning one breaks it only to complete a continent or knock the partner out, a bold one only to knock the partner out — at 80%+ odds, and only while its own trust is 40 or more.

## Computer players

- **Easy** places at random along its borders, attacks whenever it outnumbers a neighbour (and tires after a few attacks, except for overwhelming ones), moves in a random amount, fortifies half the time.
- **Normal** stages its armies on the attack that best builds toward a continent, attacks at 65%+ odds (bolder the longer it goes without a conquest), moves everything in unless its old territory is still on a front (then keeps a third back), fortifies its most threatened border, trades sets as soon as it has one.
- **Hard** reads the exact blitz odds, values a target by continent progress, completing or breaking a continent, knocking out a weak player for their cards, hitting the leader or its alliance's target; takes a cheap territory each turn for the card; holds its continents with a light guard on the weakest door; times its card trades (from the 8-army set, or at 4 cards); plays the diplomacy table to fight one front at a time.

Report (`node test/bots.js`, 300 games per line-up, seats rotated; share of wins per seat):

| Line-up | Classic, talk on | Classic, talk off | Quick, talk on |
|---|---|---|---|
| Hard v Normal v Easy | Hard 59.3%, Normal 37.3%, Easy 3.3% | Hard 58.3%, Normal 35.3%, Easy 6.3% | Hard 54.3%, Normal 39.3%, Easy 6.3% |
| Hard v Normal (+ neutral) | Hard 67.7%, Normal 32.3% | Hard 67.7%, Normal 32.3% | Hard 64.0%, Normal 36.0% |
| Hard v 3 Normal | Hard 35.7%, each Normal 21.4% | Hard 33.7%, each Normal 22.1% | Hard 35.0%, each Normal 21.7% |
| Normal v 3 Easy | Normal 63.7%, each Easy 12.1% | Normal 62.0%, each Easy 12.7% | Normal 55.7%, each Easy 14.8% |

Standard errors are about ±2.8 points (±1.4 for the three-of-a-level seats). Hard's 4-player edge used to come only from diplomacy (talk off it was 22.7% against Normal's 25.8%); three of its habits were measured to cost games — guarding continents with half its armies, keeping half the threat back when moving in, and fortifying toward its next attack instead of its weakest border — and were cut back, which took it to 33.7%.

Game length, Normal computers (rounds; a round is everyone having one turn): quick averages 6.5 / 7.3 / 9.4 / 9.8 / 9.6 rounds for 2 / 3 / 4 / 5 / 6 players (never past 12); classic 12.2 / 17.4 / 19.5 / 19.4 / 17.6 (longest of 300: 57). Diplomacy at a five-computer table: 17 offers, 10 pacts (7 of them alliances against the leader) and 0.5 broken pacts per game.

## On a phone

- The map is an SVG: pinch or + / − to zoom, drag to look around. Small territories are easy to hit: a tap near an army badge picks that territory, then the land under the finger, then (in the sea) the nearest badge within reach.
- No page scroll at 390×844, 375×667, 360×640, 844×390, 667×375 or 1280×800; every button is at least 44×44; the back button overlaps nothing. The side panel takes whatever height the map does not need, and the spare space shows recent events.
- **Save and resume**: the game is saved after every action (`dgames.worldConquest.save`, versioned). A broken or old save is dropped and a fresh game offered — never a crash. The dice live in the save, so a resumed game carries on exactly as it would have.

## Code

One file. Everything above `// ---------- UI ----------` is pure logic — map builder, rules, dice through a seeded RNG kept in the state, cards, diplomacy, computer players — and is what the tests load with `vm`. The board view sits behind a small interface (`render(state, view)`, `pick(x, y)`, `animateBattle`, `animateMove`, `pop`, `resize`, `zoomBy`) so the shared 3D tabletop kit in `lib/` can replace it later without touching the rules.

## Tests

- `node test/rules.js` — the map graph (connected, symmetric, one piece and one outline per territory, bonus formula, original names), reinforcement maths with continent bonuses and alliance aid, card sets and escalation and the +2, forced trades, exact dice odds for 3v2, 3v1, 2v2, 2v1, 1v2, 1v1 against 40,000 seeded rolls each, blitz odds against seeded blitzes, conquest and move-in rules, fortify legality, elimination and card transfer with the immediate trade, truces enforced and the broken-truce penalty, the anti-stall limits, save/resume (exact round trip, identical continuation, broken saves refused), and the shared back button byte-identical to Tetris.
- `node test/sim.js` — computer-only games at every table size, both modes, talk on and off: every one ends with a living winner (none needs the 250-round safety cap); the diplomacy limits hold at every step; Hard beats Normal beats Easy.
- `node test/bots.js` — the report above (not a test; listed under `reportOnly`).
