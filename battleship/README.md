# Battleship

Battleship on a dark ocean, each ocean a tray of water on a 3D desk, with the flat 2D boards as a choice and as the fallback. Open `index.html` in any browser; no network needed (it asks Google Fonts for Rajdhani and falls back to Segoe UI / system-ui when offline). The 3D boards load the shared `../lib/three.min.js` and `../lib/tabletop.js` (see `lib/README.md`), so the folder needs `lib/` beside it. Without it, or without WebGL, the game plays in 2D.

## How to play
Two 10x10 grids: **Your Fleet** on the left, **Enemy Waters** on the right (they stack on a narrow screen). Each side hides five ships: Carrier 5, Battleship 4, Cruiser 3, Submarine 3, Destroyer 2. Take turns firing at the enemy grid; a shot is a miss, a hit, or a hit that sinks a ship. The first player to sink the whole enemy fleet wins, and the end screen shows ships sunk, shots fired, hits and accuracy for both sides.

## Options (setup screen)
- **Difficulty**: *Easy*, *Normal* or *Hard*, for the computer only (it is hidden in two-player). Normal is the opponent this game always had; Easy and Hard were added either side of it rather than by changing it.
- **Opponent**: *Computer*, or *Two players* pass-and-play on one device. In two-player mode a hand-over screen hides both grids while the device changes hands, between placement turns and between every shot.
- **House rule (optional)**: *Standard turns* (default) alternates after every shot. *Go again on hit* lets the shooter keep firing while they keep hitting. Off by default; it is not part of the classic rules.

Options and the sound setting are remembered in the browser.

## Controls
- **Placement**: click a cell to put the selected ship there; it extends right (horizontal) or down (vertical) from that cell. The hover preview is green where the ship fits and red where it overlaps or leaves the grid. Turn a ship three ways: **R**, the orientation button, or by tapping the chip of the ship you are holding. Tap a ship already on the board to turn it where it lies; if there is no room to turn it there it is picked up instead, and the message says which happened. To move a placed ship rather than turn it, tap its chip in the fleet list. *Random* places the whole fleet, *Clear* empties the grid, *Start battle* / *Confirm fleet* locks it in.
- **Battle**: click a cell in Enemy Waters to fire. A targeting reticle follows the pointer and a sonar pulse marks the start of your turn.
- **Sound** is off by default; the HUD button turns it on. All sounds are synthesized with WebAudio, there are no audio files.
- Animations respect `prefers-reduced-motion` (no screen shake, far fewer particles, slower water).

## The 3D table
Each ocean is a shallow tray of water in a plastic travel case on the shared tabletop kit's desk (the look, lights, desk and camera are the kit's, as in Ludo, City Tycoon, Go, Troll Chess, Tic-tac-toe and Dots & Boxes). Your case is blue and the enemy's red; in two-player, Player 1's is blue and Player 2's red, whoever is holding the device. The coordinates are moulded into the rim and a pegboard grid, with a hole in every cell, lies on the water. The rules, the computer, the turns, the hand-over screens, the messages and the high scores are the 2D page's; the 3D boards only draw the game and turn a tap into the same cell click the 2D canvas gets.

- **Defaults:** 3D wherever WebGL works. Angled on a desktop or a phone held sideways, top-down on a phone held upright. **Top / Angled** and **2D** buttons sit in the top-right corner of a board (your fleet's where both boards show, whichever is showing where the tabs show one); in 2D a **3D** button sits at the top right of the page, opposite the back button. The choice and the camera are remembered in `dgames.battleship.view` (localStorage, read and written in try/catch; a corrupt value is ignored). Quality is low on touch screens and high elsewhere; `?q=low` / `?q=high` override it. `?no3d` forces 2D. 2D is also what you get when three.js is missing, when building the scene throws (both half-built scenes are disposed), or when a WebGL context is lost mid-game; in every case the game carries on where it was.
- **Layout:** each 3D canvas covers its 2D canvas's inner square, and the 2D canvas stays in place underneath it, keeping its border and the teal glow that marks the board in play. So the portrait tabs, the sideways-phone columns and the desktop pair size the 3D boards exactly as they size the 2D ones. Checked against the previous page at 390×844, 375×667, 360×640, 844×390, 667×375 and 1280×800, against the computer and two-player, in placement and battle: every box and control is where it was, the only additions are the two 44×44 view buttons, and `?no3d` lays out identically to the old page. No size scrolls except 1280×800 in placement, by 79 px, exactly as the 2D page already did. In 2D the 3D button covers nothing; where the boards sit side by side on a short screen the message line along the top gives up its width.
- **Ships** are small glossy grey models, one merged mesh each, with the 2D page's silhouettes: the carrier's overhanging flight deck and island, the battleship's three turrets and tower, the cruiser's gun, bridge and funnel, the submarine's cigar hull and conning tower, the destroyer's gun and bridge. They float with a little of the hull under the water. Placing or moving a ship lowers it in with a bounce and a ring on the water.
- **A shot:** a shell flies a short arc (430 ms) from your side of the table to the enemy tray, or from the far side onto yours. A miss throws up spray and two rings and a white peg drops into the hole. A hit bursts into fire, sparks and smoke, jolts the tray, and a red peg drops in: into the deck where the ship can be seen, into the water where it cannot. A sunk ship flashes with fire, lists about 17°, settles lower and darkens, smoke drifting off; on the enemy board that is when it appears. At game over the rest of the enemy fleet surfaces. A sonar ring sweeps the enemy waters at the start of your turn. Nothing waits on an animation: the shot is resolved when it is fired and the computer answers on the same 900 ms timer as in 2D. Reduced motion skips every animation.
- **Water** drifts only while something is happening (for about two seconds after a shot or a ship moving), easing to a stop, and never with reduced motion. A still board draws nothing.
- **Hand-over:** in a two-player game, while a hand-over screen is up neither tray holds a single ship: they are taken out of the scene, not hidden, so no frame can show a fleet to the wrong player, and after **Ready** both trays are rebuilt for the player now holding the device before the next frame is drawn. Checked over a whole two-player game by real taps (41 shots, 93 checks): under every cover both trays were empty of ships, and otherwise your tray always showed your own fleet and the enemy tray only sunk ships.
- **Tapping:** the kit's gestures (a drag tilts and turns the camera, a pinch zooms, a still press is a tap; the click a touch tap sends afterwards is dropped, and two quick taps on a board are two taps, not a camera reset). A tap is turned into the cell under it on a plane through the ships' middles, as the 2D page turns a click into the cell under it. A mouse shows the 2D page's preview: the footprint of the ship in hand, green where it fits and red where it does not, gold over a placed ship that a tap would turn; and a reticle on enemy cells you can fire at. On a touch screen, when the cells on screen are under 32 px (the median cell edge, as Go and Dots & Boxes measure their spacing), the first tap shows the footprint or a gold reticle and says *Tap C5 again to fire*, and a second tap on the same cell does it. A tap that would only say "already fired there" or "does not fit" acts at once. In 3D that is every phone: cells are 25.7 px top-down at 360×640, 28.2 at 390×844, 19.1 angled and 20.5–24.5 top-down at 844×390, 15.1 angled at 667×375; on a desktop (28 px at 1280×800 angled) a click fires at once. The board with the view buttons keeps a strip of desk under them, measured so the ocean's far edge is drawn at least 14 px below them; nearer than that, Chromium's touch adjustment handed taps on the top row to the buttons. Checked in Chromium by real taps on all 100 cells of both boards (your fleet in placement, the enemy waters in battle) at 360×640 and 390×844 top-down, 844×390 angled and top-down, 667×375 angled and 1280×800 angled: 1,200 of 1,200 landed on their own cell.
- **Cost:** rendering is on demand, so a still board draws nothing, and the 2D page's frame loop, which redrew its water every frame, stops while the 3D boards are up. A late-game tray (70 pegs and five ships, as at game over) is 17 draw calls including the shadow pass (each peg colour is one instanced mesh, each ship one merged mesh), 9.5k triangles at low quality and 16.8k at high. At 4× CPU throttle in headless Chromium on SwiftShader (a software GPU), the whole frame of one tray, waiting for SwiftShader to rasterise it, takes 80–87 ms at low and 93–103 ms at high at 360×640 top-down, and 59–74 and 75–86 ms at 844×390 angled; a full 8×8 Dots & Boxes board measured the same way in the same run took 86–152 and 104–184 ms. Only animation frames pay it, usually on one tray at a time (the one being shot at), and a phone GPU draws this scene far faster.

## The computer
It places its fleet at random. Three strengths, measured headlessly over 500 seeded games each, every level firing at the same fleets:

| Level | Average shots to sink the fleet |
|---|---|
| Easy | 95.5 |
| Normal | 49.8 |
| Hard | 45.3 |

**Easy** fires blind at any unshot cell — no lattice, and it does not even follow up a hit. It is the setting you can beat.

**Hard** scores the board by probability density: for every ship still afloat it counts the ways that ship could still be placed, adds weight to each unshot cell those placements cover, and fires at the busiest cell. Placements that would explain an unresolved hit are weighted far above the rest, so one rule does both the searching and the finishing-off. Worst case is about 1 ms to choose a shot, on the opening shot of a game when every ship is still afloat.

**Normal** is the original three-stage AI:
1. **Hunt**: pick a random cell on a lattice whose spacing is the length of the smallest ship still afloat (a checkerboard while the Destroyer lives), skipping cells no remaining ship could fit through.
2. **Target**: after a hit, try the four neighbours.
3. **Line**: once two hits are adjacent, fire at the ends of that line until the ship sinks; hits belonging to a sunk ship are dropped from the target list, so a second ship found along the way is still finished off.

No level ever fires at the same cell twice.

## Tests
`node test/game.js` loads the game logic out of `index.html` without a browser and checks:
- placement validation rejects overlap and out-of-bounds in both orientations and accepts valid spots (including moving a ship onto its own cells);
- 500 random fleets are all valid and occupy exactly 17 cells;
- `resolveShot` reports miss / hit / sunk, refuses the same cell twice and out-of-bounds cells;
- the AI hunts on the right lattice, targets neighbours after a hit, extends a line after two, and drops hits once a ship sinks;
- over 300 games against random fleets the AI never repeats a cell, always finishes, and its average shot count is printed next to a pure-random baseline;
- game-over detection and accuracy rounding.

The 3D boards are checked in a real browser (Playwright, not part of `npm test`): tap coverage as above, whole games by real taps against each level (Easy at 360×640, Normal at 844×390, Hard at 1280×800) and a two-player game at 390×844, the fallbacks (three.js missing, the scene throwing, a context lost mid-game, `?no3d`), switching between 2D and 3D mid-game at every size, and the layout against the previous page.

## High scores
Wins against the computer are recorded in a local top-10 table: the score is the number of shots it took to sink the whole enemy fleet (fewer is better), with your accuracy as the detail. A winning game that makes the table asks for three-letter initials. Two-player games and losses are not recorded. The table shows on the setup screen and on the victory screen, and lives only in this browser's storage.
