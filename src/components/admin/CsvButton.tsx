"use client";

import { Download } from "lucide-react";
import { type CsvValue, toCsv } from "@/lib/csv";
import { easternDate } from "@/lib/dates";

export interface CsvColumn {
  key: string;
  label: string;
}

/**
 * Downloads a table as CSV, built in the browser from the rows already on
 * the page (src/lib/csv.ts quotes and guards against formula injection).
 * Plain columns and rows, so a server page can hand them over as props.
 * The file name is the table's and the date, never anything about a person.
 */
export function CsvButton({ name, columns, rows }: { name: string; columns: CsvColumn[]; rows: readonly object[] }) {
  const download = () => {
    const csv = toCsv([columns.map((c) => c.label), ...rows.map((r) => columns.map((c) => (r as Record<string, CsvValue>)[c.key]))]);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}-${easternDate(new Date())}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <button
      type="button"
      onClick={download}
      disabled={rows.length === 0}
      className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-paper px-3 text-sm text-ink-2 hover:text-lake disabled:opacity-50"
    >
      <Download className="h-4 w-4" aria-hidden />
      CSV
    </button>
  );
}
