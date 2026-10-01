// Upload check: an uploaded CSV goes through the same validation as every imported
// dataset (lib/surveillance/pipeline.ts). Mirrors upload_report() in backend/main.py.
import { parseCsv, rnd, validateDataset } from "./surveillance/pipeline";
import type { CheckLevel, DatasetSummary } from "./surveillance/types";

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
  summary: Omit<DatasetSummary, "superseded">;
  preview: Record<string, string>[];
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

export function validateUploadText(name: string, text: string, restrictDistrict: string | null): DatasetReport {
  const v = validateDataset({ id: "upload", name, csv: text, restrictDistrict });
  const table = parseCsv(text);
  const header = v.header;
  const preview = table.slice(1, 9).map((r) => {
    const o: Record<string, string> = {};
    header.forEach((h, i) => (o[h] = r[i] ?? ""));
    return o;
  });
  return { kind: "dataset", format: "CSV", fileName: name, summary: v.summary, preview };
}

export async function validateUpload(file: File, restrictDistrict: string | null): Promise<UploadReport> {
  const name = file.name;
  const ext = name.includes(".") ? (name.split(".").pop() as string).toLowerCase() : "";
  if (ext !== "csv") {
    const fmt = ext.toUpperCase() || "Unknown";
    return {
      kind: "unsupported",
      format: fmt,
      fileName: name,
      sizeKB: rnd(file.size / 1024, 0),
      note: "Only CSV files in the weekly surveillance format can be imported.",
      issues: [{ level: "error", label: "Format", detail: `${fmt} files are not supported.` }],
    };
  }
  const text = new TextDecoder("utf-8").decode(await file.arrayBuffer());
  return validateUploadText(name, text, restrictDistrict);
}
