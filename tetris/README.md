# Tetris

Guideline-rules Tetris in one file. Open `index.html` directly; no dependencies, no build step.

Tetris is the one game here where everybody already knows how it should feel, so the modern standard is the specification rather than a starting point. A player who has touched Tetris notices a wrong rotation within thirty seconds.

## Controls

| | |
|---|---|
| Move | Left / Right |
| Rotate | Up or X clockwise, Z anticlockwise |
| Soft drop | Down |
| Hard drop | Space |
| Hold | C or Shift |
| Pause | Esc or P |

On a touch screen the shared pad gives a four-way d-pad, DROP, HOLD and a rotate button, laid out below the board rather than over it.

## What is implemented

- **SRS rotation with wall kicks** — the five-offset tables, with the separate I-piece table. Without kicks, rotating against a wall or into a well silently fails, which is the single most noticeable way a Tetris clone goes wrong.
- **7-bag randomiser.** Every seven consecutive pieces contain all seven exactly once. Pure `Math.random()` produces droughts that players correctly read as unfair.
- **Hold**, once per piece. **Ghost piece.** **Next queue**, three deep.
- **Lock delay** with a move-reset counter, capped so a piece cannot be stalled indefinitely.
- **DAS and ARR** for held-key movement. This one is invisible in a feature list and decisive in play: without it, moving a piece feels wrong and nothing else compensates.
- **Scoring**: 100/300/500/800 per line count × level, soft and hard drop points, combo counter, back-to-back bonus, and T-spin detection by the three-corner rule.
- Gravity by level, where level is lines cleared ÷ 10.

## High scores

A top-ten table of scores under your saved player name, stored in this browser at `dgames.hiscores.tetris`. The name is the one shared across every game, asked for once and kept at `dgames.player`.

## Tests

`node test/engine.js` pulls the pure engine out of `index.html` with node's `vm` and runs 68 checks: every SRS kick case including the I-piece table and a rotation that must fail because no offset fits, the 7-bag distribution over many bags, line clearing with gaps and multiple simultaneous rows, every scoring case, lock-delay reset and its cap, and top-out detection. Gravity is stepped by an explicit `dt` and the bag takes a seed, so every scenario is set up directly rather than waited for.

## Layout note

The board is sized from `100dvh` minus a reserve that covers the title, the rails, the message line and the touch pad. It was first written against `100vh` with a reserve that budgeted for the pad alone: the well then ran 23 px past the bottom of a 390×844 screen and the pad covered 202 px of the playfield. The Next preview is a tall 96×216 canvas, and stretched into a phone-width flex slot it grew to 253 px and pushed everything down — it is sized by height on narrow screens for that reason.
