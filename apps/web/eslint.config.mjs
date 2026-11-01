import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

import baseConfig from "@lp/config/eslint";

const eslintConfig = defineConfig([
  ...baseConfig,
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored static assets served as-is -- not source, never meant to be
    // linted (e.g. public/pdf.worker.min.mjs, a committed copy of
    // pdfjs-dist's build output).
    "public/**",
  ]),
]);

export default eslintConfig;
