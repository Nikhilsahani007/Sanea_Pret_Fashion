import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

const prismaBan = {
  patterns: [
    {
      group: ["@prisma/client", "@prisma/*", "**/generated/prisma/**"],
      message:
        "Frontends must not import Prisma. Use the API (system-architecture.md §2).",
    },
  ],
};

export default defineConfig(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "blob-report/**",
      ".claude/**",
      ".taste-skill/**",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["apps/storefront/**/*.{ts,tsx}", "apps/admin/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", prismaBan],
    },
  },
  prettier,
);
