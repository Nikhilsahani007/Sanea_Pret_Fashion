import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

const prismaBan = {
  patterns: [
    {
      group: ["@prisma/client", "@prisma/*", "**/generated/prisma/**"],
      message:
        "Only the API may import Prisma (D-102, D-053). Use the API instead.",
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
      "apps/api/src/generated/**",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: [
      "apps/storefront/**/*.{ts,tsx}",
      "apps/admin/**/*.{ts,tsx}",
      "packages/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": ["error", prismaBan],
    },
  },
  prettier,
);
