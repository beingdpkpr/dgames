# Strike Force

Single-file run-and-gun side-scroller in the Contra mould. Open `index.html` in any browser; it works from disk and inside a sandboxed iframe. No build step, no image files: every sprite, background layer and particle is drawn on the canvas, and the only optional network fetch is the "Black Ops One" stencil font from Google Fonts (falls back to Impact / Arial Black).

## How to play
Run right through eight screens of jungle, over gaps and up platforms, past troops and turrets, into the arena at the end and kill the Warlord boss. Checkpoint flags along the way save your progress. Press **Enter** (or the Deploy button) on the title screen to start; **R** restarts after a win or a game over.

## Controls
| Action | Keys |
|---|---|
| Move | Left / Right arrows, or A / D |
| Jump | Space, Z or K. Hold for a higher jump, tap for a short hop. |
| Fire | X, J or F. Hold to keep firing. |
| Aim | Same direction keys, see the table below |
| Sound | M toggles synthesized sound (off by default; also a checkbox on the title screen) |
| Touch | An on-screen pad on phones, see below |

On a touch screen a pad appears when you deploy and goes away on the title and results screens: an eight-way thumbstick on the left, JUMP and FIRE on the right. It is a stick rather than a four-key cross because the diagonals are half of the aim table above. The pad synthesises the very same key events the keyboard sends, so every rule here applies to it unchanged. Desktop never builds it; `?touch=1` forces it on for a look.

Aim is independent of movement and comes from the direction keys held while you fire. Facing persists: with no keys held you shoot the way you last moved.

| Held | On the ground | In the air |
|---|---|---|
| nothing | facing direction | facing direction |
| Up | straight up | straight up |
| Left / Right | that way (and turns you) | that way |
| Left / Right + Up | diagonal up | diagonal up |
| Left / Right + Down | diagonal down, still moving | diagonal down |
| Down alone | **crouch**: low hitbox, shoot along the ground in the facing direction | straight down |
| Left + Right | cancel: facing direction | facing direction |
| Up + Down | cancel: horizontal | cancel: horizontal |

Deliberate deviation from "Down aims down" while standing: a bullet fired straight down into the floor is useless, so Down on the ground crouches instead (the arcade convention). Down aims straight down only while airborne.

## Health and lives
Default: **3 hits per life, 3 lives**. Taking a hit costs one pip and gives 1.5 s of invincibility (the sprite blinks). Falling into a pit costs the whole life. Losing a life respawns you at the last checkpoint flag with full health, your score intact and the enemies re-armed. Losing all three is game over.

**Classic: one hit kills** is a toggle on the title screen. It is optional and off by default; when on, each life has a single hit point, just like the arcade originals.

## Enemies
- **Troops**: walk toward you, stop at range and fire an aimed shot every ~1.3 s; two hits to kill, touching them hurts. Some drop a power-up.
- **Turrets**: fixed emplacements that track you and fire bursts of three; five hits to kill, explode with screen shake.
- **Warlord** (boss): waits in the arena at the far right. The camera locks, he advances, fires 5-way spreads and occasionally hops. 40 hits. His health bar sits at the top of the screen. Killing him wins the mission.

## Power-ups
Timed, shown in the HUD with a draining bar.
- **S** Spread: three-way shot for 10 s.
- **R** Rapid: more than double the fire rate for 10 s.
- **B** Barrier: 8 s of invincibility.

Three are placed in the level; four more drop from specific troops.

## Scoring
Troop 100, turret 250, boss 2000, power-up 50. Finishing adds 5000 plus 1000 per remaining life.

## High scores
A top-ten table of final scores with three-letter initials, one table for the whole game (Classic and default share it). When a run ends, by game over or by killing the boss, and the score makes the table, a prompt asks for your initials (type three letters, Enter saves, Esc skips); the entry records how far you got: `reached checkpoint n`, `reached boss` or `won`. A score of zero is never recorded. The table sits on the results screen and behind the HIGH SCORES (H) button on the title screen; T on the results screen returns to the title. Everything is stored in the browser (localStorage), so it is per device and per browser.

## Checkpoints
Five flags at roughly 1000, 2900, 3900, 5800 and 6800 px into the 7680 px level. A flag turns green when passed.

## Accessibility
`prefers-reduced-motion` cuts screen shake to 15% and particle counts to a quarter.

## Tests
`node test/sim.js` loads the pure simulation section out of `index.html` (no DOM, no canvas) with node's `vm` module and checks:
- physics: standing on ground, held vs tapped jump height (at least one 100 px platform step), passing up through a one-way platform, being stopped by a wall, crouch hitbox, pit death;
- the full aim table above: all 16 key combinations x 2 facings x ground/air (64 cases);
- bullets despawn off-screen, spread fires three, a troop dies after exactly its hit points, enemy bullets cost one hp and start invincibility frames, Classic one-hit;
- checkpoint respawn keeps score, decrements lives, restores hp;
- a scripted bot (run right, jump at gaps and walls, fire forward) reaches the boss arena within a bounded number of frames and then kills the boss, proving the level is traversable; the same bot without god mode is reported for information;
- game over after losing all lives.

`node test/touch.js` loads the shared touch-pad snippet and the `// --- input ---` block out of `index.html` the same way and checks the eight-way stick maps an offset to the right direction pair, the deadzone, that a resting thumb sends one keydown rather than one per frame, that every code the pad emits is in the game’s `KEYMAP` (a button wired to an unmapped code looks fine on screen and does nothing), and, end to end against a stand-in DOM, that a thumb on the pad flips the game’s own `keys` object and that lifting off or losing focus releases everything.

`node test/hiscore.js` loads the high-score module and the sim the same way with an in-memory localStorage and checks rank ordering, the top-ten cap, initials upper-cased and cut to three, and that the game's detail hook reports `reached no checkpoint` / `reached checkpoint n` / `reached boss` / `won` for games driven to their end.
