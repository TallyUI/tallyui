import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  // The dts bundle drops the /// <reference> in src/index.ts, so the className augmentation is loaded here.
  dts: { banner: '/// <reference path="../src/uniwind-env.d.ts" />' },
  external: ['react', 'react-native', 'zustand', '@tanstack/react-table'],
});
