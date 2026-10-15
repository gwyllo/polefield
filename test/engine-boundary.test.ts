// The engine must stay free of the DOM and of three's scene graph so it can run in a Web Worker.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = join(import.meta.dirname, '../src/engine');
const files = readdirSync(dir).filter(f => f.endsWith('.ts'));

describe('src/engine', () => {
  it.each(files)('%s imports only engine modules and three maths', f => {
    const src = readFileSync(join(dir, f), 'utf8');
    for (const [, clause, spec] of src.matchAll(/^import\s+([\s\S]*?)\s+from\s+'([^']+)'/gm)) {
      if (spec === 'three') expect(clause, `${f}: only Vector3 from three`).toMatch(/^(type\s+)?\{\s*(type\s+)?Vector3\s*\}$/);
      else expect(spec, `${f} imports ${spec}`).toMatch(/^\.\/[\w-]+$/);
    }
    expect(src, `${f} touches the DOM`).not.toMatch(/\b(document|window|navigator|HTMLElement|requestAnimationFrame)\b/);
  });
});
