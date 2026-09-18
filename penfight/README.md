# Penfight — recess edition

3D pen fighting on a school desk, built on Three.js. Flick your pens, knock the other side's pens off the desk; the last pen standing wins.

Open `index.html` directly. Three.js is bundled inline, so the file works offline; only the Google Font (Andika) is fetched from the network and falls back to system fonts.

## Options
- **Opponent** — the computer (Easy, Medium or Hard) or two players on one device, taking turns.
- **Desk** — Small (64 × 40 cm), Classic (80 × 50 cm) or Long (100 × 56 cm).
- **Desk clutter** — none, some (a notebook and erasers) or lots (plus a geometry box) to bounce off and hide behind.
- **Pencil case** — pick up to three pens per side; you flick one per turn. Random fills the case for you.

## How to play
Press on one of your glowing pens where you want to hit it, pull back like a slingshot, and let go. Pull further for more power. Hitting near the middle sends the pen straight; hitting near an end makes it spin. Tap a pen or its tag to switch pens. A pen falls when its middle goes past the desk edge. Knock every opposing pen off while keeping yours on.

The camera can be dragged on an empty spot to look around, scrolled or pinched to zoom, and right-dragged or two-finger-dragged to pan. Side, Top and Pen jump to preset views.

## High scores
Only matches against the computer that you win are recorded. The score is flicks per opposing pen knocked off (your flicks ÷ pens knocked off, one decimal), so lower is better. There is one top-10 table per computer skill (Easy, Medium, Hard) with three-letter initials, plus the flicks, pens and desk of the match. When a win makes the table, the result screen asks for your initials. The table lives under "High scores" beneath the Computer skill selector on the main menu and on the result screen after a win. Two-player matches, draws and losses are not recorded. Stored in the browser's localStorage (`dgames.hiscores.penfight.<skill>`), so it is per device and per browser.

## Tests
`node test/hiscore.js` pulls the high-score module and the scoring helper out of `index.html` and checks the ordering (lower flicks/pen first), the top-10 cap, the initials rules, the per-skill storage key and which results are not recorded. For the game itself, `node test/physics.js` slices the pure `physics.js` and `ai.js` sections out of `index.html` on their `// ===== name.js =====` banners -- neither touches Three.js or the DOM -- and checks the rules that decide a fight: a pen at rest does not drift, friction always slows and never speeds up, a pen driven past the desk midpoint falls while one stopping short does not, a struck pen is moved rather than tunnelled through, the same world stepped twice lands identically, `cloneWorld` is a real deep copy, and the AI scores a cleared desk positive and a cleared self negative.

## Status
Imported as-is from a bundled build; the high-score table was added on top of it.
