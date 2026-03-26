// electron.vite.config.ts
import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          "@vilag/sdk",
          "@vilag/shared",
          "@vilag/action-parser",
          "@vilag/browser-operator",
          "@vilag/desktop-operator",
          "@vilag/electron-ipc",
          "@vilag/logger",
          "@vilag/rag",
          "@vilag/planner",
          "@vilag/hitl"
        ]
      })
    ],
    build: {
      rollupOptions: {
        // Native / heavy deps should not be bundled into the main process.
        external: [
          "playwright",
          "playwright-core",
          "openai",
          "electron",
          "@computer-use/nut-js",
          "@nut-tree/libnut",
          "libnut"
        ]
      }
    },
    resolve: {
      alias: {
        "@main": resolve("src/main")
      }
    }
  },
  preload: {
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          "@vilag/sdk",
          "@vilag/shared",
          "@vilag/action-parser",
          "@vilag/browser-operator",
          "@vilag/desktop-operator",
          "@vilag/electron-ipc",
          "@vilag/logger",
          "@vilag/rag",
          "@vilag/planner",
          "@vilag/hitl"
        ]
      })
    ],
    build: {
      rollupOptions: {
        external: [
          "playwright",
          "playwright-core",
          "openai",
          "electron",
          "@computer-use/nut-js",
          "@nut-tree/libnut",
          "libnut"
        ]
      }
    }
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src")
      }
    }
  }
});
export {
  electron_vite_config_default as default
};
