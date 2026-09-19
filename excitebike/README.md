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

## Tests

`node test/sim.js` runs 43 checks against the pure engine, pulled out of `index.html` with node's `vm`. The physics step takes `dt` as an argument and the track takes a seed, so every scenario is set up directly rather than waited for: the stall timer, a level landing staying on the bike and counting clean, crossing the finish line, the same seed building the same track and a different one building another, every generated feature sitting in a real lane, and clipping a rival from behind throwing you off.

**Not yet covered:** a bot holding turbo permanently should lose to one that manages heat, and that comparison is the real proof the economy is tuned rather than merely implemented. The constants say it cannot be gamed — permanent turbo stalls in under four seconds — but that is arithmetic, not a measurement. It is the first thing to add here.
