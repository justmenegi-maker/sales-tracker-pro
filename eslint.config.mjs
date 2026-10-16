import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Console output has to go through src/lib/log.ts so it is redacted, and
      // production builds strip everything but warnings and errors anyway.
      "no-console": ["error", { allow: ["warn", "error"] }],
      // Cross-site scripting: React escapes text, so raw HTML is never needed.
      "react/no-danger": "error",
      // Code injection primitives have no place in this app, and a CSP would
      // block them in production regardless.
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
    },
  },
  {
    // The redacting logger is the one module allowed to touch the console.
    files: ["src/lib/log.ts"],
    rules: { "no-console": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
