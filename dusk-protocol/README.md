# Dusk Protocol

A prototype first-person infiltration shooter in the mould of Project I.G.I.: one operative, one guarded compound at dusk, get in, hack a terminal, get out. A single `index.html` with Three.js r128 inlined. Every texture is drawn on a canvas at load, and every sound is synthesised. The only optional network fetch is the Chakra Petch font, which falls back to the system UI font. Works from disk and offline.

## The mission
Start in the woods south of the wire. The command post terminal is inside. Hold **E** (or **USE**) at it for 3 seconds to upload, then reach the landing zone west of the gate. You fail if you die. The west gate is the front door. The quiet way in is a cut in the south wire, with brush on the approach.

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
| Hack | hold E | hold USE |

## How the guards work
The sim lives between the `// ---------- SIM ----------` and `// ---------- UI ----------` markers. It is pure, driven by `step(state, input, dt)` with a seeded rng. The renderer builds its meshes from the same box list the sim uses for sight, bullets and collision.

- **Sight**: 44 m range (60 m from the towers), a 120-degree cone, and a 3D line of sight from the guard's eye to your head or chest through every sight-blocking box. Chain-link fence does not block sight or bullets. Walls, crates and brush do. Brush only hides you when you crouch.
- **Suspicion** fills at 2.6 × visibility × a distance curve, minus a 0.05/s floor of doubt. Visibility is light × stance × motion, so lamp pools, standing and sprinting all count against you. A guard who has noticed you turns to look (?), then walks over to check. When he is sure (!), he shouts. Every guard within 28 m comes, but they do not shout on.
- **Combat**: 3–5 round bursts, fired as hitscan rays with angular error. The error grows with your speed and is worst in the first 2 s after a guard acquires you, so range and movement both protect you. Guards take cover behind crates, peek to shoot, reload behind it, advance when you are far, and search your last known position once they lose you for 6 s. Gunshots are heard at 45 m.
- **You**: 100 health, which comes back at 4/s after 7 s without being hit. There are three medkits (+50 each). A head shot kills (100), a body shot does 40, and a leg shot 25. You get a 30-round magazine and 120 spare rounds.

## Tests
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
- Lighting is per-vertex Lambert. There are no shadows, and inside the buildings is as lit as outside.
- There is no sprint on the phone, and no aim assist. Aiming with a thumb is the part to judge.
- The scripted sneak player still gets spotted about four times a run. That is either a naive bot or detection that is too sharp. Play it and judge.
