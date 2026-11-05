import type { RawRow } from "./types";

/**
 * A reader for the phpMyAdmin / mysqldump SQL dump, for rehearsals (the
 * live final sync reads MySQL directly). It understands exactly the
 * constructs those dumps use for data: one `INSERT INTO \`t\` (cols) VALUES`
 * followed by tuples, each `(v, v, …)` separated by commas and ended by a
 * semicolon; single-quoted strings with MySQL backslash escapes (\' \\ \n
 * \r \t \0 \Z \" and \% \_ left as-is); NULL; and numbers. Anything else
 * (DDL, SETs, comments) is skipped. A tuple may span lines, because a
 * string may contain a literal newline.
 *
 * Trusted-input parser: it is only ever run on a dump you made yourself.
 */

export interface ParsedDump {
  tables: Map<string, RawRow[]>;
  autoIncrement: Map<string, number>;
}

export function parseDump(sql: string): ParsedDump {
  const tables = new Map<string, RawRow[]>();
  const autoIncrement = new Map<string, number>();
  let i = 0;
  const n = sql.length;

  const skipWs = () => {
    while (i < n && /\s/.test(sql[i])) i++;
  };

  while (i < n) {
    // Find the next statement start we care about.
    const insertAt = sql.indexOf("INSERT INTO `", i);
    const aiAt = sql.indexOf("AUTO_INCREMENT=", i);
    if (aiAt !== -1 && (insertAt === -1 || aiAt < insertAt)) {
      // "ALTER TABLE `t` MODIFY ... AUTO_INCREMENT=220;" — find the table name behind it.
      const stmtStart = sql.lastIndexOf("ALTER TABLE `", aiAt);
      const nameMatch = /ALTER TABLE `([^`]+)`/.exec(sql.slice(stmtStart, aiAt));
      const valueMatch = /AUTO_INCREMENT=(\d+)/.exec(sql.slice(aiAt, aiAt + 40));
      if (nameMatch && valueMatch) autoIncrement.set(nameMatch[1], Number(valueMatch[1]));
      i = aiAt + 15;
      continue;
    }
    if (insertAt === -1) break;
    i = insertAt + "INSERT INTO `".length;
    const nameEnd = sql.indexOf("`", i);
    const table = sql.slice(i, nameEnd);
    i = nameEnd + 1;
    skipWs();
    if (sql[i] !== "(") throw new Error(`expected column list for ${table} at ${i}`);
    const colsEnd = sql.indexOf(")", i);
    const columns = sql
      .slice(i + 1, colsEnd)
      .split(",")
      .map((c) => c.trim().replace(/^`|`$/g, ""));
    i = colsEnd + 1;
    skipWs();
    if (sql.slice(i, i + 6).toUpperCase() !== "VALUES") throw new Error(`expected VALUES for ${table} at ${i}`);
    i += 6;

    const rows = tables.get(table) ?? [];
    tables.set(table, rows);
    for (;;) {
      skipWs();
      if (sql[i] !== "(") throw new Error(`expected tuple for ${table} at ${i}`);
      i++;
      const values: (string | number | null)[] = [];
      for (;;) {
        skipWs();
        const ch = sql[i];
        if (ch === "'") {
          i++;
          let out = "";
          for (;;) {
            const c = sql[i];
            if (c === undefined) throw new Error(`unterminated string in ${table}`);
            if (c === "\\") {
              const e = sql[i + 1];
              out += e === "n" ? "\n" : e === "r" ? "\r" : e === "t" ? "\t" : e === "0" ? "\0" : e === "Z" ? "\x1a" : e; // \' \\ \" \% \_ → the char
              i += 2;
            } else if (c === "'") {
              if (sql[i + 1] === "'") {
                out += "'";
                i += 2;
              } else {
                i++;
                break;
              }
            } else {
              out += c;
              i++;
            }
          }
          values.push(out);
        } else if (sql.slice(i, i + 4).toUpperCase() === "NULL") {
          values.push(null);
          i += 4;
        } else {
          const m = /^-?\d+(\.\d+)?(e[+-]?\d+)?/i.exec(sql.slice(i, i + 64));
          if (!m) throw new Error(`unexpected token in ${table} at ${i}: ${JSON.stringify(sql.slice(i, i + 20))}`);
          values.push(Number(m[0]));
          i += m[0].length;
        }
        skipWs();
        if (sql[i] === ",") {
          i++;
          continue;
        }
        if (sql[i] === ")") {
          i++;
          break;
        }
        throw new Error(`expected , or ) in ${table} at ${i}`);
      }
      if (values.length !== columns.length) throw new Error(`${table}: ${values.length} values for ${columns.length} columns`);
      rows.push(Object.fromEntries(columns.map((c, k) => [c, values[k]])));
      skipWs();
      if (sql[i] === ",") {
        i++;
        continue;
      }
      if (sql[i] === ";") {
        i++;
        break;
      }
      throw new Error(`expected , or ; after tuple in ${table} at ${i}`);
    }
  }
  return { tables, autoIncrement };
}
