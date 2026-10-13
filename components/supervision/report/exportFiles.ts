// Saving a report's data as a file (CSV here; the Chats report's Excel file
// lives in chatsXlsx.ts and loads exceljs only when asked).

export type CsvCell = string | number | boolean | null | undefined;

function csvCell(v: CsvCell): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);
  // Text that starts like a formula (a phone's "+", a note's "=") would be run
  // or mangled by Excel; a leading tab keeps it text. Numbers stay numbers.
  if (typeof v === "string" && /^[=+\-@]/.test(s)) s = `\t${s}`;
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180 CSV (CRLF line ends). */
export function toCsv(header: string[], rows: CsvCell[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before freeing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Saves a CSV as UTF-8 with a BOM, so Excel opens Arabic names correctly. */
export function downloadCsv(fileName: string, header: string[], rows: CsvCell[][]) {
  const blob = new Blob(["﻿", toCsv(header, rows)], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, fileName.endsWith(".csv") ? fileName : `${fileName}.csv`);
}
