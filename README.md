# dgames

Small browser games, one folder each. Every game is a single `index.html` you can open directly; `index.html` at this root is a launcher that lists them.

| Game | Folder | Notes |
|---|---|---|
| Cricket 3D | `cricket-3d/` | Batting-only 3D cricket on Three.js. Tests: `npm run balance`, `npm run visual` inside the folder. |
| Tic-tac-toe | `tic-tac-toe/` | Against the computer, three levels (Hard is minimax). Test: `node test/ai.js` inside the folder. |
| Dots & Boxes | `dots-and-boxes/` | 2 to 5 players, each seat human or computer (three levels). Tests: `node test/ai.js`, `node test/players.js` inside the folder. |
| Duck Hunt Reimagined | `duck-hunt/` | Click-to-shoot duck hunt with a painterly canvas look, rounds and a mocking dog. Test: `node test/sim.js` inside the folder. |
| Rush Lane | `rush-lane/` | Three.js kart racer, three jungle circuits against three AI karts. Everything bundled into the one file; no tests. |
| Battleship | `battleship/` | Dark-ocean Battleship against a hunt-and-target computer or two players pass-and-play. Test: `node test/game.js` inside the folder. |
| Strike Force | `strike-force/` | Run-and-gun side-scroller: 8-way aim, troops, turrets, boss, power-ups, checkpoints. Test: `node test/sim.js` inside the folder. |

Conventions: one folder per game with its own `README.md`, `package.json` (only if it needs tooling) and `test/`. Keep games self-contained so any one can be opened or published on its own.
