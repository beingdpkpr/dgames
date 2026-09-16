# Tic-tac-toe

Single-file tic-tac-toe against the computer. Open `index.html` in any browser; no network needed.

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
Click a square, or press 1–9 in numpad layout (7 8 9 is the top row). N starts a new game.

## Tests
`node test/ai.js` loads the game logic out of `index.html` without a browser and:
- walks every opponent line against Hard, for both sides and both starting players, and asserts it never loses;
- checks Normal takes a win, blocks a loss and takes the centre;
- plays 2000 random games per level and prints the win / draw / loss mix.

`node test/hiscore.js` checks the high-score module (ranking, top-ten cap, initials) and the unbeaten-streak rule headlessly.
