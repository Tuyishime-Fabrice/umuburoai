import { getDistricts } from "./data";

export type IssueLevel = "ok" | "warn" | "error";
export interface Issue {
  level: IssueLevel;
  label: string;
  detail: string;
}

export interface DatasetReport {
  kind: "dataset";
  format: string;
  fileName: string;
  rowCount: number;
  columns: string[];
  preview: Record<string, string>[];
  issues: Issue[];
}

export interface DocumentField {
  key: string;
  label: string;
  value: string;
  confidence: number;
}
export interface DocumentReport {
  kind: "document";
  format: string;
  fileName: string;
  fields: DocumentField[];
  note: string;
}

export interface BinaryReport {
  kind: "binary";
  format: string;
  fileName: string;
  sizeKB: number;
  issues: Issue[];
  note: string;
}

export type UploadReport = DatasetReport | DocumentReport | BinaryReport;

/** Minimal RFC-4180-ish CSV parser (handles quotes and embedded commas/newlines). */
export function parseCSV(text: string): { header: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  const header = rows.shift() ?? [];
  return { header: header.map((h) => h.trim()), rows };
}

const isNum = (v: string) => v.trim() !== "" && !Number.isNaN(Number(v));
const looksDate = (v: string) =>
  /^\d{4}-W\d{1,2}$/i.test(v.trim()) ||
  /^\d{4}-\d{2}-\d{2}/.test(v.trim()) ||
  !Number.isNaN(Date.parse(v));

function analyze(header: string[], rows: string[][], format: string, fileName: string): DatasetReport {
  const districts = new Set(getDistricts().map((d) => d.district.toLowerCase()));
  const col = (re: RegExp) => header.findIndex((h) => re.test(h));
  const dateIdx = col(/date|week|period|epi/i);
  const locIdx = col(/district|sector|cell|village|location|admin/i);
  const caseIdx = col(/case|confirmed|positiv|malaria/i);
  const numericIdx = header
    .map((h, i) => ({ h, i }))
    .filter((x) => /case|confirmed|positiv|population|rain|temp|count|number|incidence/i.test(x.h))
    .map((x) => x.i);

  const issues: Issue[] = [];

  // missing required columns
  const missing: string[] = [];
  if (dateIdx < 0) missing.push("date / epi-week");
  if (locIdx < 0) missing.push("location (district/sector)");
  if (caseIdx < 0) missing.push("cases");
  issues.push(
    missing.length
      ? { level: "error", label: "Required columns", detail: `Missing: ${missing.join(", ")}.` }
      : { level: "ok", label: "Required columns", detail: "date, location and cases columns found." },
  );

  // missing values
  let empty = 0;
  let cells = 0;
  for (const r of rows)
    for (let i = 0; i < header.length; i++) {
      cells++;
      if ((r[i] ?? "").trim() === "") empty++;
    }
  const emptyPct = cells ? (empty / cells) * 100 : 0;
  issues.push({
    level: empty === 0 ? "ok" : emptyPct > 5 ? "error" : "warn",
    label: "Missing values",
    detail: empty === 0 ? "No empty cells detected." : `${empty} empty cell(s) (${emptyPct.toFixed(1)}%).`,
  });

  // duplicate rows
  const seen = new Set<string>();
  let dupes = 0;
  for (const r of rows) {
    const key = r.join("\u0001");
    if (seen.has(key)) dupes++;
    else seen.add(key);
  }
  issues.push({
    level: dupes === 0 ? "ok" : "warn",
    label: "Duplicate records",
    detail: dupes === 0 ? "No duplicate rows." : `${dupes} duplicate row(s) found.`,
  });

  // invalid dates
  if (dateIdx >= 0) {
    let bad = 0;
    for (const r of rows) {
      const v = (r[dateIdx] ?? "").trim();
      if (v && !looksDate(v)) bad++;
    }
    issues.push({
      level: bad === 0 ? "ok" : bad > rows.length * 0.05 ? "error" : "warn",
      label: "Invalid dates",
      detail: bad === 0 ? "All dates parse correctly." : `${bad} unparseable date value(s).`,
    });
  }

  // invalid locations
  if (locIdx >= 0 && /district/i.test(header[locIdx])) {
    let bad = 0;
    for (const r of rows) {
      const v = (r[locIdx] ?? "").trim().toLowerCase();
      if (v && !districts.has(v)) bad++;
    }
    issues.push({
      level: bad === 0 ? "ok" : "warn",
      label: "Invalid locations",
      detail:
        bad === 0
          ? "All districts match known Rwandan districts."
          : `${bad} row(s) reference an unrecognised district.`,
    });
  }

  // incorrect data types
  if (numericIdx.length) {
    let bad = 0;
    for (const r of rows)
      for (const i of numericIdx) {
        const v = (r[i] ?? "").trim();
        if (v && !isNum(v)) bad++;
      }
    issues.push({
      level: bad === 0 ? "ok" : "warn",
      label: "Data types",
      detail:
        bad === 0
          ? "Numeric columns contain valid numbers."
          : `${bad} non-numeric value(s) in numeric column(s).`,
    });
  }

  const preview = rows.slice(0, 8).map((r) => {
    const o: Record<string, string> = {};
    header.forEach((h, i) => (o[h] = r[i] ?? ""));
    return o;
  });

  return { kind: "dataset", format, fileName, rowCount: rows.length, columns: header, preview, issues };
}

export async function validateUpload(file: File): Promise<UploadReport> {
  const name = file.name;
  const ext = (name.split(".").pop() || "").toLowerCase();
  const sizeKB = Math.round(file.size / 1024);

  if (ext === "csv" || ext === "tsv") {
    const text = await file.text();
    return analyze(...toArgs(parseCSV(text)), "CSV", name);
  }

  if (ext === "json" || ext === "geojson") {
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      if (ext === "geojson" || data?.type === "FeatureCollection") {
        const features = Array.isArray(data?.features) ? data.features : [];
        const types = new Set(features.map((f: { geometry?: { type?: string } }) => f?.geometry?.type).filter(Boolean));
        const issues: Issue[] = [
          {
            level: data?.type === "FeatureCollection" ? "ok" : "error",
            label: "GeoJSON structure",
            detail:
              data?.type === "FeatureCollection"
                ? `Valid FeatureCollection with ${features.length} feature(s).`
                : "Root is not a FeatureCollection.",
          },
          {
            level: types.size ? "ok" : "warn",
            label: "Geometry",
            detail: types.size ? `Geometry types: ${[...types].join(", ")}.` : "No geometries found.",
          },
        ];
        return {
          kind: "dataset",
          format: "GeoJSON",
          fileName: name,
          rowCount: features.length,
          columns: ["feature", "geometry", "properties"],
          preview: features.slice(0, 6).map((f: { geometry?: { type?: string }; properties?: Record<string, unknown> }) => ({
            geometry: f?.geometry?.type ?? "—",
            properties: Object.keys(f?.properties ?? {}).slice(0, 4).join(", ") || "—",
            feature: "Feature",
          })),
          issues,
        };
      }
      // array-of-objects JSON dataset
      const arr = Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : [];
      if (arr.length && typeof arr[0] === "object") {
        const header = Object.keys(arr[0]);
        const rows = arr.map((o: Record<string, unknown>) => header.map((h) => String(o[h] ?? "")));
        return analyze(header, rows, "JSON", name);
      }
      return {
        kind: "binary",
        format: "JSON",
        fileName: name,
        sizeKB,
        note: "Parsed JSON is not a tabular dataset. It was accepted but not profiled as a table.",
        issues: [{ level: "warn", label: "Shape", detail: "Expected an array of records." }],
      };
    } catch {
      return {
        kind: "binary",
        format: "JSON",
        fileName: name,
        sizeKB,
        note: "File is not valid JSON.",
        issues: [{ level: "error", label: "Parse", detail: "JSON.parse failed." }],
      };
    }
  }

  if (["jpg", "jpeg", "png", "webp", "pdf"].includes(ext)) {
    return {
      kind: "document",
      format: ext === "pdf" ? "PDF" : "Image",
      fileName: name,
      note:
        "Prototype extraction. Connect an OCR / document-AI service in production. Review and correct every field before saving.",
      fields: [
        { key: "district", label: "District", value: "Kirehe", confidence: 0.86 },
        { key: "epi_week", label: "Epi week", value: "2026-W40", confidence: 0.9 },
        { key: "facility", label: "Health facility", value: "Kirehe HC", confidence: 0.72 },
        { key: "confirmed_cases", label: "Confirmed cases", value: "48", confidence: 0.81 },
        { key: "rdt_positivity", label: "RDT positivity %", value: "15", confidence: 0.68 },
      ],
    };
  }

  // xlsx, parquet, zip and other binary formats
  const fmt =
    ext === "xlsx" || ext === "xls"
      ? "Excel"
      : ext === "parquet"
        ? "Parquet"
        : ext === "zip"
          ? "ZIP archive"
          : ext.toUpperCase() || "Binary";
  return {
    kind: "binary",
    format: fmt,
    fileName: name,
    sizeKB,
    note: `${fmt} accepted (${sizeKB} KB). Full column profiling for this format runs in the processing service; structure preview isn't available in the browser step.`,
    issues: [{ level: "ok", label: "Received", detail: `${fmt} file staged for import.` }],
  };
}

function toArgs(parsed: { header: string[]; rows: string[][] }): [string[], string[][]] {
  return [parsed.header, parsed.rows];
}
