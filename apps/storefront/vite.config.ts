// Storefront app (phase-11-plan.md §4.1). The dev and preview servers run on
// http://localhost:5173 (STOREFRONT_ORIGIN) and proxy /api to the API, so
// requests are same-origin and the API's __Host- cookies work on localhost
// (D-132), as for the admin.
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export const STOREFRONT_PORT = 5173;
const apiTarget = process.env.STOREFRONT_API_URL ?? "http://127.0.0.1:4000";

// The Origin header is kept as sent by the browser (no changeOrigin), which the
// API checks against STOREFRONT_ORIGIN on every state-changing request.
// robots.txt and the sitemap come from the API (Phase 17); the hosting layer
// does the same in production (Phase 19).
const proxy = {
  "/api": { target: apiTarget },
  "/robots.txt": {
    target: apiTarget,
    rewrite: () => "/api/v1/seo/robots.txt",
  },
  "/sitemap.xml": {
    target: apiTarget,
    rewrite: () => "/api/v1/seo/sitemap.xml",
  },
};

export default defineConfig({
  plugins: [react()],
  server: { host: "localhost", port: STOREFRONT_PORT, strictPort: true, proxy },
  preview: {
    host: "localhost",
    port: STOREFRONT_PORT,
    strictPort: true,
    proxy,
  },
  build: { sourcemap: true },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
  },
});
