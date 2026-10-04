import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  // GitHub Pages serves the site under /<repo>/, so the Pages build sets
  // PAGES_BASE=/moneyos/. Local dev and the backend keep the default "/".
  base: process.env.PAGES_BASE ?? "/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    rollupOptions: {
      // Multi-page: landing (/) + app (/app) + success (/success).
      // Output names match what the backend serves from web/dist.
      input: {
        index: resolve(__dirname, "index.html"),
        app: resolve(__dirname, "app.html"),
        success: resolve(__dirname, "success.html"),
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
