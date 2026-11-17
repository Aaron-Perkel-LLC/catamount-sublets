import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Next resolves server-only to an empty module on the server and an error in client bundles; tests are server code.
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    env: { NEXT_PUBLIC_ADMIN_EMAILS: "admin@catamountsublets.com", LEGACY_ADMIN_NETID: "admin1" },
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    // PGlite boots a Postgres per test file; give it room.
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
