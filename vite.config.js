import { defineConfig } from 'vite';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022'
  },
  plugins: [{
    name: 'copy-byd-static-runtime-files',
    closeBundle() {
      copyFileSync(resolve('sw.js'), resolve('dist/sw.js'));
      copyFileSync(resolve('manifest.webmanifest'), resolve('dist/manifest.webmanifest'));
    }
  }]
});
