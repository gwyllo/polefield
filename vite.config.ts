import { defineConfig } from 'vitest/config';

export default defineConfig({
  // relative asset paths so the build works under any GitHub Pages sub-path
  base: './',
  // three.js alone is ~600 kB minified; the app is a single page, so one chunk is fine
  build: { chunkSizeWarningLimit: 800 },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
