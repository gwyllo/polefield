import { describe, expect, it } from 'vitest';
import { createField, recomputeField, setupField } from '../src/engine/field';
import { generate } from '../src/engine/generate';
import { defaultParams } from '../src/engine/params';

function trussModel() {
  const P = defaultParams(), F = createField();
  setupField(F, 'truss', P); recomputeField(F, P, [], null);
  return generate(F, P);
}

describe('generate', () => {
  it('builds the Spanning truss deterministically for seed 7', () => {
    const P = defaultParams();
    expect(P.preset).toBe('truss');
    expect(P.seed).toBe(7);
    const g = trussModel();
    expect(g.poles.length).toBe(1988);
    expect(g.dowels.length).toBe(3532);
    expect(g.pruned).toBe(12);
  });

  it('gives the same model on every run', () => {
    const a = trussModel(), b = trussModel();
    expect(b.poles.map(p => p.a.toArray())).toEqual(a.poles.map(p => p.a.toArray()));
    expect(b.dowels.map(d => [d.pi, d.pj])).toEqual(a.dowels.map(d => [d.pi, d.pj]));
  });
});
