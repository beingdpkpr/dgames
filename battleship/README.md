# Battleship

Single-file Battleship on a dark ocean. Open `index.html` in any browser; no network needed (it asks Google Fonts for Rajdhani and falls back to Segoe UI / system-ui when offline).

## How to play
Two 10x10 grids: **Your Fleet** on the left, **Enemy Waters** on the right (they stack on a narrow screen). Each side hides five ships: Carrier 5, Battleship 4, Cruiser 3, Submarine 3, Destroyer 2. Take turns firing at the enemy grid; a shot is a miss, a hit, or a hit that sinks a ship. The first player to sink the whole enemy fleet wins, and the end screen shows ships sunk, shots fired, hits and accuracy for both sides.

## Options (setup screen)
- **Opponent**: *Computer*, or *Two players* pass-and-play on one device. In two-player mode a hand-over screen hides both grids while the device changes hands, between placement turns and between every shot.
- **House rule (optional)**: *Standard turns* (default) alternates after every shot. *Go again on hit* lets the shooter keep firing while they keep hitting. Off by default; it is not part of the classic rules.

Options and the sound setting are remembered in the browser.

## Controls
- **Placement**: click a cell to put the selected ship there; it extends right (horizontal) or down (vertical) from that cell. The hover preview is green where the ship fits and red where it overlaps or leaves the grid. **R** or the *Rotate* button flips the orientation. Click a placed ship to pick it up again. *Random* places the whole fleet, *Clear* empties the grid, *Start battle* / *Confirm fleet* locks it in.
- **Battle**: click a cell in Enemy Waters to fire. A targeting reticle follows the pointer and a sonar pulse marks the start of your turn.
- **Sound** is off by default; the HUD button turns it on. All sounds are synthesized with WebAudio, there are no audio files.
- Animations respect `prefers-reduced-motion` (no screen shake, far fewer particles, slower water).

## The computer
It places its fleet at random. Its shooting has three stages:
1. **Hunt**: pick a random cell on a lattice whose spacing is the length of the smallest ship still afloat (a checkerboard while the Destroyer lives), skipping cells no remaining ship could fit through.
2. **Target**: after a hit, try the four neighbours.
3. **Line**: once two hits are adjacent, fire at the ends of that line until the ship sinks; hits belonging to a sunk ship are dropped from the target list, so a second ship found along the way is still finished off.

It never fires at the same cell twice. Headless, it sinks a random fleet in about 50 shots on average; firing at random takes about 95.

## Tests
`node test/game.js` loads the game logic out of `index.html` without a browser and checks:
- placement validation rejects overlap and out-of-bounds in both orientations and accepts valid spots (including moving a ship onto its own cells);
- 500 random fleets are all valid and occupy exactly 17 cells;
- `resolveShot` reports miss / hit / sunk, refuses the same cell twice and out-of-bounds cells;
- the AI hunts on the right lattice, targets neighbours after a hit, extends a line after two, and drops hits once a ship sinks;
- over 300 games against random fleets the AI never repeats a cell, always finishes, and its average shot count is printed next to a pure-random baseline;
- game-over detection and accuracy rounding.

## High scores
Wins against the computer are recorded in a local top-10 table: the score is the number of shots it took to sink the whole enemy fleet (fewer is better), with your accuracy as the detail. A winning game that makes the table asks for three-letter initials. Two-player games and losses are not recorded. The table shows on the setup screen and on the victory screen, and lives only in this browser's storage.
