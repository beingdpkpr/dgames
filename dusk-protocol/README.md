# Dusk Protocol

A prototype first-person infiltration shooter in the mould of Project I.G.I.: one operative, four missions on two maps, get in, do the job, get out. A single `index.html` with Three.js r128 inlined. Every texture is drawn on a canvas at load, and every sound is synthesised. The only optional network fetch is the Chakra Petch font, which falls back to the system UI font. Works from disk and offline.

## The missions
The title screen is the campaign: pick a mission on the left, read the briefing on the right. Mission 1 is open; each one you complete opens the next. Progress, best time and best rating per mission are kept in `localStorage` (a private window keeps nothing and the game still plays). The briefing's background is the chosen map, live, with its garrison walking.

| # | Name | Map, time | Objectives |
|---|---|---|---|
| 01 | RELAY | compound, dusk | upload at the command post terminal (hold E 3 s), reach the LZ west of the gate |
| 02 | BLACKOUT | compound, night | charge on the radio mast, charge on the generator, reach the south-east clearing. The first charge starts a 2:30 clock; each blows 20 s after it is set, is heard by every guard (they go and look), kills anyone within 5 m and hurts you within 9 m. The LZ waits for the last bang. |
| 03 | HIGH GROUND | mountain radar outpost, dawn | identify Colonel Varga through the scope (or from 12 m) -- he is then tagged on screen and on the compass -- kill him, take the codebook from the body, reach the helipad under the cliff |
| 04 | NIGHTINGALE | the outpost, snowfall at dusk | take the keycard from HQ, the detention block door opens when you reach it, cut the pilot loose, bring him to the ledge south-west of the wire. He follows you, crouches when you do, and guards can see him. |

Ratings: GHOST (never spotted, no kills), SHADOW (never spotted), OPERATIVE (spotted once or twice), SOLDIER.

The compound: the west gate is the front door, the quiet way in is a cut in the south wire (and, in Blackout, a cut in the north wire). The outpost sits on a shelf between a rock wall (north) and a drop into the valley (south): open ground and boulders to the west, a tower over it, the wire around HQ, the radome, a dish, barracks, fuel, and the cells. Ways in: the gate on the road, a collapsed panel on the west, a culvert under the south wire, a rockfall on the north run.

## Controls
| Action | Desktop | Phone (landscape) |
|---|---|---|
| Move | WASD / arrows | left stick |
| Look | mouse (pointer lock; click the view) | drag on the right half, or drag from FIRE / SCOPE |
| Fire | left click / Space | FIRE |
| Scope (about 5x) | hold right click, or V to toggle | SCOPE (toggle) |
| Crouch | C or Ctrl (toggle) | CROUCH (toggle) |
| Sprint | Shift | none |
| Reload | R | RELOAD |
| Use (hack, plant, take, free) | hold E | hold USE |

## How the guards work
The sim lives between the `// ---------- SIM ----------` and `// ---------- UI ----------` markers. It is pure, driven by `step(state, input, dt)` with a seeded rng. The renderer builds its meshes from the same box list the sim uses for sight, bullets and collision.

- **Sight**: 44 m range (60 m from the towers), a 120-degree cone, and a 3D line of sight from the guard's eye to your head or chest through every sight-blocking box. Chain-link fence does not block sight or bullets. Walls, crates and brush do. Brush only hides you when you crouch.
- **Suspicion** fills at 2.6 × visibility × a distance curve, minus a 0.05/s floor of doubt. Visibility is light × stance × motion, so lamp pools, standing and sprinting all count against you. A guard who has noticed you turns to look (?), then walks over to check. When he is sure (!), he shouts. Every guard within 28 m comes, but they do not shout on.
- **Combat**: 3–5 round bursts, fired as hitscan rays with angular error. The error grows with your speed and is worst in the first 2 s after a guard acquires you, so range and movement both protect you. Guards take cover behind crates, peek to shoot, reload behind it, advance when you are far, and search your last known position once they lose you for 6 s. Gunshots are heard at 45 m.
- **You**: 100 health, which comes back at 4/s after 7 s without being hit. There are three medkits (+50 each). A head shot kills (100), a body shot does 40, and a leg shot 25. You get a 30-round magazine and 120 spare rounds.

## Missions in code
A mission is data in the sim (`MISSIONS`): id, name, briefing, map and map options, light preset and the ambient level the guards see by, garrison, objective chain, start, medkits, and a `setup` hook for props only it has. `buildMission(m)` builds the level; `buildLevel()` is mission 1, identical to the old single level. Objectives are an ordered list driven by the sim (`updateObjective`, `tickMission`): `hack`, `plant`, `eliminate`, `pickup` (optionally from a guard's body, optionally unlocking a door), `rescue`, `extract` (optionally with the captive). Only the current one can be done. The HUD line, compass marker and minimap marker all follow `objectivePos` of the current one.

The renderer rebuilds the world when the mission changes (`loadMission`): terrain, merged buckets, lamps, props, guard views. The old world's geometry is disposed; materials and textures are shared and built once; the point lights are a fixed pool, so switching never recompiles shaders. Switching the four missions three times over leaves geometries, textures and programs at the same counts.

## Tests
`node test/missions.js` checks, for every mission: every objective point (every waypoint of a named target) and the LZ are reachable on the nav grid from the start; a scripted player walking the chain in order completes it; nothing can be done out of order. Then charges (blast, hearing, the deadline, the LZ waiting for the bang), identifying through the scope, the keycard door (locked, opens with the card, locked again on retry), a captive who catches up after 25 random jumps of 12-30 m, and that night is darker to the guards than dusk, and dusk than dawn.

`node test/bots.js` (a report, not a test) runs the rush and sneak bots on every mission.

`node test/sim.js` covers:
- detection time by distance, stance, light and speed
- cover, walls and fence
- guard hit rate by range and movement
- alarm radius, head vs body damage, hearing, search
- the objective and extraction
- a seeded run of a scripted "rush in shooting" player against a scripted "sneak" player

`node test/touch.js` checks that the pad's key codes are read by the game and that the shared snippets are byte-identical to tetris's copy.

## Known weak spots (prototype)
- Guards are box-built and the animation is procedural: walk, run, aim, crouch-peek, hit flinch and death fall. There is no ragdoll and no animation blending beyond lerps.
- Lighting is per-vertex Lambert; the sun casts shadows on desktop only.
- The sim's ground is flat: the mountain is scenery beyond the plateau's edges, not terrain you climb.
- The captive cannot be shot, and guards do not shoot at him; a guard who sees him only becomes suspicious.
- The scripted sneak player still gets spotted about four times a run. That is either a naive bot or detection that is too sharp. Play it and judge.
