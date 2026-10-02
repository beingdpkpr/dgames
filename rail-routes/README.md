# Rail Routes

*Railways across India.* A route-building card game for two to five players on one device. Each seat is a human (pass-and-play, hands hidden between turns) or a computer at Easy, Normal or Hard. Open `index.html` directly: no dependencies, nothing fetched.

The mechanics are those of the classic train route-building board game. The map, routes, tickets, art and text are original to this game and in plain English; `test/rules.js` fails if a trademarked name from the original appears in the page.

## Rules implemented

- **Cards**: 110 train cards, 12 in each of eight colours (Red, Orange, Yellow, Green, Blue, Purple, White, Black) and 14 locomotives, which are wild. Four each to start; five face up.
- **On your turn, one of three things**:
  - **Take two cards**, each from the face-up five or the pile. A face-up locomotive counts as both cards and cannot be your second card (a locomotive from the pile is just a card). If three locomotives are ever face up, all five are discarded and replaced; when the cards left could only come up as locomotives again, the row stays as it is instead of resetting forever. An empty pile is refilled by shuffling the discards.
  - **Claim a route**: pay as many cards of its colour as it has cars; grey routes take any *one* colour; locomotives stand in for any colour. Points at once: 1, 2, 4, 7, 10, 15 for lengths 1 to 6.
  - **Draw destination tickets**: look at three, keep at least one; the rest go to the bottom of the pile.
- **Double routes**: with 2 or 3 players only one track of a double route can be used; with 4 or 5 both can, but never both by the same player.
- **Start**: three tickets each, keep at least two.
- **Trains**: 45 each. When a player ends a turn with 2 or fewer, everyone, that player included, gets exactly one more turn.
- **End scoring**: each ticket adds its points if your own routes join its two cities (any connection, not only the shortest), and subtracts them if not. The longest continuous path (a trail: each route used once, cities may repeat) earns 10; everyone tied for it scores the bonus. Ties on total go to the most tickets completed, then the longest path.
- **Stalls**: if a player can do nothing at all (no cards anywhere, no tickets, nothing affordable) they pass; when everyone in turn has had to pass, the game ends and is scored. It did not happen once in the 1,012 simulated games checked for it (the 112 of `test/sim.js` and the 900 single-level games of the report).

## The map

44 cities, 101 routes (18 doubles), 309 car spaces: more than five players' 225 trains, so the board fills but never runs out.

**How it was made.** Each city starts at its real latitude and longitude on a simple equirectangular projection (x scaled by cos 22°), then a few crowded ones were nudged apart (the Delhi–Agra–Jaipur triangle, the Bengaluru–Mysuru–Coimbatore cluster) and coastal ones kept just inside our coastline. The route list is original: it follows the shape of the real trunk lines (Delhi–Mumbai through Rajasthan and Gujarat, the east-coast line, the Konkan coast, the line to the North-East through Siliguri) without copying any railway map. A script then

- set each route's length from its drawn length (about 23 map units per car, clamped to 1–6; a few long ones fixed by hand: Mumbai–Nagpur and Gorakhpur–Siliguri are the two 6s);
- checked that no route crosses another and none passes within 24 units of a third city;
- assigned colours to the non-grey routes greedily, longest first, to the colour with the fewest cars so far, avoiding a colour already used at either end city and never giving both tracks of a double the same colour.

The result: 26–27 cars in every colour, 95 grey cars (31 grey routes); lengths 1×9, 2×33, 3×22, 4×20, 5×14, 6×3.

The art is our own and deliberately stylised: a paper-coloured land with the coastline, Sri Lanka, eight rivers (Ganga, Yamuna, Brahmaputra, Narmada, Godavari, Krishna, Kaveri, Mahanadi), Himalayan peaks, Thar dunes and the Western Ghats drawn from rough coordinates, with no political borders at all.

One design choice to know about: **Dibrugarh hangs off a single route** (Guwahati–Dibrugarh, 4 blue), so the two Dibrugarh tickets can be blocked. It is the frontier city; the bottleneck is on purpose.

## Destination tickets

36 tickets, worth 5 to 27. **Points are computed, not chosen**: each is the fewest train cars that can join its two cities on the empty map (Dijkstra at load time; `test/rules.js` re-derives every value with Bellman-Ford and checks every ticket is completable). The city pairs were chosen by hand for spread: short ones that sit inside a region (Jaipur–Lucknow 5, Thiruvananthapuram–Chennai 7), cross-country ones (Delhi–Chennai 20, Mumbai–Kolkata 17), and two long ones that span the map (Dibrugarh–Mumbai 26, Amritsar–Thiruvananthapuram 27).

## The computer players

They see only what a player at the table sees: their own hand and tickets, the face-up cards, the claimed routes and everyone's counts. `test/rules.js` reshuffles the hidden cards, the pile and the other players' tickets and checks no choice changes.

- **Easy** keeps random tickets, draws loosely (often a random face-up card), and claims routes for its tickets most of the time but sometimes any route at all.
- **Normal** plans a network: for each ticket, biggest first, the cheapest path by Dijkstra where its own routes cost nothing, routes it has already planned cost nothing, and routes it cannot use are closed. It collects the colours that plan needs (grey routes assigned to whatever colour it holds most of), takes needed colours from the face-up row, claims the longest affordable planned route, chooses tickets by points against the extra cars they need, draws more tickets once its plan is done (when there is time), and lays its longest affordable routes for points at the end.
- **Hard** adds: a colour-aware plan that slightly prefers long routes (their points grow faster than their length) and links it can already pay for; takes any face-up card that shortens its plan once grey routes are re-assigned to suit it; claims bottlenecks (links with no good detour) first; estimates the turns left from the opponents' trains, and when its plan cannot be finished in time drops the tickets that cost the most cars per point and keeps building the rest; judges ticket draws against that time; and sometimes blocks: a cheap single-track link between the two biggest pieces of an opponent's network, paid with spare cards only.

Every Hard feature was A/B-tested against Normal, and some obvious ideas lost: taking face-up locomotives freely cost Hard about 5 points a game and keeping a third starting ticket about 24, so both went. Dropping only the worst tickets when time runs short, instead of abandoning the whole plan, gained 6 to 8 points a game.

### How much the level matters (`node test/bots.js`, 300 seeded games per line-up, seats rotated)

| Line-up | Win share per seat (fair = 1/players) | Average score |
|---|---|---|
| Hard v Normal | Hard 56.0% · Normal 44.0% | 99 · 90 |
| Normal v Easy | Normal 91.0% · Easy 9.0% | 106 · 39 |
| Hard v Normal v Easy | Hard 57.3% · Normal 40.7% · Easy 2.0% | 99 · 89 · 31 |
| Hard v Normal v Normal | Hard 40.7% · Normal 29.7% | 91 · 81 |
| Hard v 3 Normal | Hard 32.5% · Normal 22.5% | 90 · 80 |
| Hard v 4 Normal | Hard 22.7% · Normal 19.3% | 84 · 76 |

Four of one level: about 36 turns each (32–41), so about 145 turns in a four-player game. Normal and Hard complete about 2.1 tickets each and miss 0.8–0.9; Easy completes 0.8 and misses 1.5. Hard's edge is clear at two to four players and small at five, where the board is crowded and blocking luck dominates.

## Playing on a phone

The map is an SVG that fits the space left by the panel; pinch (or scroll) to zoom, drag to pan, the corner button shows the whole map again. A tap picks the nearest route within about 30 screen pixels, unless it lands on a city's dot, so one-car routes are easy to hit. Choices that need the map (tickets, paying for a route, the final scores) take the panel's place rather than covering the map. In pass-and-play a cover hides everything between two people's turns, and no message is shown over it.

Checked with Playwright at these sizes: no page scroll, every button at least 44×44, the back button overlapping nothing.

| Size | Map area during play | Layout |
|---|---|---|
| 390×844 portrait | 390×578 | header, players, map, panel |
| 375×667 portrait | 375×401 | same |
| 360×640 portrait | 360×374 (5 players: two rows of chips) | same |
| 844×390 landscape | 508×390 | panel left, map right |
| 667×375 landscape | 331×375 | same; setup sheet in two columns |
| 1280×800 desktop | 870×800 | same, larger cards |

## Save and resume

The game is saved to `localStorage` after every action (`rail-routes:save`, versioned). A save that is unreadable, from another version, or inconsistent (a card or ticket missing or doubled, trains that do not match the routes owned) is dropped and a new game offered. Settings (seats, speed, the claim-hint glow) are kept separately.

## Code

`index.html` holds everything. Above `// ---------- UI ----------` is pure logic: the map data, the seeded generator, the rules (`apply` returns events for the UI to animate), longest path, scoring and the computer players; it never touches the DOM, a clock or `Math.random`. Below is the page. The board is a separate view, `createBoard`, with a small interface (render a state, highlight cities, select a route, animate a claim car by car, flash a path, map a tap to a route or city, zoom) so a 3D tabletop view can replace it later.

## Tests

Run inside this folder:

- `node test/rules.js`: the map (connected, lengths, colours balanced, doubles), every ticket completable and correctly valued, the deck, the three-locomotive reset, drawing rules, claiming (grey routes, locomotives, wrong colours, not enough trains), double routes at each table size, ticket completion, the longest path against a brute force over 400 random networks with cycles and parallel routes, the end of the game, scoring and tie-breaks, save validation, what the computer may see, the shared back button.
- `node test/sim.js`: 112 whole computer games at every table size: all end by the train rule, no computer move is ever refused, the cards and scores match an independent recount; and Hard beats Normal beats Easy.
- `node test/bots.js`: the level report above (report only, always exits 0).
