import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        login: resolve(root, 'login.html'),
        dashboard: resolve(root, 'dashboard.html'),
        portal: resolve(root, 'portal.html'),
        careers: resolve(root, 'careers.html')
      }
    }
  }
});