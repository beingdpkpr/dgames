# Go

The board game, in one file. Open `index.html` directly; no dependencies, no build step, works offline (and over `file://`).

## Playing

- **Boards:** 9×9, 13×13, 19×19.
- **Opponents:** the computer on 9×9 and 13×13 (Easy, Medium, Hard; you pick your colour), or two players on one device on any size. 19×19 has no computer: a playout search at a phone-friendly budget plays it badly.
- **Handicap:** 2–9 stones on the standard star points on 13×13 and 19×19. Black gets them and White moves first.
- **Komi:** 7.5 (0.5 in handicap games).
- **Controls:** tap a point to play. Undo (against the computer it takes back your move and its reply; while it is thinking it cancels the search and takes back your move), Pass, and a menu with New game, Save game record (SGF), Sound and Resign. Ctrl+Z also undoes.
- **Small points:** a point under 32 px is smaller than a fingertip (19×19 on a 360 px phone is 17.9 px), so on those boards a touch first shows a ghost stone with a crosshair, and a second tap on it, or the **Place D4** button, plays it. Sliding the finger moves the ghost. A mis-tap costs nothing. A mouse plays directly, with a hover ghost.
- **The game is saved** after every move (`dgames.go.save` in localStorage). Reopen the page and the setup card offers Resume. A finished game clears the save.

## Rules

Chinese-style area scoring with **positional superko**: a move may not recreate any earlier whole-board position (Zobrist keys, 53 bits). Suicide is illegal, but a move that captures is checked for liberties only after the capture. Two passes in a row end the game.

At the end comes a **dead-stone marking** step. The computer proposes which stones are dead from an ownership estimate (1,500 playouts on 9×9). A chain is called dead when the other colour ends up owning its points in more than ~65% of them. Tap any chain to flip it. Against the computer you Accept its marking, after adjusting it if you like. Two players each confirm (Black OK, White OK), and any change clears both. Resume goes back to play. The count is stones on the board plus empty points surrounded by one colour only. Points touching both colours, which includes the shared liberties of a seki, count for nobody. White adds komi. The board shows a small square of the owner's colour on every point of territory, and dead stones are faded.

## The computer

Monte-Carlo tree search, UCT with RAVE (AMAF) and heuristic priors. Captures and atari escapes start ahead, self-atari and early first-line moves start behind.

- **Playouts:** light. Each move is a capture of a chain the last move left in atari, an escape for a chain it just put in atari, or else a uniformly random move. Random moves never fill their own true eye and never put a chain of 2+ stones in self-atari. Without that last rule both groups of a seki die in half the playouts, and the end-of-game proposal rated a textbook seki 0.00 (one threshold away from "dead"). With it, they rate 0.92 and 1.00.
- **The board:** chains are circular linked lists with pseudo-liberty counts, plus the sum and sum of squares of the liberty indices. A chain is in atari exactly when `n·Σx² = (Σx)²`, so capture and atari checks are O(1). Measured in node: ~23k playouts/s on 9×9, ~15k on 13×13.
- **Superko** is enforced for the move actually played: root candidates come from the game. Deeper in the tree only simple ko applies, as in most MC engines.
- **Passing:** the computer passes only when you have just passed and it wins the count it would propose, or when it has no move but its own eyes. An earlier version also passed whenever the board looked settled and it was ahead. A random player then used those free moves inside its area and won 2 of 10 Easy games. Medium and Hard resign at under 3% when the board is ≥85% settled.

| Level | 9×9 budget | 13×13 budget |
|---|---|---|
| Easy | 1,000 playouts | 1,500 playouts |
| Medium | 6,000 playouts | 6,000 playouts |
| Hard | 20,000 playouts, 5 s cap | 16,000 playouts, 7 s cap |

The budget is compute time, not wall time. A reply never shows in under 0.4 s, because an instant answer feels like the computer did not look.

**Never freezes the page.** The search runs in a Web Worker built from a Blob of this file's own logic section. Checked in Chrome over `file://` with Playwright: the worker starts, and a Hard 9×9 search runs at 60 fps on the page (longest frame gap 17 ms). If a browser refuses the worker, the same job runs on the main thread in 12 ms slices between frames. Same budget, same result, and also 17 ms worst frame gap. `?noworker` forces that path.

**Think time** per move, measured in Chrome (opening / middle game):

| | desktop (worker) | 4× CPU throttle (main-thread path) |
|---|---|---|
| 9×9 Easy | 0.04–0.06 s | 0.15–0.25 s |
| 9×9 Medium | 0.2–0.3 s | 1.2–1.3 s |
| 9×9 Hard | 1.0–1.3 s | 3.8–5.0 s (cap) |
| 13×13 Easy | 0.2 s | 0.6–0.8 s |
| 13×13 Medium | 0.7–0.8 s | 2.0–2.3 s |
| 13×13 Hard | 1.9–2.4 s | 6.0–7.0 s (cap) |

DevTools CPU throttling does not reach dedicated workers: worker times at 4× matched 1×. So the throttled column is the same search on the main thread, which is the honest slow-phone figure.

## Look

The goban is drawn once per size: a warm gradient, broad soft figure bands, a few hundred thin wavy grain lines and a sheen. Grid lines sit on half-pixel centres with whole-device-pixel widths, so they stay crisp at any DPR. Stones are pre-rendered sprites: a radial-gradient body, a drop shadow, a highlight on slate, and on shell faint growth lines in four variants so neighbouring white stones differ. New stones settle in over 170 ms and captured ones fade out (both skipped under reduced motion). The click is synthesised WebAudio: band-passed noise for the snap plus a falling-pitch knock for the wood, and lighter clicks for captured stones going into the bowl.

## Tests

- `node test/rules.js`: captures (including two chains at once), suicide vs capture-first, ko, positional superko on a triple ko that simple ko cannot see, passes, area scoring on hand-built finished boards (dead stones marked and unmarked, a seki), the dead-stone proposal (seki alive, a dead stone found), handicap placement, undo restoring Zobrist keys and the superko record, the O(1) atari bookkeeping against brute force on 30k chains, SGF, and the back button being byte-identical to tetris's.
- `node test/ai.js`: at every level, captures four stones whose capture decides the game, pulls its own four out of atari, passes rather than fill its own eyes, never considers a superko-illegal move, and Easy wins 4/4 seeded games against a random mover.
- `node test/matches.js [n] [m]`: a report, not a test (~48 min). Every level against a random mover, and level against level. Last run (9×9, colours alternating, seeded):

| Match | Result | Own-eye fills |
|---|---|---|
| Easy vs random | 20/20 | 0 |
| Medium vs random | 20/20 | 0 |
| Hard vs random | 20/20 | 0 |
| Medium vs Easy | 10/10 | 0 |
| Hard vs Medium | 7/10 (all 10 ended by the loser resigning) | 0 |
| Hard vs Easy | 10/10 | 0 |
