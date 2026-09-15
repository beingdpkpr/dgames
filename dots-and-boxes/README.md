# Dots & Boxes

Single-file dots and boxes on a canvas. Open `index.html` in any browser; no network needed.

## Rules
Click the gap between two adjacent dots to draw a line. The fourth side of a box claims it for you and you go again; one line can claim two boxes. When every line is drawn, the most boxes wins. A draw is possible on even-sized boards.

## Options
- **Grid** 3×3 to 8×8 dots (4 to 49 boxes). Default 5×5.
- **Opponent** two players on one screen, or the computer as player 2:
  - *Easy* plays a random line.
  - *Normal* takes a box when it can, otherwise draws a line that does not give a box away, otherwise anything.
  - *Hard* is Normal until no safe line is left, then opens the chain that hands over the fewest boxes.

Options are remembered in the browser. N starts a new game.

## Tests
`node test/ai.js` loads the game logic out of `index.html` without a browser and:
- checks box completion, double-box completion, extra turns, turn passing and game end;
- checks Normal takes a box when it can and never opens a box while a safe line exists;
- checks Hard, when forced to give away, opens the cheapest chain;
- plays 400-game tournaments between the levels and prints the win / draw / loss mix.
