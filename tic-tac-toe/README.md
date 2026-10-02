# Tic-tac-toe

Tic-tac-toe against the computer, on a small wooden board on a 3D desk, with the flat 2D board as a choice and as the fallback. No build step: open `index.html` in any browser; no network needed. The 3D board loads the shared `../lib/three.min.js` and `../lib/tabletop.js` (see `lib/README.md`), so the folder needs `lib/` beside it. Without it, or without WebGL, the game plays in 2D.

## Options
- **You play** X or O.
- **First move** you, the computer, or alternate each game.
- **Computer** level:
  - *Easy* plays a random empty square.
  - *Normal* takes a win, otherwise blocks yours, otherwise centre, corner, side. It can be beaten with a fork.
  - *Hard* is full minimax and cannot be beaten. It prefers the quickest win and the slowest loss.

Options and the You / Draws / Computer score are remembered in the browser. The winning line is highlighted and the last move is outlined.

## High scores
Each level keeps a top-ten table of your longest unbeaten streaks (wins and draws in a row against the computer at that level), with three-letter initials. The streak grows while you win or draw and is submitted when a loss ends it, or when you press Reset score (so a streak on Hard, which never loses, can be banked), if it makes the table; the current streak and the table for the selected level sit under the score panel. Games you abandon with New game do not count either way. Everything is stored in the browser (localStorage), so it is per device and per browser.

## Controls
Click or tap a square (on the 2D grid or the 3D board), or press 1–9 in numpad layout (7 8 9 is the top row). N starts a new game.

## The 3D table
A walnut board with a grooved 3x3 grid, a darker frame and a thin brass inlay, on the shared tabletop kit's desk (the look, lights, desk and camera are the kit's, as in Ludo, City Tycoon, Go and Troll Chess). X is two crossed bars and O a torus, both lacquered in the 2D page's blue and coral. The rules, the computer, the settings, the score and the high scores are the 2D page's; the 3D board only draws the game and turns a tap into the same square press the 2D grid makes.

- **Defaults:** 3D wherever WebGL works. Angled on a desktop or a phone held sideways, top-down on a phone held upright. **Top / Angled** and **2D** buttons sit in the board's top-right corner (the camera leaves a strip of desk there so they cover no square); in 2D a **3D** button at the right of the title brings it back. The choice and the camera are remembered in `dgames.tic-tac-toe.view` (localStorage, read and written in try/catch). Quality is low on touch screens and high elsewhere; `?q=low` / `?q=high` override it. `?no3d` forces 2D. 2D is also what you get when WebGL is missing, when building the scene throws (the half-built scene is disposed), or when the WebGL context is lost mid-game; in every case the game carries on.
- **Layout:** the 3D board takes exactly the 2D grid's square (the grid's cells stay in place, invisible, under the canvas), so the portrait, sideways-phone and desktop layouts size it the same way and nothing else on the page moves.
- **Animation:** a placed piece drops in from 4.5 cm with a bounce and a little turn (420 ms, landing in the first ~150 ms); the last move gets a gold outline like the 2D one; a win lights a green line along the three squares and lifts its pieces in a wave, twice; a draw gives every piece a small shrug; a new game sweeps the pieces off the board to the right. None of it holds up play: the move is in the game the moment it is made, and the computer answers on the same 350 ms timer as in 2D.
- **Tapping:** the kit's picking, on one thin invisible slab per square flush with the board (a tall one would stand in front of the near half of the square behind it in the angled view). The click a touch tap sends after it is dropped, and two quick taps on the board are two taps, not the kit's camera reset. Checked in Chromium by real taps at the centre of each square and 1.8 cm towards each of its corners (45 taps per view): 45/45 at 390×844, 375×667, 360×640, 844×390, 667×375 and 1280×800, angled and top.
- **Cost:** rendering is on demand, so a still board draws nothing. A full board with the winning line lit is 19 draw calls including the shadow pass, 7.6k triangles at low quality and 14.9k at high. At 4× CPU throttle in headless Chromium on SwiftShader (a software GPU), the whole frame, waiting for SwiftShader to rasterise it, takes 70–83 ms at low and 80–96 ms at high at 360×640 and 844×390; Troll Chess measured the same way on the same machine took 93–134 and 132–183 ms.

## Tests
`node test/ai.js` loads the game logic out of `index.html` without a browser and:
- walks every opponent line against Hard, for both sides and both starting players, and asserts it never loses;
- checks Normal takes a win, blocks a loss and takes the centre;
- plays 2000 random games per level and prints the win / draw / loss mix.

`node test/hiscore.js` checks the high-score module (ranking, top-ten cap, initials) and the unbeaten-streak rule headlessly.
