# Polefield

A browser mockup of a design tool for structures made from straight round timber poles joined by spanning dowels or threaded rods, in the style of the [Fologram Broomstick Truss](https://docs.fologram.com/ede852509d3b4d4c926f57594c237530#Broomstick_Truss). Parts are pre-drilled and assembled with HoloLens guidance, so the tool covers design, structural checks, assembly sequencing and drill schedules.

There is no build step. three.js r128 loads from a CDN; open `index.html` directly in a browser, or serve the folder with any static server:

```bash
python -m http.server 8000
```

## Project structure

```
index.html                      page markup; loads the scripts below in order
css/styles.css                  theme tokens (light/dark) and layout
js/core/util.js                 DOM, math and colour-token helpers
js/core/config.js               parameters, presets, timber/connector tables, app state
js/field/field.js               3D vector field grid, base flow, painted forces, sampling
js/field/sketch-input.js        sketch strokes and imported images as field guides
js/render/scene.js              renderer, camera, lights, ground, scene groups
js/render/pole-material.js      merged pole shader: proximity grooves, assembly staging
js/render/field-viz.js          field arrows, property points, brush plane, overlays
js/model/generate.js            pole seeding, relaxation, grounding, dowel joints
js/render/meshes.js             merged pole mesh and instanced dowels/base plates
js/analysis/fea.js              rigid-body frame model, block sparse Cholesky solver
js/render/display.js            colouring, deformed shape, legend, pattern uniforms
js/interaction/painting.js      brushes, sketching, picking, rebuilds
js/analysis/assembly.js         running FEA, assembly ordering, staged simulation, chart
js/fabrication/fabrication.js   pole naming, groove maths, unrolled pole drawing
js/ui/chrome.js                 tool rail, mode tabs, HUD, shortcuts, toasts
js/ui/panels.js                 inspector panels, parameter binding, CSV/JSON export
js/ui/import.js                 example sketch, SVG and image import
js/main.js                      camera framing, resize, theming, render loop, boot
```

The scripts are plain (non-module) scripts that share one global scope, so they keep working when `index.html` is opened from disk. Load order in `index.html` matters: a file may only run top-level code against things defined in files above it, though functions can call anything once the page has booted.

## Modes

- **Field**: paint forces into a 3D vector field with ZBrush-style brushes (Direction, Attract, Repel, Twist, Smooth, Erase) on a movable brush plane. Paint scalar properties (density, pole length, diameter, tint). Sketch guide curves, or import SVG curves and images to drive the field.
- **Poles**: around 2,000 poles are seeded where density is high, aligned to the flow, crossed by a weave angle and doweled to neighbours within a maximum gap. Poles left with fewer than two dowels are removed.
- **Pattern**: generative grooves derived from proximity between poles in space (halos, territory edges, interference fringes), so lines carry from pole to pole.
- **Analyse**: on-demand linear 3D frame analysis under self-weight. Poles are rigid bodies; dowels and pole bases are beam elements; pole bending stress is recovered from joint forces. Block sparse Cholesky with nested-dissection ordering solves ~2,000 poles in under a second.
- **Assemble**: staged assembly sequence, re-analysing the standing structure after each stage, with deflection and stress limits and optional temporary supports.
- **Fabricate**: per-pole unrolled drawing, drill schedule (distance from base, rotation, tilt), cut list, CSV/JSON export to the clipboard.

## Limitations

This is a mockup for feedback. Structural results are indicative: joint stiffness is approximate, pole bending is not included in deflections, and bearing at holes and section loss are not checked. There is no Fologram/HoloLens export.
