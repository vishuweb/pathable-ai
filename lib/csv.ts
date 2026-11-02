// Small CSV reader and writer, for survey data. Shared by browser and server.

/** Reads RFC 4180 CSV into rows of named columns. Unterminated quotes are an error, not a guess. */
export function parseCsv(text: string): { rows: Record<string, string>[] } | { error: string } {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  const source = text.replace(/^﻿/, "");
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && source[i + 1] === "\n") i++;
      record.push(field);
      field = "";
      records.push(record);
      record = [];
    } else {
      field += c;
    }
  }
  if (quoted) return { error: "The file has a quote that is never closed." };
  if (field || record.length) {
    record.push(field);
    records.push(record);
  }
  const nonEmpty = records.filter((r) => r.some((cell) => cell.trim()));
  if (!nonEmpty.length) return { error: "The file is empty." };
  const header = nonEmpty[0].map((h) => h.trim());
  return { rows: nonEmpty.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""]))) };
}

/** A cell a spreadsheet would run as a formula is prefixed, so an export cannot carry a live formula. */
function cell(value: unknown): string {
  let text = value === undefined || value === null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text) && typeof value !== "number") text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(columns: readonly string[], rows: Record<string, unknown>[]): string {
  return [columns.join(","), ...rows.map((row) => columns.map((c) => cell(row[c])).join(","))].join("\r\n") + "\r\n";
}
