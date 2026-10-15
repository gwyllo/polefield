# Polefield

A browser mockup of a design tool for structures made from straight round timber poles joined by spanning dowels or threaded rods, in the style of the [Fologram Broomstick Truss](https://docs.fologram.com/ede852509d3b4d4c926f57594c237530#Broomstick_Truss). Parts are pre-drilled and assembled with HoloLens guidance, so the tool covers design, structural checks, assembly sequencing and drill schedules.

It is a single self-contained `index.html` (three.js r128 loads from a CDN). Open it in a browser, or serve the folder with any static server:

```bash
python -m http.server 8000
```

## Modes

- **Field**: paint forces into a 3D vector field with ZBrush-style brushes (Direction, Attract, Repel, Twist, Smooth, Erase) on a movable brush plane. Paint scalar properties (density, pole length, diameter, tint). Sketch guide curves, or import SVG curves and images to drive the field.
- **Poles**: around 2,000 poles are seeded where density is high, aligned to the flow, crossed by a weave angle and doweled to neighbours within a maximum gap. Poles left with fewer than two dowels are removed.
- **Pattern**: generative grooves derived from proximity between poles in space (halos, territory edges, interference fringes), so lines carry from pole to pole.
- **Analyse**: on-demand linear 3D frame analysis under self-weight. Poles are rigid bodies; dowels and pole bases are beam elements; pole bending stress is recovered from joint forces. Block sparse Cholesky with nested-dissection ordering solves ~2,000 poles in under a second.
- **Assemble**: staged assembly sequence, re-analysing the standing structure after each stage, with deflection and stress limits and optional temporary supports.
- **Fabricate**: per-pole unrolled drawing, drill schedule (distance from base, rotation, tilt), cut list, CSV/JSON export to the clipboard.

## Limitations

This is a mockup for feedback. Structural results are indicative: joint stiffness is approximate, pole bending is not included in deflections, and bearing at holes and section loss are not checked. There is no Fologram/HoloLens export.
