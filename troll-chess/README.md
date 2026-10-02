# Troll Chess

Chess, trolled, on a 3D chessboard on a desk, with the flat 2D board as a choice and as the fallback. No build step: open `index.html` directly; it works offline and over `file://`. The 3D board loads the shared `../lib/three.min.js` and `../lib/tabletop.js` (see `lib/README.md`), so the folder needs `lib/` beside it. Without it, or without WebGL, the game plays in 2D.

Play the computer (Easy, Normal, Hard; start as White, Black or at random) or two players on one device. In a two-player game the board turns round at every hand-over so the player to move always has their army at the bottom (in 3D the camera swings round instead).

## Modes

Picked on the New game card; the choice is remembered.

| Mode | Cards | Fusion pieces | What a turn is |
|---|---|---|---|
| **Card Chess** | yes | no | Draw a card, then do what it says: one, two or three moves, nothing, swap armies, revive pieces, or place a piece anywhere. See [The cards](#the-cards). |
| **Fusion Chess** | no | yes | One ordinary move. Knights fuse with rooks, bishops and the king. See [Fusion pieces](#fusion-pieces). |
| **Card + Fusion** (default) | yes | yes | Both: the cards decide the turn, and knights fuse. |

There is no fourth mode with neither, since that would just be chess. The engine enforces this as well: `newGame({ cards: false })` always turns fusion on, whatever it is passed. In code, a game is `S.cards` plus `S.pos.fusion`, and the UI names it with `VARIANTS`.

**Without cards** (Fusion Chess):
- **Checkmate wins**, as in chess. A check is simply answered on the next move, since nobody can draw a Skip.
- **The Kning** still isn't mated: in check with no move, its turn passes and the other side takes the knight.
- **Draws:** after 50 moves each with no capture and no pawn move (`QUIET_LIMIT`). Also drawn: both sides left without a legal move in a row.

Wins, losses and draws against the computer are kept per level and per mode, at `dgames.troll-chess.record`.

## The 3D table

An inlaid chessboard (maple and walnut squares, a mahogany frame with an inlaid line and the files and ranks printed for both players) on the shared tabletop kit's desk, with Staunton-style pieces in glossy ivory and ebony. The look, lights, desk and camera are the kit's, as in Ludo, City Tycoon and Go. The rules, the computer and the HUD (the player strips, the cards, the buttons, the banners) are the 2D page's; the 3D board only draws the game and turns a tap into the same square press the 2D grid makes.

- **Defaults:** 3D wherever WebGL works. Angled on a desktop or a phone held sideways, top-down on a phone held upright. **Top / Angled** and **2D** buttons sit in the board's corner (stacked in the strip of desk beside the board when the stage is wide); in 2D a **3D** button in the header brings it back. The choice and the camera are remembered in `dgames.troll-chess.view` (localStorage, read and written in try/catch). Quality is low on touch screens and high elsewhere; `?q=low` / `?q=high` override it. `?no3d` forces 2D. 2D is also what you get when WebGL is missing, when building the scene throws (the half-built scene is disposed), or when the WebGL context is lost mid-game. In every case the game carries on.
- **Orientation:** the army of the player at the bottom of the 2D board is nearest the camera. After a Reverse, and at every hand-over in a two-player game, the camera swings round the board.
- **Pieces** are turned on a lathe: pawn, rook with six merlons, a carved horse's head on a turned foot (with eyes, turned to show its profile), bishop with the mitre's slit cut in, queen with a crown of eight balls, king with a cross. A king is 7.7 cm on 5 cm squares, a little shorter than a tournament set so the angled view hides less. Each kind and colour is one instanced mesh (one draw call for all the pawns of a colour, and so on).
- **Fused pieces** read the way the 2D board draws them: the rook, bishop or king a size down at the back left of the square and the knight smaller at the front right, both standing on one brass plate. A Knook, a Knishop and a Kning are each their own shape, so all three are told apart from above as well as from the side.
- **Moves:** a piece lifts, glides (leaning back as it sets off and forward as it stops) and sets down. Knights, and a Knook or Knishop making a knight's move, hop in one arc. Castling moves both pieces, the rook hopping over the king. A capture knocks the taken piece off the board in a turning arc to its army's row beside the board; a captured Knook or Knishop comes apart into its two pieces there, and a taken Kning's knight goes to the row while its king steps to its escape square. A taken king falls over beside its row. Promotion: the pawn rises turning, becomes the new piece at the top of the turn and settles back down. A fusion snaps the two pieces into the fused one.
- **Cards** stay in the HUD as in 2D. Their effects on the board: **Reverse** swings the camera to the other army; **Draw 2** lights the revive quarter and its squares (pick the piece in the strip as in 2D), and the revived piece flies from its row onto the square; **Wild** lifts the chosen piece and carries it across in one high arc (a knight dropped on its own rook, bishop or king fuses with it).
- **Marks on the board:** the last move's squares (and a Kning's escape square) tinted yellow, the selected square indigo with its piece lifted off it, dots for moves, rings round pieces that can be taken, gold rings for a fusion, green dots for a Wild or Draw 2 square, the Draw 2 quarter tinted green, and a red glow under a king in check.
- **Captured rows:** each army's captured pieces (the Draw 2 pool, so a promoted piece stands there as a pawn) stand in two rows, pieces then pawns, beside the board on a wide stage and at its ends on a tall or big one: Black's by White's right hand, White's by Black's. On a phone the board keeps its size and the rows peek in from the edges.
- **Tapping:** the kit's picking. A tap on a piece picks its square (each piece has an invisible outline, a wide body and a narrower head, so a pawn's head showing above the king in front of it is the pawn); a tap on the board picks the square under it; if the board point under the finger is a target and the piece in front of it is not, the target wins. Dragging tilts and turns the camera and pinching zooms; a double tap on the board is two taps, not a camera reset. The click a touch tap sends after it is dropped. Checked in Chromium by real taps on every square: an empty board 64/64 at 360×640 top (touch), 390×844 top (touch), 844×390 top and angled, 1280×800 angled and 360×640 angled; the opening position 64/64 everywhere when each piece is tapped near its top, and top-down 64/64 tapped anywhere on the piece. Angled, a tap low on the e2 pawn (40% of its height) lands on the king standing in front of it, and a tap on the board at the foot of four back-rank pieces and two second-rank pawns lands on the piece in front: in both cases that is what the eye sees there too.
- **Cost:** rendering is on demand, so a still board draws nothing. A full board (32 pieces, two fused pieces, eight captured pieces) is 22 draw calls including the shadow pass, 50k triangles at low quality and 101k at high. At 4× CPU throttle in headless Chromium on SwiftShader (a software GPU), the whole frame, waiting for SwiftShader to rasterise it, takes 100–145 ms at low and 155–205 ms at high at 360×640 and 844×390: between Ludo's 90–105 ms and Go's 275–300 ms measured the same way. Only animation frames pay it, and a phone GPU draws this scene far faster.
- **Nothing saved changes:** the game keeps no save (only the setup choices in `dgames.troll-chess.prefs` and the record in `dgames.troll-chess.record`), so there is nothing to resume.

## The cards

The deck is 40 cards and reshuffles when it runs out. The mix is one constant, `DECK_MIX`, at the top of the rules section.

| Card | In the deck | What it does |
|---|---|---|
| 1, 2, 3 | 12, 8, 4 | Make up to that many moves, with any of your pieces. You can end a 2 or a 3 after the first move. |
| Skip | 4 | Your turn is skipped. |
| Reverse | 4 | The board flips: you take over the other army and your opponent takes yours. Your turn ends. |
| Draw 2 | 4 | Revive up to two of your captured pieces. They go in the quarter of the board (a 4×4 corner) diagonally opposite the enemy king, on an empty square from which they would not attack that king. A pawn never goes on its last rank; the second-last is as far as it can be placed. A piece with no such square cannot come back. |
| Wild | 4 | Pick up one of your pieces and put it on any empty square. |

## Rules the cards needed

Some of these are not in the one-paragraph description the game came from. Each one is where the code settles a question, so if one of them is wrong it is a small change in one place.

- **Winning** is by taking the enemy king, or by checkmate: if a player draws a number card while in check and has no legal move, they lose. A player left in check who draws Skip, Reverse, Draw 2 or Wild cannot answer the check, and the king can simply be taken on the next turn. Taking the king is always a legal move.
- **A check ends your turn.** Without this a 2 or a 3 would be check-then-take-the-king. With it, the opponent always gets to draw a card and answer, if the card lets them. (`playMove`)
- **Every move must be legal chess**: you cannot leave your own king in check, in the middle of a 3 either.
- **No legal move and not in check** (stalemate): the turn passes. Nobody wins.
- **Wild** may not put the enemy king in check, directly or by uncovering a line, and may not leave your own king in check. The Draw 2 rule already forbids reviving a piece that attacks the king; Wild follows the same idea so neither card hands out a free check. Pawns stay off their last rank here too. Wild can be declined. (`wildTargets`)
- **Draw 2 can be stopped after one piece.** "Your captured pieces" means the pieces of the army you command now, so after a Reverse it is the other pool.
- A captured piece that had been **promoted** goes back to the pool as a pawn.
- **Castling** rights are lost as usual, and also when a Wild moves the king or rook; a revived rook never castles. **En passant** is only possible on the move straight after the double step, even when the same player makes that next move.

## Fusion pieces

In Fusion Chess and Card + Fusion, a knight can join a rook, a bishop or its own king on one square. Card Chess is the game above, without these.

| Piece | Made from | Moves |
|---|---|---|
| **Knook** | knight + rook | like a rook or a knight |
| **Knishop** | knight + bishop | like a bishop or a knight |
| **Kning** | knight + king | one or two squares along any of the king's eight lines; a piece next to it blocks the second step on that line. No knight jumps. |

- **Fusing**: move either piece onto the other. That includes the king stepping onto its knight, or the knight jumping onto the king. A fused piece does not fuse again, and a queen never fuses. A rook or king that fuses loses its castling right.
- **Captured**, a Knook or Knishop goes back to the pool as its two pieces, and a promoted part goes back as a pawn, as usual.
- **The Kning counts as the king** for check. It shows the red check glow, and you may not move it into attack. But with cards, **checking a Kning does not end your turn**: with a 2 or a 3 you can check it and keep moving, including taking it. Checking a plain king still ends the turn. (`turnEndingCheck`)
- **Taking a Kning** costs only the knight. The king goes to a free, unattacked square **within two squares** (anywhere in the 5×5 box around it, no path needed). Nearest first: a neighbouring square beats one two away. Among equals it picks the one with the most safe squares around it, then the lowest square, so the choice is always the same. This matters most against a queen, which usually covers every neighbouring square. Only if nothing within two squares is safe is the king taken with it, and the game lost. For the same reason a Kning in check with no legal move is **not** checkmated: the turn just passes.
- With cards, **Draw 2** can revive a knight onto your rook or bishop inside the revive quarter, or onto your king **wherever it is**. That is the one way a Draw 2 can shield a king in check: next turn the capture only takes the knight.
- With cards, **Wild** can drop a knight onto your rook, bishop or king anywhere on the board. Only the knight moves onto the other piece, not the other way round.
- Neither Draw 2 nor Wild may make a fused piece that checks the enemy king, the same rule as for everything else they place.
- With cards, **a pawn placed by a Wild** counts as having just stepped past the square behind it. An enemy pawn beside it on the same rank may take it en passant, on the very next move only.

The code: the piece types are `M` (Knook), `A` (Knishop) and `E` (Kning), and the flag is `pos.fusion`. `canFuse`, `fuse`, `partsOf` and `kingEscape` hold the rules above.

## The computer

Material plus small positional bonuses, searched with minimax shaped like a card-game turn: its own remaining moves in a row (a check stops them), then one reply by the opponent, who is assumed to hold a 1. The reply is always searched, so a move never looks good only because the answer to it was cut off. Leaving the other side in check is worth a bonus, since four cards in ten cannot answer it.

- **Easy** looks one move ahead with no thought for the reply, and adds noise.
- **Normal** looks at each move and the best reply.
- **Hard** searches three plies (two of its own and a reply when it holds a 2 or 3).

For Draw 2 it revives the most valuable piece onto the square the reply hurts least. For Wild it tries every piece on every allowed square, and declines if nothing beats staying put.

Without cards the same search simply runs with one move a turn and no card bonus.

## Tests

- `node test/rules.js`: the move generator against perft totals from the start position, "Kiwipete", and positions 3 and 4 (castling, en passant, promotion, pins, discovered checks). Then the deck (mix, seeded shuffle, reshuffle) and every card: move counts, ending early, check ending the turn, checkmate on a number card, taking a king left in check, stalemate passing, Skip, Reverse swapping armies, Draw 2's quarter, king-attack, last-rank and no-room rules, promoted pieces reviving as pawns, Wild with pins, discovered checks and castling rights.
- `node test/ai.js`: the computer takes a king left in check, takes a hanging queen, saves its own, revives the queen first and uses a Wild to get out of check. Then 24 whole games at Easy and Normal, and Hard against Normal. The rules throw on any illegal action, so a finished game proves every action the computer chose was legal. It also times Hard, and checks that Hard beats Easy more often than not.
- `node test/fusion.js`: the fusion pieces. It checks:
  - how the three fused pieces move and attack, including the Kning's blocked second step
  - every way to fuse, and the ones that are refused (queen, a fused piece, Card Chess)
  - Knook and Knishop splitting when captured, including a promoted part
  - the Kning's king escaping (two squares away when a queen covers every neighbour), or being taken when nothing within two squares is safe
  - checking a Kning with a 2 or 3 leaving the rest of the turn, while checking a plain king still ends it
  - a Kning in check with no move passing instead of losing, next to the same position with a plain king, which is mate
  - Draw 2 and Wild fusions, including saving a king in check
  - en passant on a Wild pawn, only on the next move and only with fusion on
  - 12 computer-vs-computer Card + Fusion games with every action accepted.
- `node test/nocards.js`: Fusion Chess, the mode without cards. It checks:
  - no deck, one move a turn, and nothing to draw
  - no cards plus no fusion still gets fusion (no mode with neither), while Card Chess keeps fusion off
  - fusion moves on offer, and fool's mate winning
  - a check answered on the next move
  - a Kning in check with no move passing, then losing only its knight
  - the 50-move draw
  - 8 computer-vs-computer games that all finish
