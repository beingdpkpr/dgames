# Duck Hunt Reimagined

Single-file click-to-shoot duck hunt with a painterly, atmospheric look. Open `index.html` in any browser; no network, no assets.

## Play
- Ducks cross the marsh from either side on sine-wave paths. Click (or tap) to shoot.
- Each round gives you a fixed number of shells and a quota of hits. Make the quota to advance; miss it and the dog surfaces to laugh at you, then it is game over.
- Consecutive hits build a combo (up to ×3). Every duck that reaches the far edge is a miss.
- Rounds scale: more ducks, faster flight, up to three in the air at once, and from round 4 some double back mid-flight. The sky slides from dawn to dusk over the first nine rounds.
- Best score and the mute setting are remembered in the browser. **M** toggles sound; **Enter** or **Space** starts from the overlays.

## Look
Everything is drawn on one canvas from layered shapes: gradient sky with sun, drifting clouds and mist; parallax hills and two tree-silhouette layers (pre-rendered, offset by mouse position); ground; two layers of swaying grass plus reeds that use a per-blade sine offset plus a global wind term. Ducks are body, tail, neck, head, beak, eye and two wings; the wings flap by rotating about the shoulder. Each duck casts a soft offset shadow and a ground shadow that sharpens as it gets lower. A shot fires a muzzle flash, a frame of screen-wide glow, screen shake and a smoke puff; a hit bursts feathers, and the duck tumbles, bounces in the grass and fades. The HUD is a hanging wooden sign with brass plates and shell icons. Vignette and animated film grain are CSS overlays. Sounds are synthesised with WebAudio.

## Tests
`node test/sim.js` loads the simulation half of `index.html` (everything above the `UI` marker has no DOM dependency) and:
- checks round scaling for rounds 1 to 25 never gets easier and the caps hold;
- checks hit detection picks the nearest flying duck and ignores misses and dying ducks;
- plays round 1 with a perfect shooter and asserts it reaches round 2;
- never shoots and asserts the dog appears and the game ends;
- shoots at random and asserts ammo never goes negative, counters stay consistent, and a round ends within 4 s of the last shell.
