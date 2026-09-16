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

## Status
Imported as-is from a bundled build. No test harness yet.
