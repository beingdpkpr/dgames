# Dots & Boxes

Single-file dots and boxes on a canvas. Open `index.html` in any browser; no network needed.

## Rules
Click the gap between two adjacent dots to draw a line. The fourth side of a box claims it for you and you go again; one line can claim two boxes. Otherwise the turn passes to the next seat in order (1 → 2 → … → last → 1). When every line is drawn, the most boxes wins. If the top score is shared the game is a tie; the end screen ranks every player, with equal scores sharing a rank.

## Options
- **Grid** 3×3 to 8×8 dots (4 to 49 boxes). Default 5×5. With four or five players a 6×6 or larger board gives everyone more to play for.
- **Players** 2 to 5 (default 2). Each seat has its own colour for its lines and boxes: cyan, pink, lime, amber, violet.
- **Seats** seat 1 is always you. Every other seat is either *Human* (hot-seat on the same screen) or the computer at one of three levels:
  - *Easy* plays a random line.
  - *Normal* takes a box when it can, otherwise draws a line that does not give a box away, otherwise anything.
  - *Hard* is Normal until no safe line is left, then opens the chain that hands over the fewest boxes.

  Human seats are named *Player n* (or *You* when you are the only human); computer seats are *Computer* (or *Computer n* when there is more than one).

Options are remembered in the browser. N starts a new game.

## High scores
When you are the only human at the table and win outright, your margin over the best computer (your boxes minus theirs) is a score. If it places in the top ten you are asked for three-letter initials (**Enter** saves, **Esc** skips). There is one table per computer level, keyed by the hardest computer in that game, and each entry notes the grid, the player count and the box count. **High scores** in the controls shows the table for the current seat setup; it lives below the board so it never resizes the canvas. Games with two or more humans, ties and losses are not recorded. Tables are stored in this browser only (localStorage).

## Tests
`node test/ai.js` loads the game logic out of `index.html` without a browser and:
- checks box completion, double-box completion, extra turns, turn passing and game end;
- checks Normal takes a box when it can and never opens a box while a safe line exists;
- checks Hard, when forced to give away, opens the cheapest chain;
- plays 400-game tournaments between the levels and prints the win / draw / loss mix.

`node test/players.js` plays full games with 2, 3, 4 and 5 players and checks that turns cycle through every seat in order, a completed box keeps the turn, the final scores add up to the number of boxes, and the ranking / winner (or tie) is reported correctly, including scripted three-way ties and an outright win by a late seat.

`node test/hiscore.js` loads the pasted high-score module with a stubbed `localStorage` and checks rank order, the top-ten cap and initials handling; then checks `hiScoreOf()` on scripted games (a lone human winning, losing, two humans, a tie, keyed by the hardest computer) and on 300 random games against the winner and scores.
