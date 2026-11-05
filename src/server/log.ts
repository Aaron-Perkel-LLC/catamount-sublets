/**
 * The only place app code writes to the console. Takes a short event name and
 * ids or counts, never emails, codes, addresses or contact details (hard rule 3).
 */
type Fields = Record<string, string | number | boolean | null | undefined>;

function line(level: "info" | "warn" | "error", event: string, fields?: Fields): string {
  return JSON.stringify({ level, event, ...fields, at: new Date().toISOString() });
}

export const log = {
  info(event: string, fields?: Fields) {
    // eslint-disable-next-line no-console
    console.log(line("info", event, fields));
  },
  warn(event: string, fields?: Fields) {
    // eslint-disable-next-line no-console
    console.warn(line("warn", event, fields));
  },
  /** `error` is reduced to its message and name; stacks stay out of production logs. */
  error(event: string, error: unknown, fields?: Fields) {
    const e = error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) };
    // eslint-disable-next-line no-console
    console.error(line("error", event, { ...fields, ...e }));
  },
};
