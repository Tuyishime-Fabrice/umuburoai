// Upload check: an uploaded CSV goes through the same validation as the surveillance
// dataset (lib/surveillance/pipeline.ts). Nothing is stored, and uploads never change
// the analytics. Mirrors upload_report() in backend/main.py.
import { districtsIn, parseCsv, rnd, validateAndClean } from "./surveillance/pipeline";
import type { CheckLevel, CleaningSummary } from "./surveillance/types";

export type IssueLevel = CheckLevel;
export interface Issue {
  level: IssueLevel;
  label: string;
  detail: string;
}

export interface DatasetReport {
  kind: "dataset";
  format: "CSV";
  fileName: string;
  rowCount: number;
  columns: string[];
  preview: Record<string, string>[];
  issues: Issue[];
  cleaning: CleaningSummary;
  districts: string[];
  period: { start: string | null; end: string | null };
}

export interface UnsupportedReport {
  kind: "unsupported";
  format: string;
  fileName: string;
  sizeKB: number;
  note: string;
  issues: Issue[];
}

export type UploadReport = DatasetReport | UnsupportedReport;

export async function validateUpload(file: File): Promise<UploadReport> {
  const name = file.name;
  const ext = name.includes(".") ? (name.split(".").pop() as string).toLowerCase() : "";
  if (ext !== "csv") {
    const fmt = ext.toUpperCase() || "Unknown";
    return {
      kind: "unsupported",
      format: fmt,
      fileName: name,
      sizeKB: rnd(file.size / 1024, 0),
      note: "Only CSV files in the surveillance format can be validated. This file was not read and nothing was stored.",
      issues: [{ level: "error", label: "Format", detail: `${fmt} files are not processed.` }],
    };
  }
  const text = new TextDecoder("utf-8").decode(await file.arrayBuffer());
  const clean = validateAndClean(text);
  const table = parseCsv(text);
  const header = clean.header;
  const preview = table.slice(1, 9).map((r) => {
    const o: Record<string, string> = {};
    header.forEach((h, i) => (o[h] = r[i] ?? ""));
    return o;
  });
  const dates = clean.records.map((r) => r.week_start).sort();
  return {
    kind: "dataset",
    format: "CSV",
    fileName: name,
    rowCount: clean.cleaning.rowsRead,
    columns: header,
    preview,
    issues: clean.validation.map((v) => ({ level: v.level, label: v.check, detail: v.detail })),
    cleaning: clean.cleaning,
    districts: districtsIn(clean),
    period: { start: dates[0] ?? null, end: dates.length ? dates[dates.length - 1] : null },
  };
}
