---
name: race-ui-testing
description: Interactive desktop validation of Harbor Circuit race controls, checkpoint-assisted results, and persistence on software-rendered VMs.
---

# Harbor Circuit UI testing

## Environment
- The local Vite game has no authentication. Check http://localhost:5173/ before starting another server.
- On a VM without a GPU, open `http://localhost:5173/?quality=low`; actual SwiftShader FPS depends strongly on viewport and preset.
- Low's half-resolution rendering is viewport-relative, not fixed 640x360. For a 640x360 reference at devicePixelRatio 1, use a 1280x720 desktop and fullscreen Chrome; verify the canvas width/height and include them with performance claims.
- Maximize Chrome with `wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz` before recording.
- When changing desktop resolution, screenshot coordinates may use stale scaling. Native `xdotool mousemove X Y click 1` uses actual display pixels; check screenshot dimensions before translating coordinates.
- If URL keyboard shortcuts get intercepted while the game is fullscreen, exit fullscreen with F11, click the address bar, navigate, then restore fullscreen after loading.
- Use real held keyboard inputs, not instantaneous presses, for driving. Tool-call delays allow the car to coast or stop; group consecutive throttle/steering holds when demonstrating a corner.
- HUD speed is unsigned: reverse is identified by gear R and backward movement, not necessarily a negative number.

## Results without a naturally driven full lap
- Get approval to use the position-only `window.__nfsTeleport(s)` helper. Label evidence **teleport-assisted**, never a naturally completed lap.
- RaceRules requires all ordered checkpoints. Teleporting near the finish alone does not complete a fresh lap.
- Track length and checkpoint positions are available by importing `/src/track/track.ts` in the browser and constructing `new Track(HARBOR_CIRCUIT)`.
- Start a 1-lap race, cross checkpoint 0, then teleport roughly 25 metres before each subsequent checkpoint and hold W to cross. Verify track progress using the read-only `window.__nfsDrive()` because hills and slow rendering can require longer holds.
- Finally teleport 40 metres before the finish and drive over the line. Validate six standings, total, lap time, RETRY, MAIN MENU and reload persistence.
- Assisted runs write real local best times. Disclose that the saved record is assisted; do not present it as a driving benchmark.

## Evidence cautions
- Compare car mesh variants (full vs decimated LOD) at the same camera and position; include uncropped originals as well as labelled close crops. A decimated mesh can keep the silhouette while rear panels and diffuser details show visible damage.
- A/D must be checked independently from high-speed understeer: from a straight road, A should turn left and D right, with R restoring alignment.
- The first corner after the start straight (s 300 to 430) is a left-hander. To measure understeer, teleport to s=60, hold W to about 115 km/h, hold A from s=280 and log `window.__nfsDrive()`: positive `lateral` growing while `headingError` stays positive means the car is pushing wide to the outside.
- Handbrake actuation alone does not prove a rear slide. Mark ambiguous low-FPS handling observations inconclusive.
- Automatic recording edits may compress `hold_key` driving into a very short summary. Inspect output duration; preserve or export full raw footage when continuous driving is important.
- Use screenshots or source recording frames to verify transient 3, 2, 1 and GO states.
- Audio output and gamepad require actual measurable output/controller hardware; don't infer them from UI state.

## Devin Secrets Needed
None for the local game.
