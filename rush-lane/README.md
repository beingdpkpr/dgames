# Rush Lane

Pastel jungle kart racing on Three.js. Three laps, four racers (you plus three AI karts), three circuits: Canopy Cruise, River Run, Ancient Temple Ruins.

Open `index.html` directly. Three.js and all assets are bundled inline, so the file works offline; only the Google Fonts (Baloo 2, Nunito) are fetched from the network and fall back to system fonts.

Controls: arrows or WASD to drive, Space fires the offensive item, Shift uses the defensive item, R respawns on track, P pauses, M mutes.

## High scores

Each circuit keeps its own top-10 of total race times (three laps, lower is better) with three-letter initials, arcade style. When you finish a race with a time that makes the table, an initials prompt appears over the results; the finishing position (`P1 of 4`) is stored next to the time. The table for the highlighted circuit is shown on the circuit select. Everything is stored in the browser's localStorage (keys `dgames.hiscores.rush-lane.<circuit-id>`), so it is per browser and per device, and clearing site data removes it.

## Tests

`node test/hiscore.js` extracts the high-score module and the `m:ss.t` time formatter out of `index.html` and checks ordering (fastest first), the top-10 cap and initials normalisation. There is no harness for the race itself.

Imported from `D:\work\mine\games\rush-lane.html`; only the high-score panel was added afterwards.
