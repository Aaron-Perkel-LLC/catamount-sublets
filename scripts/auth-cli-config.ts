/**
 * Config for `npm run auth:generate` only. The better-auth CLI needs a
 * synchronous `auth` export; the app builds its instance lazily over the real
 * database (src/server/auth/index.ts). The adapter never queries during
 * generation, so a throwaway in-memory PGlite is enough here.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { Db } from "../src/db";
import * as schema from "../src/db/schema";
import { buildAuth } from "../src/server/auth/config";

const db = drizzle({ client: new PGlite(), schema, casing: "snake_case" }) as unknown as Db;

export const auth = buildAuth(db);
