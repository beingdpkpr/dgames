# Rush Lane

Pastel jungle kart racing on Three.js. Three laps, four racers (you plus three AI karts), three circuits: Canopy Cruise, River Run, Ancient Temple Ruins.

Open `index.html` directly. Three.js and all assets are bundled inline, so the file works offline; only the Google Fonts (Baloo 2, Nunito) are fetched from the network and fall back to system fonts.

Controls: arrows or WASD to drive, Space fires the offensive item, Shift uses the defensive item, R respawns on track, P pauses, M mutes.

On a touch screen a pad appears when the race starts and goes away on the menu, the pause screen and the results: two wide steering paddles under the left thumb, GAS, BRAKE, ITEM and SHIELD under the right. Steering and throttle are separate buttons rather than one thumbstick because the gas has to stay pinned while the other thumb steers, and a stick drops the throttle the moment the thumb leaves the diagonal. The pad synthesises the same key events the keyboard sends, so nothing in the driving model changes. Desktop never builds it; `?touch=1` forces it on for a look.

## High scores

Each circuit keeps its own top-10 of total race times (three laps, lower is better) with three-letter initials, arcade style. When you finish a race with a time that makes the table, an initials prompt appears over the results; the finishing position (`P1 of 4`) is stored next to the time. The table for the highlighted circuit is shown on the circuit select. Everything is stored in the browser's localStorage (keys `dgames.hiscores.rush-lane.<circuit-id>`), so it is per browser and per device, and clearing site data removes it.

## Tests

`node test/touch.js` cuts the shared touch-pad snippet and the `KEY_MAP` / `InputHandler` block out of `index.html` (there is no module boundary to slice on in a bundle, so it cuts on those landmarks) and drives the real pad against the real `InputHandler`: that GAS and a steering paddle hold together, which is the whole reason this game gets paddles instead of a stick; that ITEM registers as a consumable edge rather than a hold; that every code the pad emits is in `KEY_MAP`; and that lifting off or losing focus releases everything rather than leaving the kart at full throttle.

`node test/hiscore.js` extracts the high-score module and the `m:ss.t` time formatter out of `index.html` and checks ordering (fastest first), the top-10 cap and initials normalisation. There is no harness for the race itself.

Imported from `D:\work\mine\games\rush-lane.html`; the high-score panel and the touch pad were added afterwards, in this file. Re-importing from the source would drop both.
