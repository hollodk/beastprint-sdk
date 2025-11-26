import { defineConfig } from 'tsup';

export default defineConfig([
  // Library bundle (ESM + CJS)
  {
    entry: {
      index: 'src/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
  },
  // Browser-global bundle (attaches window.beastprint)
  {
    entry: {
      'beastprint.global': 'src/global.ts',
    },
    format: ['iife'],
    globalName: 'beastprintGlobal',
    sourcemap: true,
    minify: true,
  },
]);
