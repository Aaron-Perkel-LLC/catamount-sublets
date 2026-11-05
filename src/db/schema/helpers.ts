import { sql, type SQL } from "drizzle-orm";
import { timestamp, type PgColumn } from "drizzle-orm/pg-core";

/** `timestamptz`, filled by the database. */
export const createdAt = () => timestamp({ withTimezone: true, mode: "date" }).notNull().defaultNow();
export const updatedAt = () =>
  timestamp({ withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
export const nullableTimestamp = () => timestamp({ withTimezone: true, mode: "date" });

/**
 * Literals for CHECK constraints. A plain `${value}` inside sql`` becomes a
 * bind parameter, which drizzle-kit writes into the migration as `$1` — not
 * valid DDL. These inline the value instead, quoted.
 */
export function literal(value: string): SQL {
  return sql.raw(`'${value.replace(/'/g, "''")}'`);
}

export function num(value: number): SQL {
  if (!Number.isFinite(value)) throw new Error(`not a finite number: ${value}`);
  return sql.raw(String(value));
}

/**
 * `column IN ('a', 'b', …)` for a CHECK constraint, built from the same
 * constant the zod schemas use so the database and the validators agree.
 */
export function inList(column: PgColumn, values: readonly string[]): SQL {
  return sql`${column} in (${sql.join(values.map(literal), sql`, `)})`;
}

/** Like inList but also allows NULL. */
export function inListOrNull(column: PgColumn, values: readonly string[]): SQL {
  return sql`${column} is null or ${inList(column, values)}`;
}

/**
 * `column <@ array['a', 'b', …]::text[]` for a CHECK on a text[] column: every
 * element must be one of the values (an empty array passes).
 */
export function subsetOf(column: PgColumn, values: readonly string[]): SQL {
  return sql`${column} <@ array[${sql.join(values.map(literal), sql`, `)}]::text[]`;
}
