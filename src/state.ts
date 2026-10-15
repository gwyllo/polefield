// App state: parameters, the field, the model and UI selection.
import { defaultParams, type Channel } from './engine/params';
import { createField } from './engine/field';
import type { AnalysisResult } from './engine/fea';
import type { Assembly } from './engine/assembly';
import type { Dowel, FieldImage, Pole, Stroke } from './engine/types';

export type Mode = 'field' | 'poles' | 'pattern' | 'analyse' | 'assemble' | 'fab';
export type ToolId = 'nav' | 'comb' | 'attract' | 'repel' | 'twist' | 'smooth' | 'erase' | 'scalar' | 'sketch';

export interface AppImage extends FieldImage { canvas: HTMLCanvasElement; name: string }
export interface UndoEntry { paint: Float32Array; ch: Record<Channel, Float32Array>; strokes: Stroke[] }

export const P = defaultParams();
export const F = createField();

export const S = {
  poles: [] as Pole[],
  dowels: [] as Dowel[],
  /** proximity neighbours per pole, for the groove pattern */
  nbr: [] as number[][],
  strokes: [] as Stroke[],
  image: null as AppImage | null,
  undo: [] as UndoEntry[],
  mode: 'field' as Mode,
  tool: 'nav' as ToolId,
  selected: -1,
  res: null as AnalysisResult | null,
  asm: null as Assembly | null,
  asmStep: 0,
  playing: false,
  pruned: 0,
  genMs: 0,
};
