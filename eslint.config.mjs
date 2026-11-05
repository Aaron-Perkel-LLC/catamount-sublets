import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // No console in app code: logs must never carry PII (emails, codes, contact
  // details). Use src/server/log.ts, which takes ids only.
  { files: ["src/**/*.{ts,tsx}"], rules: { "no-console": "error" } },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "drizzle/**",
    ".claude/**",
    "sublets-legacy/**",
    // MapLibre's worker, copied verbatim from node_modules (src/components/map/worker.ts).
    "public/maplibre-gl-worker.mjs",
  ]),
]);

export default eslintConfig;
