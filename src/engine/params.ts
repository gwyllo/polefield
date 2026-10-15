// Parameters, presets and timber/connector tables.

export type PresetKey = 'arch' | 'tower' | 'truss' | 'blank';
export type WeaveAxis = 'lateral' | 'inplane';
export type Channel = 'density' | 'length' | 'diameter' | 'tint';
export type PatType = 'halo' | 'cells' | 'fringe' | 'mix';
export type Strategy = 'greedy' | 'bottom' | 'sweep' | 'random' | 'custom';

export function defaultParams() {
  return {
    preset: 'truss' as PresetKey, baseStrength: 1, noise: 0.25,
    radius: 1.0, strength: 0.6, planeMode: 'view' as 'view' | 'h', planeH: 1.4, planeD: 0,
    channel: 'density' as Channel, showChannel: 'none' as Channel | 'none', arrows: true, arrowLen: 0.2,
    sketchW: 1.4, sketchR: 0.5, imgW: 1.2, imgMode: 'both' as 'both' | 'contour' | 'density', imgPlane: 'xy' as 'xy' | 'xz',
    count: 2000, seed: 7, lenMin: 0.4, lenMax: 0.9, diaMin: 25, diaMax: 38, stock: true,
    weave: 28, weaveAxis: 'lateral' as WeaveAxis, spacing: 0.12, prune: true, snap: 0.2,
    reach: 300, maxJ: 6, holeSpace: 70, endDist: 60, dowel: 'm10' as DowelKey, clear: 25,
    colorBy: 'timber' as 'timber' | 'length' | 'diameter' | 'connect' | 'order', woodA: '#e3cc9b', woodB: '#7d522e',
    patOn: true, patType: 'mix' as PatType, patRange: 200, patSpacing: 30, patWidth: 3, patTaper: true, patPhase: 0,
    grade: 'ash' as GradeKey, support: 'fixed' as 'fixed' | 'pinned', clamp: 50, loadFactor: 1.35, pointLoad: 0, defScale: 1,
    resultColor: 'util' as 'util' | 'disp',
    strategy: 'greedy' as Strategy, stages: 30, limitDisp: 15, limitUtil: 100, props: false, ghosts: true, live: true, autoFea: false,
  };
}
export type Params = ReturnType<typeof defaultParams>;

type Fn3<T> = (x: number, y: number, z: number) => T;
export interface Preset {
  label: string;
  min: [number, number, number];
  max: [number, number, number];
  weave: number;
  weaveAxis: WeaveAxis;
  base: Fn3<[number, number, number]>;
  dens: Fn3<number>;
  diam?: Fn3<number>;
}

export const PRESETS: Record<PresetKey, Preset> = {
  arch: {
    label: 'Arch canopy', min: [-5.4, 0, -1.4], max: [5.4, 5.6, 1.4], weave: 24, weaveAxis: 'lateral',
    base: (x, y) => { const r = Math.hypot(x, y) + 1e-3, R0 = 4.3, k = 0.7 * (R0 - r); return [-y / r + k * x / r, x / r + k * y / r, 0]; },
    dens: (x, y) => { const r = Math.hypot(x, y); return Math.exp(-Math.pow((r - 4.3) / 0.7, 2)) * 0.95 + 0.03; },
    diam: (_x, y) => 1 - y / 3.5,
  },
  tower: {
    label: 'Twisting column', min: [-2.6, 0, -2.6], max: [2.6, 7.5, 2.6], weave: 32, weaveAxis: 'inplane',
    base: (x, _y, z) => [-z * 0.5, 1, x * 0.5],
    dens: (x, _y, z) => { const r = Math.hypot(x, z); return Math.exp(-Math.pow((r - 2.0) / 0.5, 2)) * 0.95 + 0.03; },
    diam: (_x, y) => 1 - y / 5,
  },
  truss: {
    label: 'Spanning truss', min: [-7, 0, -0.7], max: [7, 2.6, 0.7], weave: 38, weaveAxis: 'inplane',
    base: (x) => [1, 0.25 * Math.sin(x * 0.6), 0], dens: () => 0.85, diam: (_x, y) => 1 - y / 1.6,
  },
  blank: {
    label: 'Empty volume', min: [-2.5, 0, -2.5], max: [2.5, 4.5, 2.5], weave: 28, weaveAxis: 'lateral',
    base: () => [0, 1, 0], dens: () => 0.6,
  },
};

export interface Grade { label: string; E: number; G: number; rho: number; fm: number }
export type GradeKey = 'ash' | 'pine' | 'oak';
export const GRADES: Record<GradeKey, Grade> = {
  ash: { label: 'Ash broom handle', E: 12e9, G: 0.75e9, rho: 680, fm: 14e6 },
  pine: { label: 'Pine dowel, C24', E: 11e9, G: 0.69e9, rho: 470, fm: 11e6 },
  oak: { label: 'Oak, D30', E: 11e9, G: 0.69e9, rho: 720, fm: 13e6 },
};

export interface DowelSpec { label: string; d: number; hole: number; E: number; G: number; rho: number; fy: number }
export type DowelKey = 'm8' | 'm10' | 'hw12';
export const DOWELS: Record<DowelKey, DowelSpec> = {
  m8: { label: 'M8 threaded rod', d: 0.0068, hole: 9, E: 200e9, G: 77e9, rho: 7850, fy: 240e6 },
  m10: { label: 'M10 threaded rod', d: 0.0085, hole: 11, E: 200e9, G: 77e9, rho: 7850, fy: 240e6 },
  hw12: { label: '12 mm hardwood dowel', d: 0.012, hole: 12, E: 12e9, G: 0.75e9, rho: 700, fy: 20e6 },
};

export const STOCK_DIA = [22, 25, 28, 32, 38, 45];
export const CHANNELS: Record<Channel, string> = { density: 'Density', length: 'Pole length', diameter: 'Pole diameter', tint: 'Tint' };
