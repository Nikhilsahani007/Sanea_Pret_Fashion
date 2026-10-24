import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The admin app (port 5174) proxies /api and /media to the API, so requests
// are same-origin and the __Host- cookies work on http://localhost (D-132).
const api = process.env.API_URL ?? "http://127.0.0.1:4000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: { "/api": api, "/media": api },
  },
  preview: {
    port: 5174,
    strictPort: true,
    proxy: { "/api": api, "/media": api },
  },
  build: { sourcemap: true },
});
