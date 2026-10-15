// Model types shared by the engine and the UI.
import type { Vector3 } from 'three';

export interface Hole {
  dowel: number;
  /** position along the pole, 0 at end A, 1 at end B */
  t: number;
  /** distance from end A, m */
  pos: number;
  /** rotation around the pole from the reference mark, degrees */
  ang: number;
  /** angle between hole and pole axis, degrees */
  tilt: number;
  /** the pole on the other end of the dowel */
  other: number;
}

export interface Pole {
  id: number;
  /** end A (the lower end once grounded) */
  a: Vector3;
  b: Vector3;
  dir: Vector3;
  len: number;
  /** diameter, mm */
  dia: number;
  /** radius, m */
  r: number;
  tint: number;
  grounded: boolean;
  holes: Hole[];
  /** reference mark (0°) perpendicular to the axis, and the third axis of the pole frame */
  ref: Vector3;
  w: Vector3;
}

export interface Dowel {
  id: number;
  pi: number;
  pj: number;
  ti: number;
  tj: number;
  gap: number;
  tilt: number;
  len: number;
  r: number;
}

export interface Model {
  poles: Pole[];
  dowels: Dowel[];
}

export interface Stroke {
  pts: Vector3[];
  /** guide curves can be extruded along an axis so they act through the depth of the volume */
  extrude: 'z' | 'y' | null;
}

/** Greyscale image projected onto a plane of the field. */
export interface FieldImage {
  lum: Float32Array;
  w: number;
  h: number;
  plane: 'xy' | 'xz';
}
