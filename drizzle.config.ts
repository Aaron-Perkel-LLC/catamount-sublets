import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit does not read env files itself. `generate` and `check` need no
// database; `migrate` needs DATABASE_URL_UNPOOLED (the direct connection, not
// the pooler), from the shell or .env.local.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? "" },
  strict: true,
  verbose: true,
});
