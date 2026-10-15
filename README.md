# Polefield

A browser mockup of a design tool for structures made from straight round timber poles joined by spanning dowels or threaded rods, in the style of the [Fologram Broomstick Truss](https://docs.fologram.com/ede852509d3b4d4c926f57594c237530#Broomstick_Truss). Parts are pre-drilled and assembled with HoloLens guidance, so the tool covers design, structural checks, assembly sequencing and drill schedules.

Live build: <https://gwyllo.github.io/polefield/> (deployed by GitHub Actions from `main`).

## Development

Vite + TypeScript, with three.js from npm. Node 22 or later.

```bash
npm install
npm run dev       # dev server with hot reload at http://localhost:5173
npm test          # Vitest: solver, FEA and generator tests
npm run build     # type-check (tsc) and bundle into dist/
npm run preview   # serve dist/ locally
```

In dev builds, `window.polefield` exposes the app state (`S`, `P`), `scene`, `renderer` and `camera` for poking at from the console.

Pushes to `main` run the tests, build and deploy to GitHub Pages (`.github/workflows/pages.yml`); pull requests run the tests and build only.

## Project structure

The code is split into layers that only import downwards: `ui` and `interaction` → `controller` → `render` → `engine`. UI refreshes travel back up through the event bus in `src/events.ts`.

```
index.html                      page markup; loads src/main.ts
src/main.ts                     boot, theming, resize, render loop
src/styles.css                  theme tokens (light/dark) and layout
src/state.ts                    app state: parameters (P), field (F), model and selection (S)
src/events.ts                   small typed event bus for UI refreshes (panel, status, timeline, toast...)
src/controller.ts               app actions: load preset, rebuild, run FEA, run assembly, set mode/tool, undo

src/engine/                     pure maths: no DOM, no three.js scene (only Vector3), so it can run
                                in a Web Worker and is unit tested
  params.ts                     parameter defaults, presets, timber/connector tables
  types.ts                      Pole, Dowel, Hole, Stroke, FieldImage
  math.ts                       clamp, lerp, seeded PRNG
  field.ts                      3D vector field grid, base flow, layer sum, trilinear sampling
  sketch.ts                     sketch strokes and imported images as field guides
  brush.ts                      field brushes (direction, attract, twist, smooth, erase, property paint)
  geometry.ts                   segment distances, spatial hash of pole pairs, connected components
  generate.ts                   pole seeding, relaxation, grounding, dowel joints, pruning
  fea.ts                        rigid-body frame model, block sparse Cholesky solver
  assembly.ts                   assembly ordering strategies and stage breaks
  patterns.ts                   proximity neighbours and groove maths (CPU mirror of the shader)
  export.ts                     pole names, drill schedule CSV, model JSON

src/render/                     three.js scene, kept imperative (2,000 poles are one merged mesh)
  scene.ts                      renderer, camera, controls, lights, ground, scene groups
  pole-material.ts              merged pole shader: proximity grooves, assembly staging
  field-viz.ts                  field arrows, property points, bounds, brush plane, overlays
  brush.ts                      brush plane placement and cursor, pointer rays
  meshes.ts                     merged pole mesh and instanced dowels/base plates
  display.ts                    colouring, deformed shape, legend, pattern uniforms

src/interaction/painting.ts     pointer input: brushes, sketching, picking
src/ui/                         DOM: chrome (rail, tabs, HUD, shortcuts), panels, timeline,
                                status/progress/toasts, import, unrolled pole drawing
test/                           Vitest tests, including a check that src/engine stays DOM-free
```

Colours are authored as sRGB hex and were tuned on three r128, so `src/render/scene.ts` turns colour management off, writes linear output and scales the light intensities to keep the old look.

## Modes

- **Field**: paint forces into a 3D vector field with ZBrush-style brushes (Direction, Attract, Repel, Twist, Smooth, Erase) on a movable brush plane. Paint scalar properties (density, pole length, diameter, tint). Sketch guide curves, or import SVG curves and images to drive the field.
- **Poles**: around 2,000 poles are seeded where density is high, aligned to the flow, crossed by a weave angle and doweled to neighbours within a maximum gap. Poles left with fewer than two dowels are removed.
- **Pattern**: generative grooves derived from proximity between poles in space (halos, territory edges, interference fringes), so lines carry from pole to pole.
- **Analyse**: on-demand linear 3D frame analysis under self-weight. Poles are rigid bodies; dowels and pole bases are beam elements; pole bending stress is recovered from joint forces. Block sparse Cholesky with nested-dissection ordering solves ~2,000 poles in under a second.
- **Assemble**: staged assembly sequence, re-analysing the standing structure after each stage, with deflection and stress limits and optional temporary supports.
- **Fabricate**: per-pole unrolled drawing, drill schedule (distance from base, rotation, tilt), cut list, CSV/JSON export to the clipboard.

## Limitations

This is a mockup for feedback. Structural results are indicative: joint stiffness is approximate, pole bending is not included in deflections, and bearing at holes and section loss are not checked. There is no Fologram/HoloLens export.
