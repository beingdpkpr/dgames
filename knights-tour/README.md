# Knight's Tour

Move a chess knight so it lands on every square of the board exactly once. One file, no dependencies, no build step. Open `index.html` directly.

## Playing

- Pick a board, 5×5 to 8×8, then tap a glowing square to place the knight, or press **Random**. The first visit opens on 6×6: 35 moves is a puzzle you can finish in a few minutes, while an unassisted 8×8 is 63 moves where one early slip only shows up forty moves later. After that the last size you played is remembered.
- Tap a glowing square to jump. Visited squares get a coin with the move number, shaded from ivory at the start to oxblood at the end, and a faint line traces the route.
- **Undo** as often as you like. **Restart** starts again from the same square, **New** goes back to the picker.
- **Assist** puts a number on each target: how many moves you would have from that square. The lowest one gets a brass ring, and taking it every time is Warnsdorff's rule (1823), which finishes most tours by itself. A red 0 is a trap.
- **Hint** marks the next square of a real tour from where you are. From a dead end it tells you how many moves to take back first.
- **Closed tour**: if your last square is a knight's move from your first, the tour is a loop and you get the closed-tour finish. That is only possible on 6×6 and 8×8. An odd board has one more square of one colour than the other, and a loop needs the same number of each.

Keys: arrows pick a target, Enter or Space jumps, U or Backspace undoes, H is hint, A is assist, R restarts, N is a new board.

## Dead ends

After every move a solver checks whether a tour can still be finished from the position. If it cannot, the game tells you ("No tour from here") and nudges the Undo button. The solver is a depth-first search that tries moves in Warnsdorff order and throws out a position as soon as it fails one of three checks:

1. **Colour count.** A knight always changes colour, so the squares left must split evenly between the two colours, with the extra one going to the colour the knight moves onto next. This rules out the 12 minority-colour starts on 5×5 at once.
2. **Degree.** Every square left needs a way in and a way out, except the last one. So no square can be unreachable, and at most one can have a single way in.
3. **Connectivity.** The squares left must all be one connected piece.

It runs about 8ms per animation frame so the page never freezes, and gives up after 1.5 million positions. If it gives up the game says it cannot tell. It never guesses.

The start picker uses the same solver: on 5×5 and 7×7 the minority-colour squares are marked ×.

## Best times

Kept per board size with the shared dgames high-score table (`dgames.hiscores.knights-tour-<size>`). A run counts as **assisted** once you use Hint or turn on Assist. Assisted runs go in their own table (`…-<size>-assisted`), because with Assist on the ringed square nearly solves the puzzle for you. Undo does not count against you.

## Tests

`node test/solver.js` loads the logic section of `index.html` (everything above `// ---------- UI ----------`) into node's `vm` and checks:

- Legal moves, including the edge count of the knight graph on each size.
- A tour is found from every start that has one on 5×5 and 6×6. The 12 minority-colour starts on 5×5 are reported as having none, and a plain exhaustive search with no pruning confirms that.
- 7×7 and 8×8 from every start, with timings. The largest search from any start is 115 nodes. A closed tour is found from all 64 8×8 starts.
- The dead-end verdict matches the plain exhaustive search on 700 positions across 5×5 and 6×6, about half of them still completable. A pruning rule that wrongly cuts off a live position shows up here and nowhere else.
- Searching in slices gives the same answer as searching in one go.
- Closed-tour detection.
- Following hints always finishes the board, and after every hint the position still has a tour. From a dead end, the rescue picks the shortest rewind that has one.

Known limit: from positions reached by random play on 8×8, about 5 in 100 exhaust the budget and come back "can't tell". These are dead for reasons the three checks cannot see, and the solver would need an exponential search to prove it.
