import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/** Build « aperçu » : un seul fichier HTML autonome (JS, CSS et polices inline), démarrant sur la brasserie de démo. */
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  define: { 'import.meta.env.VITE_DEMO': JSON.stringify('1') },
  build: { target: 'es2022', outDir: 'dist-preview', assetsInlineLimit: 100_000_000 },
});
