# dgames

Small browser games, one folder each. Every game is a single `index.html` you can open directly; `index.html` at this root is a launcher that lists them.

| Game | Folder | Notes |
|---|---|---|
| Cricket 3D | `cricket-3d/` | Batting-only 3D cricket on Three.js. Tests: `npm run balance`, `npm run visual` inside the folder. |
| Tic-tac-toe | `tic-tac-toe/` | Against the computer, three levels (Hard is minimax). Test: `node test/ai.js` inside the folder. |

Conventions: one folder per game with its own `README.md`, `package.json` (only if it needs tooling) and `test/`. Keep games self-contained so any one can be opened or published on its own.
