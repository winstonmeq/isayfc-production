import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Mongoose query/aggregation shapes are dynamic throughout this legacy
      // codebase. Keep lint focused on actionable correctness issues while
      // these boundaries are migrated to explicit DTOs incrementally.
      "@typescript-eslint/no-explicit-any": "off",
      // Existing data-loading effects intentionally initiate async state
      // synchronization on mount/filter changes.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
