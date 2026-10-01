# lib — shared files for the 3D tabletop games

The one place this repo breaks its "every game is a single self-contained file" rule, on purpose and only for the 3D tabletop games (Ludo first; Mahanagar, Go, Troll Chess, Tic-tac-toe, Dots & Boxes, Battleship, Queens and Knight's Tour to follow). Bundling three.js into each of nine board games would ship the same ~600 KB nine times; one shared copy is downloaded once and cached by the service worker for all of them.

| File | What |
|---|---|
| `three.min.js` | three.js **r128** (`0.128.0`), copied byte for byte from `cricket-3d/node_modules/three/build/three.min.js` — the revision Cricket 3D, Dojo Duel and Dusk Protocol inline. MIT licence, header kept. sha256 `9274bbcec8d96168626c732b5d31c775aa8cfb7eaa0599bec0c175908a2c1ce2`. Do not edit; to upgrade, replace the file and re-check every game that loads it. |
| `tabletop.js` | The kit: Penfight's look (renderer settings, pastel environment, desk, lights, materials) plus a camera rig, picking, motion helpers and a dice roller. A plain script exposing one global, `Tabletop`. Its API is documented at the top of the file. |
| `test/math.js` | Node tests of the kit's pure parts: easing, hop arcs and path sampling, die face to rotation, the picking radius. Found by `npm test` like any game's tests. |

## Using it from a game

```html
<script src="../lib/three.min.js"></script>
<script src="../lib/tabletop.js"></script>
```

Plain `<script src>` rather than modules, so a game opened straight off the disk over `file://` still works. Then:

```js
const kit = Tabletop.create({ canvas, onTap: (x, y) => { const hit = kit.pick.at(x, y); /* ... */ } });
if (!kit.ok) { /* kit.reason says why: show the 2D board instead */ }
kit.setDesk({ w: 70, d: 62 });
kit.add(kit.board({ w: 42, d: 42, h: 1.8, draw: (ctx, w, h, pxPerCm) => { /* print the board face */ } }));
kit.rig.fit({ w: 43, d: 43, h: 3 });
kit.rig.setView('angled');   // or 'top'
```

Every 3D game keeps its 2D view as the fallback. `create` returns `{ ok: false }` when three.js did not load, WebGL is unavailable, the context cannot be created, or the page URL carries `?no3d` (the switch for testing the fallback).

## Penfight's look on r128

Penfight inlines three **r158**, which converts colours from sRGB and uses physical light units by default. r128 does neither, so the same numbers would render brighter and flatter. The kit sets `physicallyCorrectLights = true` (r128's name for the same lighting maths, so Penfight's hemisphere 1.0 and sun 1.9 carry over unchanged), passes every material, light and fog colour through `Tabletop.col()` (sRGB to linear), and tags canvas textures `sRGBEncoding`. The background is the one colour r128 does not encode, so it takes the raw hex.

## Offline

`sw.js` precaches both files with the launcher shell (about 165 KB gzipped together), so a 3D game whose page is already cached never finds its library missing. Should a library be missing anyway, the game finds no `Tabletop` (or `create()` reports `ok: false`) and plays in 2D.
