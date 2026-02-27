import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          '@vilag/sdk',
          '@vilag/shared',
          '@vilag/action-parser',
          '@vilag/browser-operator',
          '@vilag/desktop-operator',
          '@vilag/electron-ipc',
          '@vilag/logger',
        ],
      }),
    ],
    build: {
      rollupOptions: {
        // Native / heavy deps should not be bundled into the main process.
        external: [
          'playwright',
          'playwright-core',
          'openai',
          'electron',
          '@computer-use/nut-js',
          '@nut-tree/libnut',
          'libnut',
        ],
      },
    },
    resolve: {
      alias: {
        '@main': resolve('src/main'),
      },
    },
  },
  preload: {
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          '@vilag/sdk',
          '@vilag/shared',
          '@vilag/action-parser',
          '@vilag/browser-operator',
          '@vilag/desktop-operator',
          '@vilag/electron-ipc',
          '@vilag/logger',
        ],
      }),
    ],
    build: {
      rollupOptions: {
        external: [
          'playwright',
          'playwright-core',
          'openai',
          'electron',
          '@computer-use/nut-js',
          '@nut-tree/libnut',
          'libnut',
        ],
      },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
      },
    },
  },
});
