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
  {
    // The API never bundles CSS; design tokens are for the two apps (TD-002).
    files: ["apps/api/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@sanea/shared/tokens/*", "**/shared/src/tokens/**"],
              message:
                "Design tokens are CSS for the storefront and admin only (TD-002).",
            },
          ],
        },
      ],
    },
  },
  {
    // Repository tooling run by Node directly.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly", URL: "readonly" },
    },
  },
  prettier,
);
