# Queens

A logic puzzle in one file. Open `index.html` directly; no dependencies, no build step, works offline.

## Rules

An N×N grid (5 to 10) is split into N coloured regions. Place N queens so that every **row**, every **column** and every **region** holds exactly one, and no two queens **touch** — not even at a corner. Queens do not attack along diagonals beyond the eight touching cells.

## Controls

| | |
|---|---|
| Tap a cell | × (no queen here) → queen → clear |
| Drag | paints × over empty cells; a drag that starts on an × erases ×s instead |
| Undo | every tap, stroke, hint and clear is one step |
| Hint | the next deduction, with its reason; marks the run as assisted |
| Keyboard | arrows move, Space cycles, X / Q set, Backspace clears, H hints, Ctrl+Z undoes, N new (Endless) |

**Auto-×** (Settings, off by default): placing a queen marks every cell it rules out. Removing the queen takes back the marks it made, unless another queen still rules that cell out; marks you made by hand are never touched.

Clashes show at once: every cell of a row, column or region holding two queens gets red hatching, as do two touching queens, and the queens themselves turn red.

## Modes

- **Daily** — the same puzzle for everyone on a date. It is a pure function of the date string (`queens-daily:2026-09-28` hashed to a seed). The size follows the weekday: Monday 6×6, Tuesday–Wednesday 7×7, Thursday–Friday 8×8, Saturday 9×9, Sunday 10×10. Your best Daily time for the date is remembered.
- **Endless** — a random puzzle at the size you pick (5×5 to 10×10).

Best times per size go to the shared high-score table (`dgames.hiscores.queens-<n>`, fastest first). Runs that used a hint are shown but not ranked.

## How the puzzles are made

1. **A solution first.** A random placement of N queens, one per row and column, no two touching.
2. **Regions grown from the queens.** Each queen seeds its region; regions take turns claiming a neighbouring cell. Each region has a random appetite (skewed so a few stay small — small regions are what give the logic its first handholds), a region past ~2.5N cells nearly stops growing, and a cell touching the region on several sides is preferred, which keeps shapes chunky rather than stripy.
3. **Uniqueness.** An exact solver counts solutions up to 2. While a second one exists, one of the rival's queen cells is moved into a neighbouring region (keeping every region connected). That region now holds two of the rival's queens, so the rival is dead; the intended solution never changes because only non-queen cells move. If no legal move is left, start over.
4. **Solvable by logic.** The deduction solver below must reach the solution from the empty board with no guessing, or the attempt is thrown away.
5. **Colours.** Of 160 random assignments, keep the one whose closest pair of *touching* regions is furthest apart.

The exact solver branches on whichever row, column or region has the fewest open cells. The first version went row by row and took up to 960 ms on a loose 10×10; profiled over 40 10×10 puzzles, the exact solver's share went from 3.2 s to about 0.1 s with the tightest-unit-first order.

## The deduction solver (and the hints)

It only takes steps a person could justify in one sentence. In order:

| Rule | Level | |
|---|---|---|
| queen | 1 | a placed queen rules out its row, column, region and the 8 touching cells |
| single | 1 | a region, row or column with one open cell left gets its queen there |
| confine | 2 | a region that fits in one row (column) claims it; a row (column) whose open cells all lie in one region claims that region |
| look-ahead | 3 | a cell whose queen would leave some region, row or column with no open cell is ruled out — this covers "cells touching every candidate of a region" |
| k in k | 4 / 5 | k regions confined to k rows (columns) claim those rows; k rows (columns) confined to k regions claim those regions (4 for k = 2, 5 for k ≥ 3) |

The difficulty label comes from the hardest rule the solver needed and how often it needed anything past the basics: Easy, Medium, Hard, Expert.

**Hints** run one step of the same solver from what is on your board, so a hint is always a true, explainable step ("The teal region fits only in row 4, so the rest of row 4 is ruled out."). The reason's cells glow gold and the cells it changes pulse. Your board is only trusted if it agrees with the solution: a clash, a wrong queen, or an × over a solution cell is pointed out instead of being deduced from.

## Look

Ten pastels, chosen for colour-blind players as well as looks: relative luminance runs from 0.30 to 0.80 rather than sitting at one lightness, and the set was tuned so its closest pair is 0.031 apart in OKLab under the worst of normal vision and simulated protanopia, deuteranopia and tritanopia (the first all-mid-lightness set had a pair 0.006 apart). The per-puzzle assignment then keeps touching regions far apart: at least 0.065 over 1,200 generated puzzles. Every colour gives the queen and × ink at least **5.8:1** contrast; a clashing queen is red with a white outline, **5.0:1**. Region walls are thick and cell seams hairline, so shapes read without colour at all.

Winning turns the crowns gold one after another, each with a burst of sparks, while a highlight sweeps the board and the regions shimmer; then a card with your time and the best-times table.

## Tests

`node test/logic.js` lifts the pure section out of `index.html` with node's `vm` (everything above `// ---------- UI ----------`) and runs 49 checks, about 35 s:

- conflict detection on hand-made boards: row, column, region, touching (including diagonal), and two queens two steps apart diagonally that must *not* clash;
- **200 puzzles per size, 5×5 to 10×10:** N non-empty connected regions; exactly one solution by an independent brute force written in the test (capped at 2) that matches the recorded one; the deduction solver alone reaches it and never takes a false step; hints played from an empty board are all true and finish the puzzle;
- hints on 600 random correct partial boards are all true; a wrong queen, an × over a solution cell and two clashing queens are each reported as mistakes;
- Daily: identical for the same date, 30 consecutive dates all different, weekday sizes, and stepping the generator in slices (as the UI does) gives the same puzzle as one call;
- glyph contrast on every colour; the high-score module and the back button byte-identical to tetris's copies.

Generation time per puzzle, 200 seeds each (node, this machine):

| Size | median | p95 | max | attempts (median / max) |
|---|---|---|---|---|
| 5×5 | 1.3 ms | 2.7 ms | 9.8 ms | 1 / 5 |
| 6×6 | 1.6 ms | 3.0 ms | 3.9 ms | 1 / 9 |
| 7×7 | 2.3 ms | 5.0 ms | 8.2 ms | 2 / 20 |
| 8×8 | 3.7 ms | 9.5 ms | 21 ms | 5 / 30 |
| 9×9 | 17 ms | 59 ms | 88 ms | 7 / 47 |
| 10×10 | 40 ms | 157 ms | 268 ms | 15 / 93 |

Grades over those 200 per size run from mostly Easy/Medium at 5×5 (76 / 87 / 37 Hard) to mostly Hard at 10×10 (26 Easy, 48 Medium, 104 Hard, 22 Expert). Almost all rejected 10×10 attempts die in the uniqueness step, not the logic check: of 1,500 attempts, 1,424 ran out of legal cell moves (no cell of the rival solution could join a neighbouring region without splitting its own, or had no neighbouring region at all), 5 were unique but needed a guess, and 71 were accepted. Raising the move budget from 60 to 400 changed nothing, so the budget is not the limit; a smarter move (reshaping a region around a rival queen) is where the next speed-up is. The page never runs that in one go: it steps the generator under a 12 ms budget per slice, so even the slowest board leaves the page painting (a "Setting the board…" note appears if it takes longer than 150 ms).

## Layout

Checked in Chromium with Playwright, no page scroll anywhere, a 10×10 board:

| Viewport | Cell | Smallest control | Back button overlaps |
|---|---|---|---|
| 390×844 | 36 px | 44 px | nothing |
| 375×667 | 34 px | 44 px | nothing |
| 360×640 | 33 px | 44 px | nothing |
| 844×390 | 36 px | 44 px | nothing |
| 667×375 | 34 px | 44 px | nothing |
| 1280×800 | 72 px (capped) | 44 px | nothing |

In landscape the board column is exactly as wide as the screen is tall, so the board is sized from the height and the panel gets the rest. The size picker is a stepper rather than six chips because six 44 px chips beside the mode switch need 440 px and a 360 px phone has 340.
