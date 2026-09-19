# dgames

Small browser games, one folder each. Every game is a single `index.html` you can open directly; `index.html` at this root is a launcher that lists them.

Play them at **<https://beingdpkpr.github.io/dgames/>**, or open any `index.html` off the disk — the games work the same either way.

| Game | Folder | Notes |
|---|---|---|
| Cricket 3D | `cricket-3d/` | Batting-only 3D cricket on Three.js. Tests: `npm run balance`, `npm run visual` inside the folder. |
| Tic-tac-toe | `tic-tac-toe/` | Against the computer, three levels (Hard is minimax). Test: `node test/ai.js` inside the folder. |
| Dots & Boxes | `dots-and-boxes/` | 2 to 5 players, each seat human or computer (three levels). Tests: `node test/ai.js`, `node test/players.js` inside the folder. |
| Duck Hunt Reimagined | `duck-hunt/` | Click-to-shoot duck hunt with a painterly canvas look, rounds and a mocking dog. Test: `node test/sim.js` inside the folder. |
| Rush Lane | `rush-lane/` | Three.js kart racer, three jungle circuits against three AI karts. Everything bundled into the one file. On-screen pad on phones. Tests: `node test/race.js`, `node test/touch.js` inside the folder. |
| Battleship | `battleship/` | Dark-ocean Battleship against the computer (three levels, Hard scores by probability density) or two players pass-and-play. Test: `node test/game.js` inside the folder. |
| Strike Force | `strike-force/` | Run-and-gun side-scroller: 8-way aim, troops, turrets, boss, power-ups, checkpoints. On-screen pad on phones. Tests: `node test/sim.js`, `node test/touch.js` inside the folder. |
| Penfight | `penfight/` | 3D pen-flicking on a school desk, against the computer or two players on one device. Imported as a bundled file. Tests: `node test/physics.js`, `node test/hiscore.js` inside the folder. |
| Ludo | `ludo/` | Classic Indian Ludo, 2 to 4 players, each seat human or computer (three levels). Tests: `node test/rules.js`, `node test/ai.js`, `node test/record.js` inside the folder. |
| Tetris | `tetris/` | Guideline-rules Tetris: SRS wall kicks, seven-bag, hold, ghost, T-spins. Test: `node test/engine.js` inside the folder. |
| Excitebike | `excitebike/` | Side-on motocross after the 1984 original: turbo that overheats, cooling arrows, mid-air lean to land level. Test: `node test/sim.js` inside the folder. |

Conventions: one folder per game with its own `README.md`, `package.json` (only if it needs tooling) and `test/`. Keep games self-contained so any one can be opened or published on its own.

Three shared snippets are pasted verbatim into each game that needs them rather than imported, so that self-containment holds: the high-score table (`dgames.hiscores.<game>` in localStorage), the touch pad, which turns thumbs into the key events a game already listens for so keyboard-only games play on a phone, and the back control in the top-left corner, which is the same in all nine. Edit a snippet in one game and paste it across the rest, byte for byte; the per-game touch tests check the codes each pad emits against that game’s own key map.

Your name is asked for once and kept at `dgames.player`, so every game's table shows it without you retyping anything. It used to be three letters read straight off `keydown` into three `<span>`s — which meant a phone, with no keyboard to summon and nothing focusable to summon it, could not enter a name at all and saved `AAA` every time.

## Install it like an app

The site is a PWA, so Android and iOS will both install it to the home screen — Chrome offers "Install app" / "Add to Home screen", Safari does it from the Share sheet. Installed, it launches fullscreen with no browser chrome and shows up in the app switcher like anything else. There is no Play Store build and no APK; a store listing would mean a developer account, a review queue and a rebuild for every change, and the install prompt gets the same result from a link.

The pieces: `manifest.webmanifest` (name, colours, icons, and long-press shortcuts to a few games), `sw.js` (the service worker), and `icons/`, which `node scripts/make-icons.js` draws from scratch — the PNG encoder is about forty lines around node's own zlib, so the icons are reproducible rather than binaries nobody can edit.

Offline: the launcher and its icons are cached on install, and each game is cached the first time you open it. So a game you have played once works with no network, and one you never opened does not. That is deliberate — Rush Lane alone is 1 MB, and precaching everything would spend several megabytes of someone's data on games they may never touch. Updates use stale-while-revalidate: you get the cached copy instantly and the new one on the next visit.

Every path in the manifest and the worker is relative. This is a GitHub Pages *project* page served from `/dgames/`, not a domain root, so a root-absolute `/sw.js` would point at the wrong place and 404 — the single easiest way to break a project-page PWA.

## Tests

`npm test` from the root runs every game's tests. It finds them by walking `<game>/test/*.js`, so a new game or a new test file needs no wiring. Tests whose dependencies are not installed are skipped with the reason rather than failed, and skips are reported separately from passes — `npm run test:strict` turns a skip into a failure, which is what CI uses once it has installed them. Two cricket-3d files sit outside the default suite: `test/visual.js`, which drives a real browser (`npm run test:visual`), and `test/balance.js`, which is a tuning report rather than a test — it asserts nothing and always exits 0, so it can only make a gate slower, never catch anything. `npm run test:all` runs both when you want to read them.

GitHub Actions runs the suite on every pull request and branch push, and again on `main` before publishing to Pages, so a red test blocks the deploy.
