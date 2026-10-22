import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // One project per workspace folder. Tests live next to the code as *.test.ts.
    // `scripts` holds repository tooling such as the design token check.
    projects: ["apps/*", "packages/*", "scripts"],
  },
});
