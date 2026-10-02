# Island Traders

*Settle, trade and build on a hex island.* A settle-and-trade board game for two to four players on one device. Each seat is a human (pass-and-play, hands hidden between turns) or a computer at Easy, Normal or Hard. Open `index.html` directly: no dependencies, nothing fetched.

The mechanics are those of the classic settle-and-trade board game. The island, the resource and card names, the card texts and every tile illustration are original to this game, in plain English: `test/rules.js` fails if a trademarked name from the original appears in the page.

## Names

| Here | Means |
|---|---|
| Timber, Clay, Wool, Grain, Ore | the five resources, from Forest, Clay Pits, Pasture, Fields and Mountains; the Dunes pay nothing |
| Village (1 point), Town (2 points) | the two buildings; a town replaces a village and pays double |
| The bandit | moves on a 7 or a Guard |
| Venture cards | the development deck: 14 **Guard**, 2 **Road Crew**, 2 **Good Harvest**, 2 **Market Day**, 5 **Landmark** (Lighthouse, Old Library, Clock Tower, Stone Bridge, Harbour Hall) |
| Longest Road, Strongest Guard | the two 2-point awards (5+ roads; 3+ Guards played) |
| Harbours | 4 of them 3:1 for anything, 5 of them 2:1 for one resource; the bank is 4:1 |

## Rules implemented

- **The island**: 19 tiles (4 Forest, 3 Clay Pits, 4 Pasture, 4 Fields, 3 Mountains, 1 Dunes), the 18 number tokens 2–12 (no 7), 9 harbours on the coast. *Random* islands are reshuffled until no 6 or 8 touches another 6 or 8, no two equal numbers touch, no resource forms a clump of three tiles, and every resource gets a fair share of the dice (2.3 to 4.3 pips per tile on average; 7.8 reshuffles on average). *Beginner* is one fixed, balanced island.
- **Setup**: village + road each, in seat order and then back (1 2 3 4 4 3 2 1). Villages need a free corner with no building on a neighbouring corner (the distance rule). The second village pays one card per tile around it.
- **A turn: Roll → Trade → Build → End.** Every tile showing the number pays 1 per village and 2 per town on its corners, except the tile under the bandit. If the bank cannot pay everyone a resource in full, nobody gets it, unless only one player is owed it (they take what is left).
- **A 7**: everyone holding more than 7 cards discards half, rounded down; the roller moves the bandit to another tile and takes a random card from a player with a building there.
- **Building**: Road = timber + clay; Village = timber + clay + wool + grain; Town = 2 grain + 3 ore; Venture card = wool + grain + ore. 15 roads, 5 villages, 4 towns each. Roads join your own road or building, and cannot run on through another player's building.
- **Venture cards**: one per turn, never on the turn bought; a Guard may be played before rolling (the others after). Landmarks are hidden points that count the moment they are bought.
- **Longest Road**: the first unbroken trail of 5+ roads (branches do not add up; a loop counts all the way round; another player's village cuts it); someone must build a longer one to take it. If the holder's road is cut and two others tie for longest, nobody holds it.
- **Strongest Guard**: the first to play 3 Guards; someone must play more to take it.
- **Trading**: with the bank at 4:1, at a harbour 3:1 or 2:1, and with other players: any cards for any cards, both sides giving something, never like for like.
- **Winning**: 10 points on your own turn (8 in the short game). Landmarks are revealed at the end.
- **Two players**: the *friendly bandit* is always on: nobody on 2 points or fewer can be robbed or have the bandit put beside them. It is an option for 3–4.

## Trading, which is the point

Tap **Trade**, tap what you give (the small number is your bank rate for it), tap what you want, and **Ask players**. Every computer answers at once: *accepts*, *no thanks*, or a **counter** (one more of what you offered, or one less of what you asked for) with a *Take it* button. Another human at the table is asked by handing the device over. **Bank** lights up when the offer is exactly a bank or harbour trade. Chips in the offer line take one card back.

Computers also propose to the table on their own turn (at most one or two offers a turn, so they do not nag): to each other, and to you in a small dialog when you hold what they want and nobody before you in the seat order has already said yes.

## How the computer players think

Everything they decide comes from what a player at the table can see: their own hand, the board, everyone's card counts and public points. Nobody peeks at another hand.

- **Placement** scores each corner by expected income (pips: a 6 or 8 is 5 of 36 rolls), weighted by resource, with a bonus for a resource they do not yet produce and for a harbour that matches what they do. Easy picks among the top eight at random.
- **Plan**: each turn they choose a goal — a town on their best village, a village on the best open spot, a road towards a spot up to 1/2/3 roads away (Easy/Normal/Hard), a venture card — by value against how far they are from affording it, then build it, or trade towards it: bank and harbour first, then an offer to the table.
- **Answering offers**: each resource is worth more when the goal is missing it and less when they hold a surplus; they accept when the deal gains them value (Hard demands the most), otherwise counter. **They never feed the leader**: no deals with anyone within 2 points of winning, nor with the leader when 3 points clear of them.
- **Hard** also races for the Longest Road (it looks for the road that takes the award), saves Guards toward the Strongest Guard, and plays them at the leader. **Everyone** sends the bandit to the best tile of the highest-scoring opponents, never their own, and robs the leader; Easy places it at random.
- **Discards** keep what the goal needs and throw the surplus.

### How much the level matters (`node test/bots.js`, 300 seeded games per line-up, seats rotated)

| Line-up | Share of wins per seat (fair share = 1 / players) |
|---|---|
| Hard v Normal v Easy | Hard 63.3%, Normal 34.7%, Easy 2.0% |
| Hard v 3 Normal | Hard 44.7%, Normal 18.4% |
| Hard v 2 Hard v 2 Normal | Hard 35.7%, Normal 14.3% |
| Normal v 3 Easy | Normal 90.0%, Easy 3.3% |
| Hard v Normal (2 players) | Hard 61.0%, Normal 39.0% |
| Normal v Easy (2 players) | Normal 89.0%, Easy 11.0% |

Easy is weak on purpose (random placement among good spots, random bandit, no offers of its own, no harbours), but it is *very* weak against the other two: a table with an Easy seat is mostly a game between the others.

### How long a game takes

Four players take 68 turns on average (17 rounds; 90% of games within 83 turns). At Normal speed the three computers spend about 3 minutes of the whole game on their turns (1.4 at Fast); the rest is you. At a minute per turn of your own that is about 20 minutes; with more trading and thinking, 30–45. Two players take 30 rounds, so about as long. Seat order matters little (four Normals win 29/23/25/24% from seats 1–4).

## The board view

The island is drawn in SVG behind a small interface (`view`: `render`, `highlight` legal corners/edges/tiles, `preview` a ghost piece, `hit` a tap to the nearest highlighted spot, `tileScreen` for flying cards, `flashTile`), so a 3D view on the shared `lib/tabletop.js` kit can replace it later without the game changing. Taps snap to the nearest legal spot within most of a hex side, show a ghost piece, and need a second tap or the button to confirm: corners are a few millimetres apart on a phone.

## Saving

The game saves after every action (`dgames.island-traders.save` in localStorage). The save is versioned and checked on load; an old, foreign or damaged save is set aside and you start fresh. The dice come from a seeded generator kept in the save, so a resumed game rolls exactly what it would have.

## Tests

- `node test/rules.js`: geometry (19/54/72, the 30-edge coast), 600 random islands against every balance rule, setup and the distance rule, production on every roll against a direct count (towns, the bandit, a short bank), 7s and discards, building costs and legality, every venture card, the Longest Road against brute force on hand-built networks (straight, fork, loop, loop with tail, two loops, cut by an opponent) and 400 random ones, the awards changing hands, harbour rates, trades, winning, save/resume, 120 computer games with no illegal move, computer answers that are always affordable, never feeding the leader, and the shared back button. 122 checks, about 7 s.
- `node test/sim.js`: 200 seeded computer games at 2–4 players all finish (longest 156 turns, Easy-only); the computers trade with each other; Hard > Normal > Easy. About 16 s.
- `node test/bots.js` (report, not a test): win shares and game lengths, the tables above.
