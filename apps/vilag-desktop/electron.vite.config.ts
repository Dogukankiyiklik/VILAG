import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@vilag/sdk', '@vilag/shared', '@vilag/action-parser', '@vilag/browser-operator', '@vilag/electron-ipc', '@vilag/logger'] })],
    build: {
      rollupOptions: {
        external: ['playwright', 'playwright-core', 'openai', 'electron']
      }
    },
    resolve: {
      alias: {
        '@main': resolve('src/main'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@vilag/sdk', '@vilag/shared', '@vilag/action-parser', '@vilag/browser-operator', '@vilag/electron-ipc', '@vilag/logger'] })],
    build: {
      rollupOptions: {
        external: ['playwright', 'playwright-core', 'openai', 'electron']
      }
    },
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
      },
    },
  },
});
