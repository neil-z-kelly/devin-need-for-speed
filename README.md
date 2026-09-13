# Devin Need for Speed

A browser-based, third-person circuit racing game inspired by Need for Speed, built to demonstrate how Devin can contribute to game development.

Stack: TypeScript, Three.js (WebGL2), Rapier physics (raycast vehicle controller), Vite, React for menus and HUD only.

## Run

Requires Node 22 (see `.nvmrc`) and pnpm.

```bash
pnpm install
pnpm run dev        # http://localhost:5173
pnpm run build      # production build in dist/
pnpm run preview    # serve dist/ on http://localhost:4173
pnpm run check      # typecheck + lint + tests
```

Any browser with WebGL2. WebGPU is not used.

## Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Throttle | W / Up | Right trigger |
| Brake / reverse | S / Down | Left trigger |
| Steer | A, D / Left, Right | Left stick |
| Handbrake | Space | A / Cross |
| Nitrous | Shift | X / Square |
| Reset car | R | Y / Triangle |
| Camera | C | Right bumper |
| Pause | Esc / P | Start |

## Graphics quality and performance

Quality is stored in `localStorage` and can be forced per page load with `?quality=low|medium|high|ultra`.
On a software rasterizer (SwiftShader, llvmpipe) the first launch defaults to `low`.
Frame telemetry is exposed on `window.__nfsPerf.snapshot()` (fps, frame time, worst 1 percent, draw calls, triangles, GPU string).

Measured on a Devin VM with no GPU (SwiftShader CPU rasterizer, 8 cores, 1280x720 viewport), driving the opening downtown straight:

| Quality | Resolution | FPS | Frame ms | Draw calls | Triangles |
| --- | --- | --- | --- | --- | --- |
| low | 844x475 | 4.8 | 210 | 62 | 390k |
| medium | 1280x720 | 0.8 | 1220 | 117 | 753k |
| high | 1280x720 | 1.2 | 836 | 131 | 754k |

These numbers describe a CPU emulating a GPU and are not representative of any real graphics card. Simulation runs at a fixed 60 Hz regardless of render rate.

## Assets

- `public/assets/car/ferrari.glb`: Ferrari 458 Italia by vicent091036, from the three.js examples, CC BY 4.0. The original Sketchfab page could not be reached from the build environment to re-verify the license text.
- `public/assets/env/venice_sunset_1k.hdr`: Venice Sunset HDRI from the three.js examples (Poly Haven, CC0).
- `public/assets/draco/`: Draco decoder from the three.js distribution (Apache 2.0).
- `public/assets/fonts/`: Barlow and Chakra Petch (SIL Open Font License).
- Road, facade, concrete and water textures are generated procedurally at startup.
