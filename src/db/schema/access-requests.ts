import { check, pgTable, serial, text } from "drizzle-orm/pg-core";
import { ACCESS_REQUEST_KINDS } from "@/lib/access-request";
import { createdAt, inList, nullableTimestamp } from "./helpers";

/**
 * "Request your school" and "Request access" from the front page: no account
 * needed, so this is the one table that holds an address from outside the
 * allowed domains. Mailed to the admin as it arrives; kept until handled.
 */
export const accessRequests = pgTable(
  "access_requests",
  {
    id: serial().primaryKey(),
    kind: text().notNull(),
    name: text().notNull(),
    email: text().notNull(),
    school: text(),
    message: text().notNull().default(""),
    createdAt: createdAt(),
    handledAt: nullableTimestamp(),
  },
  (t) => [check("access_requests_kind_check", inList(t.kind, ACCESS_REQUEST_KINDS))],
);
