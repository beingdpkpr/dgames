# Dojo Duel

A one-on-one 3D fighter in the style of Tekken, as a prototype: one dojo, you against the computer, best of three
60-second rounds. Three.js r128 is bundled into `index.html`, so it works offline and straight off the filesystem.

## Controls
Keyboard: arrows or A/D walk, S or down crouches. Holding **back** (away from the opponent) blocks while standing;
**down-back** blocks while crouching. U / I = left / right punch, J / K = left / right kick (Z X C V also work).
Esc pauses, M mutes. On a phone: a stick for walking, crouching and blocking, and four buttons, punches above kicks.
Best played with the phone on its side.

## Rules
| Button | Move | Height | Frames (startup / active / recovery) | On block |
|---|---|---|---|---|
| LP | Jab | high | 8 / 2 / 12 | -2, safe |
| RP | Body blow | mid | 12 / 3 / 17 | -6 |
| LK | Low kick | low | 13 / 3 / 20 | -9, punishable by a jab |
| RK | Roundhouse | high, knocks down | 19 / 4 / 25 | -12, punishable |

- Standing guard stops highs and mids; crouching guard stops lows; crouching ducks under highs entirely, but mids
  hit a croucher whatever it does. Every attack has an answer and every guard a weakness.
- Jab then right punch is a 1-2: on hit the second punch lands before the first one's hitstun ends.
- Hitting a move during its startup is a **counter hit**: 25% more damage and longer stun.
- A knocked-down fighter cannot be hit until the get-up ends. Pushed against a wall, the attacker is pushed off
  instead of the victim sliding away.
- The computer sees an attack only after its reaction time (22 / 15 / 11 frames on Easy / Normal / Hard), so no
  level can react to a jab -- it has to guess, like you.

## Structure
The fight logic sits between `// ---------- SIM ----------` and `// ---------- UI ----------`: no DOM, no Three.js,
no clock. `step(g, inputs)` advances one 1/60 s frame, and the AI's randomness comes from a seeded generator.
The figures are posed by points (hips, chest, hands, feet) with elbows and knees solved by two-bone IK, so a punch
is authored as "the fist goes there" and a target out of reach simply straightens the arm.

## Tests
`node test/sim.js` checks every move connects on its first active frame and whiffs just out of reach, the full
guard table (4 moves x 4 stances), frame advantage on block, the 1-2 combo, knockdown invulnerability, counter
hits, walls, rounds, timeouts, determinism, and what the AI levels do against each other and against an idle player.
