// Admin app (phase-8-ui-plan.md §3.2, U8-6). The dev and preview servers run on
// http://localhost:5174 (ADMIN_ORIGIN) and proxy /api to the API, so requests
// are same-origin and the API's __Host- cookies work on localhost (D-132).
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export const ADMIN_PORT = 5174;
const apiTarget = process.env.ADMIN_API_URL ?? "http://127.0.0.1:4000";

// The Origin header is kept as sent by the browser (no changeOrigin), which the
// API checks against ADMIN_ORIGIN on every state-changing request.
const proxy = { "/api": { target: apiTarget } };

export default defineConfig({
  plugins: [react()],
  server: { host: "localhost", port: ADMIN_PORT, strictPort: true, proxy },
  preview: { host: "localhost", port: ADMIN_PORT, strictPort: true, proxy },
  build: { sourcemap: true },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
  },
});
