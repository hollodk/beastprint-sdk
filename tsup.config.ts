import { defineConfig } from 'tsup';

export default defineConfig([
  // ESM bundle -> dist/index.esm.js
  {
    entry: {
      'index.esm': 'src/index.ts',
    },
    format: ['esm'],
    dts: {
      entry: 'src/index.ts',
    },
    sourcemap: true,
    clean: true,
  },
  // CJS bundle -> dist/index.cjs
  {
    entry: {
      index: 'src/index.ts',
    },
    format: ['cjs'],
    sourcemap: true,
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
