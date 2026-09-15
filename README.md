# Cricket 3D — batting

Single-file 3D cricket batting game built on Three.js. Open `index.html` in any modern browser (internet needed for the Three.js CDN script and fonts).

## Play types
- **Quick play** — 2, 5 or 10 overs, five wickets, score as many as you can. Best score is remembered.
- **Tournament** — three knockout chases (Round 1, Semi-final, Final) against random opponents. Each round sets a target over 5 overs and the bowlers get quicker. Progress is saved in the browser.

## Teams
Pick one of ten national squads (India, Australia, England, Pakistan, South Africa, New Zealand, Sri Lanka, West Indies, Bangladesh, Afghanistan) of eleven named players. Your batting order comes in one by one; the opposition's five bowlers rotate through the overs and its fielders are named in catches and misfields. The end screen shows a batting card.

## Controls
Arrow keys / WASD aim (combine two for diagonals). Space = ground shot, Enter or Shift = lofted shot. Esc pauses (resume or quit to menu). M mutes.

The timing bar under the pitch fills as the ball comes in: press as the marker reaches the green. The radar bottom-left shows the field, the aim line and the ball.

## Bowling
Fast bowlers mix seam-up, outswing, inswing, bouncers, yorkers, slower balls and cutters. Off-spinners bowl off-breaks, arm balls, doosras and a quicker one; leg-spinners bowl leg-breaks, googlies, top-spinners and flippers. Swing and drift act in the air; turn and seam act off the pitch.

## Fielding
Every fielder predicts the ball's path and runs for the earliest point they can reach, with a judgement error that shrinks as the ball nears. Hard-hit balls must come straight to hand or need a dive; misfields happen.

## Injuries
A missed ball can strike the batter. A blow to the body or helmet leaves them bruised (less power, tighter timing) or forces them to retire hurt, bringing in the next batter without costing a wicket. Fielders can get hurt diving and are replaced by the twelfth man; a bowler can pull up before an over and a part-timer takes it. In a tournament your injured players miss the next round.

## Tests
- `npm run balance` auto-bats 20 innings headlessly (no browser) and prints the outcome mix by shot type and timing error.
- `node test/visual.js` drives the game in headless Chromium with Playwright (`npx playwright install chromium` once) and saves screenshots of the menu, bowling action, shots and fielding to `test/shots/`.
