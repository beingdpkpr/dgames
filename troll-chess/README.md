# Troll Chess

Chess, trolled. One file, no dependencies, no build step. Open `index.html` directly.

Play the computer (Easy, Normal, Hard; start as White, Black or at random) or two players on one device. In a two-player game the board turns round at every hand-over so the player to move always has their army at the bottom.

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
