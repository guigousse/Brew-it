import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './', // chemins relatifs : requis pour la WebView Capacitor
  build: { target: 'es2022', outDir: 'dist', assetsInlineLimit: 0 },
  test: { globals: true, environment: 'node', include: ['src/**/*.test.ts'] },
});
