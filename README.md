# Cricket 3D — batting

Single-file 3D cricket batting game built on Three.js. Open `index.html` in any modern browser (internet needed for the Three.js CDN script and fonts).

## Play types
- **Quick play** — 2, 5 or 10 overs, five wickets, score as many as you can. Best score is remembered.
- **Tournament** — three knockout chases (Round 1, Semi-final, Final) against random opponents. Each round sets a target over 5 overs and the bowlers get quicker. Progress is saved in the browser.

## Controls
Arrow keys / WASD aim (combine two for diagonals). Space = ground shot, Enter or Shift = lofted shot. Esc pauses (resume or quit to menu). M mutes.

## Bowling
Fast bowlers mix seam-up, outswing, inswing, bouncers, yorkers, slower balls and cutters. Off-spinners bowl off-breaks, arm balls, doosras and a quicker one; leg-spinners bowl leg-breaks, googlies, top-spinners and flippers. Swing and drift act in the air; turn and seam act off the pitch.

## Fielding
Every fielder predicts the ball's path and runs for the earliest point they can reach, with a judgement error that shrinks as the ball nears. Hard-hit balls must come straight to hand or need a dive; misfields happen.

## Balance check
`npm install` then `npm run balance` auto-bats 20 innings with random timing and prints the outcome mix by shot type and timing error. No browser needed.
