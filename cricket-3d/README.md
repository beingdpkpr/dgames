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

## Players
Everyone on the field shares one bone rig with knees, elbows, hands and feet, posed from joint points. Batters wear pads, helmet and gloves; fielders wear the team kit and cap; the keeper squats in pads and big gloves. Players vary in height and skin tone. The bowler runs in with the arms pumping, gathers with the front arm up, and swings the bowling arm over the top; fielders crouch ready, run, reach up for catches, bend to pick the ball up and throw overarm, and stretch full length in a dive. Two umpires stand at the bowler's end and square leg; the bowler's end umpire signals out, wide, no ball, four and six.

## Crowd
About four thousand spectators fill the seven tiers and jump for boundaries and wickets.

## Fielding
Every fielder predicts the ball's path and runs for the earliest point they can reach, with a judgement error that shrinks as the ball nears. Hard-hit balls must come straight to hand or need a dive; misfields happen.

## Extras and LBW
Wides (sprayed balls, and anything over head height that you leave) and no-balls cost a run and are re-bowled; a no-ball gives a free hit on the next ball, when only a run out can get you. Balls that beat the keeper run for byes, balls off the pads run for leg byes, and a pad hit that would have gone on to hit the stumps is LBW unless it pitched outside leg. Extras count for the total and the chase but not for the batter.

## Run outs
Once a ball is fielded it is thrown at the end the striker is running to. Batters nearly home make it, batters well short turn back, and in between they take on the throw: a direct hit runs them out.

## Celebrations
Winning a chase brings fireworks over the stands, a bouncing crowd and bat-raised batters; the tournament final gets the long version. Quick play celebrates a new best score.

## Injuries
A missed ball can strike the batter. A blow to the body or helmet leaves them bruised (less power, tighter timing) or forces them to retire hurt, bringing in the next batter without costing a wicket. Fielders can get hurt diving and are replaced by the twelfth man; a bowler can pull up before an over and a part-timer takes it. In a tournament your injured players miss the next round.

## Tests
- `npm run balance` auto-bats 20 innings headlessly (no browser) and prints the outcome mix by shot type and timing error.
- `node test/visual.js` drives the game in headless Chromium with Playwright (`npx playwright install chromium` once) and saves screenshots of the menu, bowling action, shots and fielding to `test/shots/`.
