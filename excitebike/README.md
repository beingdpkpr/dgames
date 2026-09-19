# Excitebike

Side-on motocross in one file, after the 1984 NES original. Open `index.html` directly; no dependencies, no build step.

Two mechanics carry the whole game, and both are the reason it is remembered rather than a list of features.

## The turbo economy

There are two accelerations. Normal is safe. **Turbo is faster and heats the engine** — `HEAT_RATE` 0.28 a second going up against `COOL_RATE` 0.12 coming back down, so holding it is never a strategy: the gauge fills in under four seconds and takes more than eight to clear on its own. Max it out and the engine **stalls**, the bike coasts, and you lose the time.

The release valve is the **blue arrow strips** laid into the track, which dump all the heat the instant you ride over one. That is the loop: spend heat, then get to the next arrow before the gauge tops out. A readout above the temperature bar names the distance and lane of the next one, because the decision the game turns on should not require counting dirt.

## The mid-air lean

Up and Down move you between the four lanes while your wheels are on the ground, and **rotate the bike in the air**. Land with the wheels roughly level and you keep your speed. Land nose-high or nose-low and you lose it or come off. A jump is a decision, not a cutscene, and this is the whole skill ceiling.

## Controls

| | |
|---|---|
| Accelerate | Z, or X for turbo |
| Lanes | Up / Down, wheels on the dirt |
| Lean | Up / Down, in the air |

On a touch screen: lane up/down under the left thumb, GAS and TURBO under the right. The track is 16:9, so portrait squeezes it into about a quarter of the screen and a prompt asks you to turn the phone.

## Modes

**Time trial** against a target time, and **race the pack** against rivals you can collide with — clip one from behind and you are thrown off and have to remount, which costs real seconds.

Also on the track: ramps of varying steepness, moguls that bounce you, and soft dirt that saps speed.

## High scores

A top-ten table of lap times per mode, ascending because lower is better, stored at `dgames.hiscores.excitebike` under the player name shared across every game.

## What moves

The first version drew a correct picture of a static object. `ctx.rotate` was called once in the whole
file — the in-air pitch — there were no particles, and the wheels were concentric circles, which are
rotationally symmetric and so could not have shown rotation even if something had turned them. At a
displayed 103 mph nothing on the bike moved.

Now: the wheels roll at `distance / 0.32 m`, so the spokes turn at the speed you are actually doing; the
suspension is a spring that compresses on landing by how hard you hit and extends in the air; the rider
crouches over the bars on the hot throttle, sits up coasting and shifts back over a jump; the rear wheel
throws dirt, more of it under turbo and a burst on touchdown; a crash throws the rider clear on a
ballistic arc to tumble and slide, with the bike left on its side; and a landing shakes the camera.

Animation state lives in a separate `fx` object, never on `g.bike`, so the headless tests see exactly
the model they saw before. `prefers-reduced-motion` cuts the particle budget and disables the shake.
Measured cost with particles live: 16.7 ms median a frame, 18.5 ms at the 95th percentile.

## Tests

`node test/sim.js` runs 43 checks against the pure engine, pulled out of `index.html` with node's `vm`. The physics step takes `dt` as an argument and the track takes a seed, so every scenario is set up directly rather than waited for: the stall timer, a level landing staying on the bike and counting clean, crossing the finish line, the same seed building the same track and a different one building another, every generated feature sitting in a real lane, and clipping a rival from behind throwing you off.

**Not yet covered:** a bot holding turbo permanently should lose to one that manages heat, and that comparison is the real proof the economy is tuned rather than merely implemented. The constants say it cannot be gamed — permanent turbo stalls in under four seconds — but that is arithmetic, not a measurement. It is the first thing to add here.
