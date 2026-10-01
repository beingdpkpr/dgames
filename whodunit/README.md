# Whodunit

*Murder in the old house.* A deduction mystery for three to six detectives on one device. Each seat is a human (pass-and-play) or a computer at Easy, Normal or Hard. Open `index.html` directly — no dependencies, and nothing is fetched except an optional display font (Yatra One; offline it falls back to Georgia).

The mechanics are those of the classic whodunit board game. The setting, house, cast, weapons, card art and every line of text are original to this game, and in plain English: `test/rules.js` fails if a trademarked name from the original appears in the page.

## The case

The monsoon feast is over. At dawn Govind Narayan, master of the house, is found dead, and the gates were barred all night.

| Suspects | Weapons | Rooms |
|---|---|---|
| Devika, the Dowager | Poisoned Sweets | Rooftop Terrace (passage to the Cellar) |
| Kabir, the Nephew | Silk Scarf | Library |
| Meera, the Singer | Brass Lamp | Prayer Room (passage to the Stables) |
| Harish, the Accountant | Walking Cane | Grand Hall |
| Dr Farida, the Physician | Old Musket | Courtyard |
| Gopal, the Gardener | Cobra | Music Room |
| | | Stables (passage to the Prayer Room) |
| | | Kitchen |
| | | Cellar (passage to the Rooftop Terrace) |

The house is a 19×19 floor plan: nine rooms around a central courtyard, joined by a two-square gallery. Rooms have two doors each and the courtyard four (a pale threshold in the wall) and carved jaali screens along the walls that face the gallery. At the end each suspect, weapon and room contributes a sentence to the solution's short narrative.

## Rules implemented

- One suspect, one weapon and one room go in the envelope; the other 18 cards are dealt round the table (hands differ by at most one, and hand sizes are public).
- **Move**: roll one die (or two, an option) and move *up to* that many squares through the gallery, or into a room through a door — stepping in is the last step. Other tokens block gallery squares; rooms hold anyone. You cannot end in the room you started in. The four corner rooms have secret passages to the opposite corner: taking one is your move. If every exit is blocked you are boxed in for the turn.
- **Suggest** on entering a room: name a suspect and a weapon; both are moved to that room. Players to your left answer in turn; the first who holds any of the three shows you exactly one, privately. Everyone sees who passed and who showed, never what. A player whose token was brought to a room by someone else's suggestion may suggest there on their next turn without moving.
- **Accuse** on your turn, from anywhere. Right: you win. Wrong: you look in the envelope (as the rules allow), you are out — skipped in the turn order — and you keep answering suggestions. If everyone accuses wrongly the case goes cold.
- *Up to* the roll rather than exactly: a deliberate choice for a phone game, so a lucky roll is never wasted walking past a door.

## The notebook

A grid of every card × every player. Solid marks are certain and come only from what you have observed; you pencil in ✗, ✓ or ? in any other box. The fill-in level is yours to pick:

- **Cards seen** — your own cards and the cards shown to you.
- **+ Passes** (default) — also who could not answer a suggestion.
- **Full** — everything the Hard detective would work out from the same observations (an assist, not a cheat: it still sees only what you saw).

A row is struck through once that card is certainly not in the envelope, and gold once it certainly is. The suspect/weapon/room pickers strike the same cards. `test/rules.js` reshuffles every hidden hand and the envelope behind the same observations and checks the notebook does not change — it reads nothing you have not been shown.

## How the computer detectives think

**Knowledge** is a matrix card × owner (each player, and the envelope) holding *certainly there*, *certainly not* or *unknown*, rebuilt from that player's own observations: their hand, cards shown to them, passes, "player X showed someone one of these three" clauses, and wrong accusations ("these three are not all in the envelope"). Rules propagate to a fixed point: each card has exactly one owner; the envelope holds exactly one card of each type; each player holds exactly their hand size; a clause with one live card fixes it; a wrong accusation with two of its three in the envelope rules out the third. **Hard** adds failed-literal probing: suppose card c is owner o's, propagate, and if that contradicts, it is not.

Every rule is an entailment, so the engine is **sound**: `test/deduction.js` enumerates every deal of four small games (7–10 cards, 3–4 players, 5,236 observation sets) and checks every certain mark, at every level, against every deal consistent with the observations — 957,420 cells, no exceptions. Four planted bugs (a clause that fires with two live cards, an off-by-one hand count, a too-eager wrong-accusation rule, a pass that also marks the suggester) each make it fail. On the same games the share of entailed facts each level finds is: cards-only 74%, Easy 81%, + passes 89%, Normal 94%, **Hard 99.96%**; Hard recognised the solution in all 1,480 cases where it was entailed, and was never wrong.

**Levels**

| | Tracks | Reasons with | Chooses suggestions by | Accuses |
|---|---|---|---|---|
| Easy | own cards, cards shown to it, passes on its own suggestions | one owner per card, one of each type in the envelope | random among cards still possible | when certain, or gambles when down to ≤3 combinations |
| Normal | + passes on everyone's suggestions, wrong accusations | + hand sizes | random among unknowns; rooms it holds over rooms others hold | only when certain |
| Hard | + every answer it did not see ("X showed one of these") | + probing | expected information: walks the answering order, weighing "shows one" (learn that card's owner, by entropy) against "passes", and nobody answering; knows that computers re-show a card you have already seen | only when certain — never wrong |

Movement: each room is scored by how much a suggestion there would teach (Hard: the best expected information; Normal/Easy: rules of thumb), discounted by the turns needed to reach it; the detective takes the reachable square, room, passage or stay that maximises that. Two safety nets: a room you have just suggested in is discounted, and a detective whose last three answered suggestions showed only cards it had seen plans like Hard. Both exist because, before them, two Normal detectives rode the Prayer Room–Stables passage for 900 turns asking about a room a third player kept re-showing.

### How much the level matters (`node test/bots.js`, 400 seeded games per line-up, seats rotated, one die)

Turns to solve, four detectives of one level:

| Level | Winner's own turns (avg / median / max) | Table turns | Wrong accusations per game |
|---|---|---|---|
| Easy | 12.6 / 13 / 34 | 47.4 | 0.34 |
| Normal | 8.8 / 9 / 20 | 33.5 | 0 |
| Hard | 7.1 / 7 / 13 | 26.6 | 0 |

Share of wins per seat (fair share = 1 / players):

| Line-up | Share of wins |
|---|---|
| Hard, Normal, Easy | Hard 56.0% ±2.5, Normal 32.5% ±2.3, Easy 11.5% ±1.6 |
| Hard, Easy ×2 | Hard 70.3%, Easy 14.9% |
| Normal, Easy ×2 | Normal 54.3%, Easy 22.9% |
| Hard, Normal ×2 | Hard 44.3%, Normal 27.9% |
| Hard ×2, Normal ×2 | Hard 36.4%, Normal 13.6% |
| Hard ×2, Easy ×2 | Hard 43.8%, Easy 6.3% |
| Normal ×2, Easy ×2 | Normal 38.4%, Easy 11.6% |
| Hard, Normal, Easy ×2 (6 players) | Hard 39.0%, Normal 8.1%, Easy 2.9% |

No game in the report was unsolved or reached the 900-turn cap.

## Save and resume

The game saves to `localStorage` after every move (`dgames.whodunit.save`; setup choices in `dgames.whodunit.opts`), including your pencilled notebook marks and the dice generator's state, so a resumed game plays on exactly as it would have. The save is versioned and shape-checked (every card dealt exactly once, positions on the board, observations free of contradictions); anything else is discarded with a notice and a fresh case offered.

## Pass and play

With two or more human seats, a "Pass to <name>" screen covers the board whenever the device should change hands — your turn, answering someone's suggestion, or seeing the answer to yours — and hands, the notebook and the private reveal show only to the player whose move it is. During computer turns hands stay hidden.

## Layout

The board is an SVG behind a five-call interface (`render`, `highlight`, `animateMove`/`glide`, `hit`), so another view — the shared 3D tabletop — can replace it. Taps snap to the nearest lit square, since squares are about 18 px on a 360 px phone. Portrait puts the board under the title bar with the panel below; landscape puts it left of the panel with a lane for the back button. Sheets (suggest, answer, accuse, log, menu) rise from the bottom on phones; the notebook is a bottom sheet on phones and a right-hand drawer on wide screens. Checked in Playwright at 390×844, 375×667, 360×640, 844×390, 667×375 and 1280×800: no page scroll, every button at least 44×44, nothing under the back button, a full game played to the end through the UI with no console errors.

## Tests

`node test/rules.js` (59 checks, ~6 s): dealing; the board, doors, blocking, passages and every path of 2,000+ reachable targets; suggestion order, one card shown, who learns what; wrong accusations, out players still answering and being skipped; notebook truth and privacy; 120 computer games all ending with Hard and Normal never wrong; save/resume round trip and 11 kinds of bad save; the back button byte-identical to Tetris's; no trademarked names.

`node test/deduction.js` (22 checks, ~2 s): brute-force soundness and completeness as above, and hand-built scenarios each level should (or should not) solve.

`node test/sim.js` (~12 s): 240 games at 3–6 players with one and two dice all end by accusation; Hard beats Normal beats Easy at a three-player table.

`node test/bots.js` is the level report above; it asserts nothing and is listed under `dgames.reportOnly` in the root `package.json`.

The rules, deduction engine and computer players live above the `// ---------- UI ----------` marker in `index.html` and never touch the DOM, a clock or `Math.random`. The page exposes `window.__whodunitUI` (start a seeded game, let the Hard detective play the human seats, read the state, reach the board view) for browser-driven checks.
