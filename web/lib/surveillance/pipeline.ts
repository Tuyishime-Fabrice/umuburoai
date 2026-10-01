// Surveillance analytics pipeline:
// upload(s) → validation → cleaning → combination → feature preparation → trend
// analysis → baseline comparison → anomaly detection → risk signal → explainable
// alert → human review, plus relationships, prioritisation and a backtested projection.
//
// Pure functions only (no I/O): the same datasets always give the same output.
// backend/analytics.py implements the identical algorithm for the API; keep the two
// in step (their outputs are compared value for value).

import type {
  Analytics,
  Coverage,
  DataQuality,
  DatasetInput,
  DatasetSummary,
  DistrictStatus,
  Forecast,
  ForecastHorizon,
  LagCorrelation,
  MethodRule,
  NumericField,
  PipelineStage,
  PriorityRow,
  ScopeOption,
  SignalItem,
  SignalLevel,
  SurveillanceAlert,
  Totals,
  ValidationCheck,
  WeekPoint,
  WeekRecord,
  WeekSignal,
} from "./types";

// ----------------------------------------------------------------------------- rules
export const RULES = {
  CASE_DEVIATION_PCT: 25, // confirmed cases ≥ 25% above the previous 4-week average
  Z_THRESHOLD: 2, // confirmed cases ≥ 2 SD above the previous 8 weeks
  POSITIVITY_RISE_PP: 3, // positivity ≥ 3 percentage points above the previous 4-week average
  SEVERE_RATIO: 1.5, // severe cases ≥ 1.5× the previous 4-week average …
  SEVERE_MIN_EXCESS: 3, // … and at least 3 cases above it
  CONTEXT_ABOVE_PCT: 20, // environmental value ≥ 20% above its dataset-period average
  COMPLETENESS_MIN_PCT: 90, // below this, reporting completeness is flagged
  DELAY_MAX_DAYS: 3, // above this, reporting delay is flagged
  STALE_AFTER_DAYS: 21, // no new week for this long → data flagged as stale
  MIN_CORRELATION_PAIRS: 10,
  MAX_LAG_WEEKS: 8,
  NET_COVERAGE_REVIEW_PCT: 80, // prioritisation review prompts
  IRS_COVERAGE_REVIEW_PCT: 70,
  STOCK_REVIEW_DAYS: 14,
  FORECAST_MAX_H: 4,
  FORECAST_MIN_TRAIN: 16, // weeks of history before the first backtest origin
  FORECAST_MIN_BACKTEST: 8,
  FORECAST_RIDGE: 1,
} as const;

// ----------------------------------------------------------------------------- reference
export const PROVINCES = ["Kigali City", "Southern", "Western", "Northern", "Eastern"] as const;

/** Rwanda's 30 districts and their provinces. */
export const DISTRICTS: { district: string; province: string }[] = [
  ...["Gasabo", "Kicukiro", "Nyarugenge"].map((d) => ({ district: d, province: "Kigali City" })),
  ...["Gisagara", "Huye", "Kamonyi", "Muhanga", "Nyamagabe", "Nyanza", "Nyaruguru", "Ruhango"].map((d) => ({
    district: d,
    province: "Southern",
  })),
  ...["Karongi", "Ngororero", "Nyabihu", "Nyamasheke", "Rubavu", "Rusizi", "Rutsiro"].map((d) => ({
    district: d,
    province: "Western",
  })),
  ...["Burera", "Gakenke", "Gicumbi", "Musanze", "Rulindo"].map((d) => ({ district: d, province: "Northern" })),
  ...["Bugesera", "Gatsibo", "Kayonza", "Kirehe", "Ngoma", "Nyagatare", "Rwamagana"].map((d) => ({
    district: d,
    province: "Eastern",
  })),
];

export function provinceOf(district: string): string {
  return DISTRICTS.find((d) => d.district === district)?.province ?? "";
}

export function provinceLabel(p: string): string {
  return p === "Kigali City" ? "Kigali City" : `${p} Province`;
}

/** Canonical district name, or null when the name is not a Rwandan district. */
export function canonicalDistrict(raw: string): string | null {
  const v = raw.trim().replace(/\s+district$/i, "").trim().toLowerCase();
  return DISTRICTS.find((d) => d.district.toLowerCase() === v)?.district ?? null;
}

export const COLUMNS: (keyof WeekRecord)[] = [
  "week_start",
  "epidemiological_week",
  "district",
  "population_at_risk",
  "suspected_malaria_cases",
  "tested_cases",
  "confirmed_malaria_cases",
  "positive_tests_pct",
  "severe_malaria_cases",
  "malaria_deaths",
  "malaria_admissions",
  "outpatient_visits",
  "incidence_per_1000",
  "testing_rate_pct",
  "rainfall_mm",
  "mean_temperature_c",
  "relative_humidity_pct",
  "ndvi",
  "mosquito_density_index",
  "larval_density_index",
  "human_mobility_index",
  "reporting_completeness_pct",
  "reporting_delay_days",
  "facilities_expected",
  "facilities_reporting",
  "act_stock_days",
  "rdt_stock_days",
  "stockout_days",
  "bed_occupancy_pct",
  "bed_net_coverage_pct",
  "indoor_residual_spraying_pct",
  "confirmed_cases_4wk_avg",
  "rainfall_4wk_avg",
  "cases_change_vs_4wk_avg_pct",
  "alert_label",
];

export const CORE_COLUMNS: (keyof WeekRecord)[] = ["week_start", "district", "confirmed_malaria_cases"];

export const NUMERIC_COLUMNS = COLUMNS.filter(
  (c) => c !== "week_start" && c !== "district",
) as NumericField[];

const PCT_FIELDS: NumericField[] = [
  "positive_tests_pct",
  "testing_rate_pct",
  "relative_humidity_pct",
  "reporting_completeness_pct",
  "bed_occupancy_pct",
  "bed_net_coverage_pct",
  "indoor_residual_spraying_pct",
];

const NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ----------------------------------------------------------------------------- helpers
/** Round half up (JavaScript Math.round semantics) to `d` decimals. */
export function rnd(x: number, d: number): number {
  const f = 10 ** d;
  return Math.floor(x * f + 0.5) / f;
}
const rndN = (x: number | null, d: number) => (x === null ? null : rnd(x, d));

function add(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return add(xs) / xs.length;
}

function sampleSd(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs) as number;
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / (xs.length - 1));
}

function nonNull(xs: (number | null)[]): number[] {
  return xs.filter((x): x is number => x !== null);
}

export function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

const fmt = (x: number | null, d = 0) =>
  x === null
    ? "—"
    : x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function groupBy<T>(xs: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    const arr = m.get(k);
    if (arr) arr.push(x);
    else m.set(k, [x]);
  }
  return m;
}

function byDistrictWeek(a: WeekRecord, b: WeekRecord): number {
  if (a.district !== b.district) return a.district < b.district ? -1 : 1;
  return a.week_start < b.week_start ? -1 : a.week_start > b.week_start ? 1 : 0;
}

function ratio(num: number | null, den: number | null, scale: number): number | null {
  return num === null || den === null || den === 0 ? null : (num / den) * scale;
}

function cmp(a: number | null, b: number | null): boolean | null {
  return a === null || b === null ? null : a <= b;
}

function trailingMean<T>(rs: T[], i: number, get: (x: T) => number | null): number | null {
  if (get(rs[i]) === null) return null;
  return mean(nonNull(rs.slice(Math.max(0, i - 3), i + 1).map(get)));
}

// ----------------------------------------------------------------------------- CSV
/** RFC-4180 style CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// ----------------------------------------------------------------------------- validate one dataset
export interface ValidatedDataset {
  summary: Omit<DatasetSummary, "superseded">;
  records: WeekRecord[];
  header: string[];
}

function inRange(col: NumericField, v: number): boolean {
  if (col === "ndvi") return v >= -1 && v <= 1;
  if (col === "mean_temperature_c") return v >= -10 && v <= 50;
  if (col === "cases_change_vs_4wk_avg_pct") return true;
  if (col === "epidemiological_week") return Number.isInteger(v) && v >= 1 && v <= 53;
  if (col === "alert_label") return v === 0 || v === 1;
  if (PCT_FIELDS.includes(col)) return v >= 0 && v <= 100;
  return v >= 0;
}

export function validateDataset(input: DatasetInput): ValidatedDataset {
  const table = parseCsv(input.csv);
  const header = (table[0] ?? []).map((h) => h.trim());
  const body = table.slice(1);
  const validation: ValidationCheck[] = [];
  const restrict = input.restrictDistrict ? canonicalDistrict(input.restrictDistrict) : null;

  const missingCore = CORE_COLUMNS.filter((c) => !header.includes(c));
  const missingOptional = COLUMNS.filter((c) => !CORE_COLUMNS.includes(c) && !header.includes(c));
  const extraCols = header.filter((h) => !(COLUMNS as string[]).includes(h));
  if (missingCore.length) {
    validation.push({
      check: "Required columns",
      level: "error",
      detail: `Missing required column(s): ${missingCore.join(", ")}. The file cannot be used.`,
      count: missingCore.length,
    });
  } else if (missingOptional.length) {
    validation.push({
      check: "Required columns",
      level: "warn",
      detail: `Required columns present. Optional column(s) not supplied: ${missingOptional.join(", ")}. Analyses that need them show as unavailable.`,
      count: missingOptional.length,
    });
  } else {
    validation.push({
      check: "Required columns",
      level: "ok",
      detail: `All ${COLUMNS.length} surveillance columns are present.`,
      count: 0,
    });
  }
  if (extraCols.length) {
    validation.push({
      check: "Unrecognised columns",
      level: "warn",
      detail: `Ignored: ${extraCols.join(", ")}.`,
      count: extraCols.length,
    });
  }

  const idx = new Map(header.map((h, i) => [h, i]));
  const cell = (r: string[], c: string) => {
    const i = idx.get(c);
    return i === undefined ? "" : (r[i] ?? "").trim();
  };

  let droppedInvalidKey = 0;
  let droppedDuplicate = 0;
  let droppedUnknownDistrict = 0;
  let droppedOutsideScope = 0;
  const unknownNames: string[] = [];
  let invalidNumbers = 0;
  const invalidNumberCols: string[] = [];
  let outOfRange = 0;
  const outOfRangeCols: string[] = [];
  const seen = new Set<string>();
  const records: WeekRecord[] = [];

  for (const r of missingCore.length ? [] : body) {
    const week_start = cell(r, "week_start");
    const rawDistrict = cell(r, "district");
    if (!isValidDate(week_start) || !rawDistrict) {
      droppedInvalidKey++;
      continue;
    }
    const district = canonicalDistrict(rawDistrict);
    if (!district) {
      droppedUnknownDistrict++;
      if (!unknownNames.includes(rawDistrict)) unknownNames.push(rawDistrict);
      continue;
    }
    if (restrict && district !== restrict) {
      droppedOutsideScope++;
      continue;
    }
    const key = `${district}|${week_start}`;
    if (seen.has(key)) {
      droppedDuplicate++;
      continue;
    }
    seen.add(key);

    const rec = { week_start, district } as WeekRecord;
    for (const col of NUMERIC_COLUMNS) {
      const raw = cell(r, col);
      let v: number | null = null;
      if (raw !== "") {
        if (NUM_RE.test(raw)) v = Number(raw);
        else {
          invalidNumbers++;
          if (!invalidNumberCols.includes(col)) invalidNumberCols.push(col);
        }
      }
      if (v !== null && !inRange(col, v)) {
        outOfRange++;
        if (!outOfRangeCols.includes(col)) outOfRangeCols.push(col);
        v = null;
      }
      rec[col] = v;
    }
    records.push(rec);
  }
  records.sort(byDistrictWeek);

  validation.push({
    check: "Row keys (date, district)",
    level: droppedInvalidKey ? "warn" : "ok",
    detail: droppedInvalidKey
      ? `${plural(droppedInvalidKey, "row")} dropped: week_start is not a valid YYYY-MM-DD date or district is empty.`
      : "Every row has a valid week_start date and a district.",
    count: droppedInvalidKey,
  });
  validation.push({
    check: "Districts",
    level: droppedUnknownDistrict ? "warn" : "ok",
    detail: droppedUnknownDistrict
      ? `${plural(droppedUnknownDistrict, "row")} excluded: not a Rwandan district (${unknownNames.slice(0, 5).join(", ")}${unknownNames.length > 5 ? ", …" : ""}).`
      : "All rows refer to recognised Rwandan districts.",
    count: droppedUnknownDistrict,
  });
  if (restrict) {
    validation.push({
      check: "Access scope",
      level: droppedOutsideScope ? "warn" : "ok",
      detail: droppedOutsideScope
        ? `${plural(droppedOutsideScope, "row")} for other districts excluded: this account can only submit ${restrict} data.`
        : `All rows are for ${restrict}.`,
      count: droppedOutsideScope,
    });
  }
  validation.push({
    check: "Duplicate district-weeks",
    level: droppedDuplicate ? "warn" : "ok",
    detail: droppedDuplicate
      ? `${plural(droppedDuplicate, "duplicate row")} dropped (first occurrence kept).`
      : "No district has two rows for the same week.",
    count: droppedDuplicate,
  });
  validation.push({
    check: "Numeric values",
    level: invalidNumbers ? "warn" : "ok",
    detail: invalidNumbers
      ? `${plural(invalidNumbers, "non-numeric value")} set to missing (${invalidNumberCols.join(", ")}).`
      : "All numeric columns contain numbers.",
    count: invalidNumbers,
  });
  validation.push({
    check: "Value ranges",
    level: outOfRange ? "warn" : "ok",
    detail: outOfRange
      ? `${plural(outOfRange, "out-of-range value")} set to missing (${outOfRangeCols.join(", ")}).`
      : "Percentages are within 0–100, counts are non-negative, NDVI is within −1 to 1.",
    count: outOfRange,
  });
  validation.push(missingValuesCheck(records, header, invalidNumbers + outOfRange));
  validation.push(...consistencyChecks(records, header));
  validation.push(continuityCheck(records));

  if (!missingCore.length && !records.length) {
    validation.push({
      check: "Usable rows",
      level: "error",
      detail: "No usable rows remain after validation. The file cannot be used.",
      count: 0,
    });
  }

  const dates = records.map((r) => r.week_start).sort();
  return {
    header,
    records,
    summary: {
      id: input.id,
      name: input.name,
      accepted: missingCore.length === 0 && records.length > 0,
      columns: header,
      missingOptionalColumns: missingOptional as string[],
      districts: [...new Set(records.map((r) => r.district))].sort(),
      period: { start: dates[0] ?? null, end: dates.length ? dates[dates.length - 1] : null },
      cleaning: {
        rowsRead: body.length,
        rowsKept: records.length,
        droppedInvalidKey,
        droppedDuplicate,
        droppedUnknownDistrict,
        droppedOutsideScope,
        valuesSetToNull: invalidNumbers + outOfRange,
      },
      validation,
    },
  };
}

function missingValuesCheck(records: WeekRecord[], supplied: string[], nulledByValidation: number): ValidationCheck {
  let empty = 0;
  for (const rec of records) for (const c of NUMERIC_COLUMNS) if (supplied.includes(c) && rec[c] === null) empty++;
  return {
    check: "Missing values",
    level: empty ? "warn" : "ok",
    detail: empty
      ? `${plural(empty, "cell")} missing after cleaning (${nulledByValidation} set to missing by validation). Missing values are excluded from calculations, never filled in.`
      : "No missing values in the supplied columns.",
    count: empty,
  };
}

function consistencyChecks(records: WeekRecord[], supplied: string[]): ValidationCheck[] {
  const out: ValidationCheck[] = [];
  const has = (...cols: string[]) => cols.every((c) => supplied.includes(c));

  const logical: [string, string[], (r: WeekRecord) => boolean | null][] = [
    ["tested ≤ suspected", ["tested_cases", "suspected_malaria_cases"], (r) => cmp(r.tested_cases, r.suspected_malaria_cases)],
    ["confirmed ≤ tested", ["confirmed_malaria_cases", "tested_cases"], (r) => cmp(r.confirmed_malaria_cases, r.tested_cases)],
    [
      "facilities reporting ≤ expected",
      ["facilities_reporting", "facilities_expected"],
      (r) => cmp(r.facilities_reporting, r.facilities_expected),
    ],
  ];
  for (const [label, cols, fn] of logical) {
    if (!has(...cols)) continue;
    const bad = records.filter((r) => fn(r) === false).length;
    out.push({
      check: `Logic: ${label}`,
      level: bad ? "warn" : "ok",
      detail: bad
        ? `${plural(bad, "row")} break this rule; values kept but should be checked at source.`
        : "Holds for every row.",
      count: bad,
    });
  }

  const derived: {
    check: string;
    cols: string[];
    tol: number;
    unit: string;
    note: string;
    file: (r: WeekRecord) => number | null;
    calc: (r: WeekRecord, i: number, rs: WeekRecord[]) => number | null;
  }[] = [
    {
      check: "positive_tests_pct = confirmed ÷ tested",
      cols: ["positive_tests_pct", "confirmed_malaria_cases", "tested_cases"],
      tol: 0.05,
      unit: " pp",
      note: "Single district-weeks show the file's value; combined figures are recomputed from counts.",
      file: (r) => r.positive_tests_pct,
      calc: (r) => ratio(r.confirmed_malaria_cases, r.tested_cases, 100),
    },
    {
      check: "testing_rate_pct = tested ÷ suspected",
      cols: ["testing_rate_pct", "tested_cases", "suspected_malaria_cases"],
      tol: 0.05,
      unit: " pp",
      note: "",
      file: (r) => r.testing_rate_pct,
      calc: (r) => ratio(r.tested_cases, r.suspected_malaria_cases, 100),
    },
    {
      check: "incidence_per_1000 = confirmed ÷ population × 1,000",
      cols: ["incidence_per_1000", "confirmed_malaria_cases", "population_at_risk"],
      tol: 0.001,
      unit: "",
      note: "",
      file: (r) => r.incidence_per_1000,
      calc: (r) => ratio(r.confirmed_malaria_cases, r.population_at_risk, 1000),
    },
    {
      check: "confirmed_cases_4wk_avg = trailing 4-week mean (incl. current week)",
      cols: ["confirmed_cases_4wk_avg", "confirmed_malaria_cases"],
      tol: 0.05,
      unit: "",
      note: "The early-warning baseline uses the 4 weeks before the current week instead, so a rise is not averaged into its own baseline.",
      file: (r) => r.confirmed_cases_4wk_avg,
      calc: (_r, i, rs) => trailingMean(rs, i, (x) => x.confirmed_malaria_cases),
    },
    {
      check: "cases_change_vs_4wk_avg_pct matches the 4-week average column",
      cols: ["cases_change_vs_4wk_avg_pct", "confirmed_cases_4wk_avg", "confirmed_malaria_cases"],
      tol: 0.05,
      unit: " pp",
      note: "",
      file: (r) => r.cases_change_vs_4wk_avg_pct,
      calc: (r) =>
        r.confirmed_malaria_cases !== null && r.confirmed_cases_4wk_avg
          ? ((r.confirmed_malaria_cases - r.confirmed_cases_4wk_avg) / r.confirmed_cases_4wk_avg) * 100
          : null,
    },
  ];

  const byDistrict = groupBy(records, (r) => r.district);
  for (const d of derived) {
    if (!has(...d.cols)) continue;
    let compared = 0;
    let bad = 0;
    let worst = 0;
    for (const rs of byDistrict.values()) {
      rs.forEach((r, i) => {
        const f = d.file(r);
        const c = d.calc(r, i, rs);
        if (f === null || c === null) return;
        compared++;
        const diff = Math.abs(f - c);
        if (diff > d.tol + 1e-9) {
          bad++;
          if (diff > worst) worst = diff;
        }
      });
    }
    out.push({
      check: `Derived: ${d.check}`,
      level: bad ? "warn" : "ok",
      detail: bad
        ? `${bad} of ${compared} rows differ by more than ${d.tol}${d.unit} (largest ${fmt(rnd(worst, 3), 3)}${d.unit}). ${d.note}`.trim()
        : `Consistent in all ${compared} comparable rows.${d.note ? " " + d.note : ""}`,
      count: bad,
    });
  }
  return out;
}

function continuityCheck(records: WeekRecord[]): ValidationCheck {
  let gaps = 0;
  let irregular = 0;
  for (const rs of groupBy(records, (r) => r.district).values()) {
    for (let i = 1; i < rs.length; i++) {
      const days = daysBetween(rs[i - 1].week_start, rs[i].week_start);
      if (days % 7 !== 0) irregular++;
      else if (days > 7) gaps += days / 7 - 1;
    }
  }
  const bad = gaps + irregular;
  return {
    check: "Weekly continuity",
    level: bad ? "warn" : "ok",
    detail: bad
      ? `${plural(gaps, "missing week")} and ${plural(irregular, "irregular interval")} between consecutive district records.`
      : "Each district has one record every 7 days with no gaps.",
    count: bad,
  };
}

// ----------------------------------------------------------------------------- combine uploads
export interface Combined {
  records: WeekRecord[];
  sources: DatasetSummary[];
  validation: ValidationCheck[];
  /** Columns supplied by at least one accepted dataset. */
  supplied: string[];
}

/** Combine datasets in upload order; for a district-week supplied twice, the later upload wins. */
export function combine(datasets: DatasetInput[]): Combined {
  const validated = datasets.map(validateDataset);
  const merged = new Map<string, { rec: WeekRecord; source: string }>();
  const superseded = new Map<string, number>();
  let overlaps = 0;
  const supplied: string[] = [];
  for (const v of validated) {
    if (!v.summary.accepted) continue;
    for (const h of v.header) if ((COLUMNS as string[]).includes(h) && !supplied.includes(h)) supplied.push(h);
    for (const rec of v.records) {
      const key = `${rec.district}|${rec.week_start}`;
      const prev = merged.get(key);
      if (prev) {
        overlaps++;
        superseded.set(prev.source, (superseded.get(prev.source) ?? 0) + 1);
      }
      merged.set(key, { rec, source: v.summary.id });
    }
  }
  const records = [...merged.values()].map((m) => m.rec).sort(byDistrictWeek);
  const accepted = validated.filter((v) => v.summary.accepted).length;

  const validation: ValidationCheck[] = [
    {
      check: "Datasets",
      level: accepted ? "ok" : "warn",
      detail: accepted
        ? `${plural(accepted, "dataset")} combined into ${plural(records.length, "district-week record")}.`
        : "No usable dataset has been imported.",
      count: accepted,
    },
    {
      check: "Overlapping uploads",
      level: "ok",
      detail: overlaps
        ? `${plural(overlaps, "district-week")} supplied again by a later upload; the most recent upload is used.`
        : "No district-week is supplied by more than one dataset.",
      count: overlaps,
    },
    missingValuesCheck(
      records,
      supplied,
      validated.reduce((s, v) => s + (v.summary.accepted ? v.summary.cleaning.valuesSetToNull : 0), 0),
    ),
    ...consistencyChecks(records, supplied),
    continuityCheck(records),
  ];

  return {
    records,
    supplied,
    validation,
    sources: validated.map((v) => ({ ...v.summary, superseded: superseded.get(v.summary.id) ?? 0 })),
  };
}

// ----------------------------------------------------------------------------- scopes
function scopeOption(level: ScopeOption["level"], name: string, withData: Set<string>): ScopeOption {
  if (level === "national")
    return { id: "national", label: "National", level, province: null, hasData: withData.size > 0 };
  if (level === "province")
    return {
      id: `province:${name}`,
      label: provinceLabel(name),
      level,
      province: name,
      hasData: DISTRICTS.some((d) => d.province === name && withData.has(d.district)),
    };
  return { id: `district:${name}`, label: name, level, province: provinceOf(name), hasData: withData.has(name) };
}

export function scopeOptions(records: WeekRecord[]): ScopeOption[] {
  const withData = new Set(records.map((r) => r.district));
  return [
    scopeOption("national", "", withData),
    ...PROVINCES.map((p) => scopeOption("province", p, withData)),
    ...PROVINCES.flatMap((p) =>
      DISTRICTS.filter((d) => d.province === p).map((d) => scopeOption("district", d.district, withData)),
    ),
  ];
}

/** Accepts "national", "province:Eastern", "district:Nyagatare", or a bare district/province name. */
export function resolveScope(records: WeekRecord[], raw: string | null | undefined): ScopeOption {
  const opts = scopeOptions(records);
  const v = (raw ?? "").trim().toLowerCase();
  const direct = opts.find((o) => o.id.toLowerCase() === v);
  if (direct) return direct;
  const bare = opts.find(
    (o) =>
      o.level !== "national" &&
      (o.label.toLowerCase() === v || ((o.province ?? "").toLowerCase() === v && o.level === "province")),
  );
  return bare ?? opts[0];
}

function districtsOf(scope: ScopeOption): string[] {
  if (scope.level === "national") return DISTRICTS.map((d) => d.district);
  if (scope.level === "province") return DISTRICTS.filter((d) => d.province === scope.province).map((d) => d.district);
  return [scope.label];
}

function placeOf(scope: ScopeOption): string {
  if (scope.level === "national") return "across reporting districts nationally";
  if (scope.level === "province") return `across reporting districts in ${scope.label}`;
  return `in ${scope.label}`;
}

// ----------------------------------------------------------------------------- aggregation
type Agg = "sum" | "mean";
const SERIES_FIELDS: [keyof WeekPoint, NumericField, Agg][] = [
  ["population", "population_at_risk", "sum"],
  ["suspected", "suspected_malaria_cases", "sum"],
  ["tested", "tested_cases", "sum"],
  ["confirmed", "confirmed_malaria_cases", "sum"],
  ["severe", "severe_malaria_cases", "sum"],
  ["deaths", "malaria_deaths", "sum"],
  ["admissions", "malaria_admissions", "sum"],
  ["outpatient", "outpatient_visits", "sum"],
  ["facilities_expected", "facilities_expected", "sum"],
  ["facilities_reporting", "facilities_reporting", "sum"],
  ["stockout_days", "stockout_days", "sum"],
  ["rainfall_mm", "rainfall_mm", "mean"],
  ["rainfall_4wk_avg", "rainfall_4wk_avg", "mean"],
  ["temperature_c", "mean_temperature_c", "mean"],
  ["humidity_pct", "relative_humidity_pct", "mean"],
  ["ndvi", "ndvi", "mean"],
  ["mosquito_density", "mosquito_density_index", "mean"],
  ["larval_density", "larval_density_index", "mean"],
  ["mobility_index", "human_mobility_index", "mean"],
  ["reporting_completeness_pct", "reporting_completeness_pct", "mean"],
  ["reporting_delay_days", "reporting_delay_days", "mean"],
  ["act_stock_days", "act_stock_days", "mean"],
  ["rdt_stock_days", "rdt_stock_days", "mean"],
  ["bed_occupancy_pct", "bed_occupancy_pct", "mean"],
  ["bed_net_coverage_pct", "bed_net_coverage_pct", "mean"],
  ["irs_pct", "indoor_residual_spraying_pct", "mean"],
];

/**
 * Weekly series for a set of districts. One district: values exactly as in the file.
 * Several: counts summed over the districts that reported (missing if a reporting
 * district left the cell blank), rates recomputed from the sums, indices averaged.
 * A week is "complete" when every district in the set reported.
 */
function buildSeries(records: WeekRecord[], districts: string[]): WeekPoint[] {
  const single = districts.length === 1;
  const byWeek = groupBy(
    records.filter((r) => districts.includes(r.district)),
    (r) => r.week_start,
  );
  const weeks = [...byWeek.keys()].sort();
  const points: WeekPoint[] = [];

  for (const w of weeks) {
    const rs = byWeek.get(w) as WeekRecord[];
    const p = {
      week_start: w,
      epi_week: rs[0].epidemiological_week,
      districts_reporting: rs.length,
      districts_expected: districts.length,
      complete: rs.length === districts.length,
    } as WeekPoint;

    for (const [out, col, agg] of SERIES_FIELDS) {
      const vals = rs.map((r) => r[col]);
      const nn = nonNull(vals);
      let v: number | null;
      if (agg === "sum") v = nn.length === vals.length ? add(nn) : null;
      else v = mean(nn);
      (p as unknown as Record<string, number | null>)[out] = single ? rs[0][col] : rndN(v, 2);
    }

    if (single) {
      const r = rs[0];
      p.positivity_pct = r.positive_tests_pct;
      p.testing_rate_pct = r.testing_rate_pct;
      p.incidence_per_1000 = r.incidence_per_1000;
      p.file_alert_label = r.alert_label;
    } else {
      p.positivity_pct = rndN(ratio(p.confirmed, p.tested, 100), 2);
      p.testing_rate_pct = rndN(ratio(p.tested, p.suspected, 100), 2);
      p.incidence_per_1000 = rndN(ratio(p.confirmed, p.population, 1000), 3);
      const labels = rs.map((r) => r.alert_label);
      p.file_alert_label = labels.every((x) => x !== null) ? add(labels as number[]) : null;
    }
    p.opd_malaria_share_pct = rndN(ratio(p.confirmed, p.outpatient, 100), 2);
    p.severe_pct_of_confirmed = rndN(ratio(p.severe, p.confirmed, 100), 2);
    points.push(p);
  }
  return points;
}

// ----------------------------------------------------------------------------- features
/** Values of the n weeks before i, only if all are present and fully reported. */
function prevWindow(points: WeekPoint[], i: number, n: number, get: (p: WeekPoint) => number | null) {
  if (i < n) return null;
  const win = points.slice(i - n, i);
  if (!win.every((p) => p.complete)) return null;
  const vals = win.map(get);
  return vals.every((v) => v !== null) ? (vals as number[]) : null;
}

function addFeatures(points: WeekPoint[]): void {
  points.forEach((p, i) => {
    p.cases_ma4 = rndN(trailingMean(points, i, (x) => x.confirmed), 2);
    const ok = p.complete;

    const prev4 = ok ? prevWindow(points, i, 4, (x) => x.confirmed) : null;
    const b = prev4 ? (mean(prev4) as number) : null;
    p.baseline_prev4 = rndN(b, 2);
    p.change_vs_baseline_pct =
      b !== null && b > 0 && p.confirmed !== null ? rnd(((p.confirmed - b) / b) * 100, 1) : null;

    const prev8 = ok ? prevWindow(points, i, 8, (x) => x.confirmed) : null;
    const m8 = prev8 ? mean(prev8) : null;
    const sd8 = prev8 ? sampleSd(prev8) : null;
    p.baseline_prev8_mean = rndN(m8, 2);
    p.baseline_prev8_sd = rndN(sd8, 2);
    p.z_prev8 =
      m8 !== null && sd8 !== null && sd8 > 0 && p.confirmed !== null
        ? rnd((p.confirmed - m8) / sd8, 2)
        : null;

    const pos4 = ok ? prevWindow(points, i, 4, (x) => x.positivity_pct) : null;
    const pb = pos4 ? (mean(pos4) as number) : null;
    p.positivity_baseline_prev4 = rndN(pb, 2);
    p.positivity_change_pp =
      pb !== null && p.positivity_pct !== null ? rnd(p.positivity_pct - pb, 2) : null;

    const sev4 = ok ? prevWindow(points, i, 4, (x) => x.severe) : null;
    p.severe_baseline_prev4 = sev4 ? rnd(mean(sev4) as number, 2) : null;
  });
}

// ----------------------------------------------------------------------------- signals
interface PeriodRefs {
  rainfall_4wk_avg: number | null;
  mosquito_density: number | null;
  larval_density: number | null;
}

function periodRefs(points: WeekPoint[]): PeriodRefs {
  const m = (get: (p: WeekPoint) => number | null) => rndN(mean(nonNull(points.map(get))), 2);
  return {
    rainfall_4wk_avg: m((p) => p.rainfall_4wk_avg),
    mosquito_density: m((p) => p.mosquito_density),
    larval_density: m((p) => p.larval_density),
  };
}

const CASE_SIGNALS = ["cases_above_baseline", "unusual_increase"];

function evaluateSignal(p: WeekPoint, place: string, refs: PeriodRefs): WeekSignal {
  const signals: SignalItem[] = [];
  const observations: SignalItem[] = [];
  const context: SignalItem[] = [];
  const quality: SignalItem[] = [];

  if (p.change_vs_baseline_pct !== null && p.change_vs_baseline_pct >= RULES.CASE_DEVIATION_PCT) {
    signals.push({
      key: "cases_above_baseline",
      label: "Cases above recent baseline",
      detail: `Confirmed malaria cases (${fmt(p.confirmed)}) are ${fmt(p.change_vs_baseline_pct, 1)}% above the previous 4-week average (${fmt(p.baseline_prev4, 1)}) ${place}.`,
    });
  }
  if (p.z_prev8 !== null && p.z_prev8 >= RULES.Z_THRESHOLD) {
    signals.push({
      key: "unusual_increase",
      label: "Unusual increase",
      detail: `${fmt(p.confirmed)} confirmed cases is ${fmt(p.z_prev8, 2)} standard deviations above the previous 8 weeks (mean ${fmt(p.baseline_prev8_mean, 1)}, SD ${fmt(p.baseline_prev8_sd, 1)}).`,
    });
  }
  if (p.positivity_change_pp !== null && p.positivity_change_pp >= RULES.POSITIVITY_RISE_PP) {
    signals.push({
      key: "positivity_increased",
      label: "Positivity increased",
      detail: `Test positivity was ${fmt(p.positivity_pct, 2)}%, ${fmt(p.positivity_change_pp, 2)} percentage points above the previous 4-week average (${fmt(p.positivity_baseline_prev4, 2)}%).`,
    });
  }
  if (
    p.severe !== null &&
    p.severe_baseline_prev4 !== null &&
    p.severe >= RULES.SEVERE_RATIO * p.severe_baseline_prev4 &&
    p.severe - p.severe_baseline_prev4 >= RULES.SEVERE_MIN_EXCESS
  ) {
    signals.push({
      key: "severe_above_baseline",
      label: "Severe cases above recent baseline",
      detail: `${fmt(p.severe)} severe malaria cases, against a previous 4-week average of ${fmt(p.severe_baseline_prev4, 1)}.`,
    });
  }

  if (p.deaths !== null && p.deaths > 0) {
    observations.push({
      key: "deaths_recorded",
      label: "Malaria deaths recorded",
      detail: `${plural(p.deaths, "malaria death")} recorded this week. Requires verification through death review.`,
    });
  }

  // A signal must be anchored in confirmed cases; positivity and severe cases corroborate.
  const caseBased = signals.some((s) => CASE_SIGNALS.includes(s.key));
  if (!caseBased && signals.length) {
    observations.unshift(...signals.map((s) => ({ ...s, label: `${s.label} (no case-based signal)` })));
    signals.length = 0;
  }
  const level: SignalLevel =
    !p.complete || p.baseline_prev4 === null
      ? "INSUFFICIENT"
      : !caseBased
        ? "NONE"
        : signals.length >= 2
          ? "ELEVATED"
          : "WATCH";

  if (level === "ELEVATED" || level === "WATCH") {
    const above = (v: number | null, ref: number | null) =>
      v !== null && ref !== null && ref > 0 && v >= ref * (1 + RULES.CONTEXT_ABOVE_PCT / 100)
        ? rnd(((v - ref) / ref) * 100, 1)
        : null;
    const rain = above(p.rainfall_4wk_avg, refs.rainfall_4wk_avg);
    if (rain !== null) {
      context.push({
        key: "rainfall_elevated",
        label: "Rainfall elevated",
        detail: `Rainfall over the past 4 weeks averaged ${fmt(p.rainfall_4wk_avg, 1)} mm/week, ${fmt(rain, 1)}% above the dataset-period average (${fmt(refs.rainfall_4wk_avg, 1)} mm/week).`,
      });
    }
    const mosq = above(p.mosquito_density, refs.mosquito_density);
    if (mosq !== null) {
      context.push({
        key: "mosquito_density_elevated",
        label: "Mosquito density elevated",
        detail: `Mosquito density index ${fmt(p.mosquito_density, 2)}, ${fmt(mosq, 1)}% above the dataset-period average (${fmt(refs.mosquito_density, 2)}).`,
      });
    }
    const larv = above(p.larval_density, refs.larval_density);
    if (larv !== null) {
      context.push({
        key: "larval_density_elevated",
        label: "Larval density elevated",
        detail: `Larval density index ${fmt(p.larval_density, 2)}, ${fmt(larv, 1)}% above the dataset-period average (${fmt(refs.larval_density, 2)}).`,
      });
    }
  }

  if (!p.complete) {
    quality.push({
      key: "incomplete_week",
      label: "Incomplete district reporting",
      detail: `${p.districts_reporting} of ${p.districts_expected} districts reported this week, so early-warning rules were not applied to the combined figures.`,
    });
  }
  if (p.reporting_completeness_pct === null) {
    quality.push({
      key: "completeness_missing",
      label: "Reporting completeness not recorded",
      detail: "The completeness of reporting for this week is unknown; interpret with caution.",
    });
  } else if (p.reporting_completeness_pct < RULES.COMPLETENESS_MIN_PCT) {
    quality.push({
      key: "completeness_low",
      label: "Low reporting completeness",
      detail: `Reporting completeness was ${fmt(p.reporting_completeness_pct, 1)}% (below ${RULES.COMPLETENESS_MIN_PCT}%). Interpret with caution: missing reports can distort the signal.`,
    });
  } else {
    quality.push({
      key: "completeness_sufficient",
      label: "Reporting completeness sufficient",
      detail: `${fmt(p.reporting_completeness_pct, 1)}% of expected reports were received.`,
    });
  }
  if (p.reporting_delay_days !== null && p.reporting_delay_days > RULES.DELAY_MAX_DAYS) {
    quality.push({
      key: "reporting_delay",
      label: "Reporting delays",
      detail: `Reports arrived on average ${fmt(p.reporting_delay_days, 1)} days late (more than ${RULES.DELAY_MAX_DAYS}).`,
    });
  }
  if (
    p.facilities_reporting !== null &&
    p.facilities_expected !== null &&
    p.facilities_reporting < p.facilities_expected
  ) {
    quality.push({
      key: "facilities_missing",
      label: "Not all facilities reported",
      detail: `${fmt(p.facilities_reporting)} of ${fmt(p.facilities_expected)} expected facilities reported.`,
    });
  }

  return { level, signals, observations, context, quality };
}

function seriesFor(records: WeekRecord[], districts: string[], place: string): WeekPoint[] {
  const points = buildSeries(records, districts);
  addFeatures(points);
  const refs = periodRefs(points);
  for (const p of points) p.signal = evaluateSignal(p, place, refs);
  return points;
}

// ----------------------------------------------------------------------------- alerts
function buildAlerts(district: string, points: WeekPoint[]): SurveillanceAlert[] {
  const last = points.length ? points[points.length - 1].week_start : null;
  const out: SurveillanceAlert[] = [];
  for (const p of points) {
    const s = p.signal;
    if (s.level !== "ELEVATED" && s.level !== "WATCH") continue;
    const wk = p.epi_week === null ? p.week_start : `epi week ${p.epi_week}`;
    const headline =
      s.level === "ELEVATED"
        ? `Elevated signal — ${district}, ${wk}`
        : `Increased surveillance attention — ${district}, ${wk}`;

    const has = (k: string) => s.signals.some((x) => x.key === k);
    let lead: string;
    if (has("cases_above_baseline"))
      lead = `Confirmed malaria cases are ${fmt(p.change_vs_baseline_pct, 1)}% above the recent 4-week average in ${district}.`;
    else lead = `An unusual increase in confirmed malaria cases was observed in ${district} (${fmt(p.z_prev8, 2)} SD above the previous 8 weeks).`;
    if (has("unusual_increase") && s.context.some((c) => c.key === "rainfall_elevated"))
      lead += " The unusual increase coincides with elevated rainfall.";
    const summary = `${lead} Requires verification by the district health team.`;

    const verify = [
      `Check facility registers for the week of ${p.week_start} to confirm the reported counts (${fmt(p.confirmed)} confirmed, ${fmt(p.tested)} tested).`,
    ];
    if (p.reporting_completeness_pct !== null)
      verify.push(
        `Confirm whether late or missing reports change the picture (completeness ${fmt(p.reporting_completeness_pct, 1)}%, ${fmt(p.facilities_reporting)} of ${fmt(p.facilities_expected)} facilities reported).`,
      );
    if (has("positivity_increased"))
      verify.push(`Review testing practice for the week (positivity ${fmt(p.positivity_pct, 2)}%, testing rate ${fmt(p.testing_rate_pct, 2)}%).`);
    if (p.act_stock_days !== null || p.rdt_stock_days !== null)
      verify.push(
        `Check case-management stock: ACT ${fmt(p.act_stock_days)} days, RDT ${fmt(p.rdt_stock_days)} days${p.stockout_days ? `, ${plural(p.stockout_days, "stockout day")} recorded` : ""}.`,
      );
    verify.push("Decide with the district team whether field investigation or a response is needed.");

    out.push({
      id: `${district}-${p.week_start}`,
      district,
      province: provinceOf(district),
      week_start: p.week_start,
      epi_week: p.epi_week,
      level: s.level,
      headline,
      summary,
      signals: s.signals,
      observations: s.observations,
      context: s.context,
      quality: s.quality,
      verify,
      isLatestWeek: p.week_start === last,
      file_alert_label: p.file_alert_label,
    });
  }
  return out;
}

// ----------------------------------------------------------------------------- totals
function totalsFor(points: WeekPoint[]): Totals {
  const missing: Record<string, number> = {};
  const sumOf = (name: string, get: (p: WeekPoint) => number | null) => {
    const vals = points.map(get);
    const nn = nonNull(vals);
    missing[name] = vals.length - nn.length;
    return nn.length ? rnd(add(nn), 2) : null;
  };
  const pairRatio = (a: (p: WeekPoint) => number | null, b: (p: WeekPoint) => number | null, scale: number) => {
    let sa = 0;
    let sb = 0;
    let n = 0;
    for (const p of points) {
      const x = a(p);
      const y = b(p);
      if (x === null || y === null) continue;
      sa += x;
      sb += y;
      n++;
    }
    return n && sb > 0 ? rnd((sa / sb) * scale, 2) : null;
  };
  const popMean = mean(nonNull(points.map((p) => p.population)));
  const confirmed = sumOf("confirmed", (p) => p.confirmed);

  return {
    weeks: points.length,
    partial_weeks: points.filter((p) => !p.complete).length,
    suspected: sumOf("suspected", (p) => p.suspected),
    tested: sumOf("tested", (p) => p.tested),
    confirmed,
    severe: sumOf("severe", (p) => p.severe),
    deaths: sumOf("deaths", (p) => p.deaths),
    admissions: sumOf("admissions", (p) => p.admissions),
    outpatient: sumOf("outpatient", (p) => p.outpatient),
    positivity_pct: pairRatio((p) => p.confirmed, (p) => p.tested, 100),
    testing_rate_pct: pairRatio((p) => p.tested, (p) => p.suspected, 100),
    incidence_per_1000: confirmed !== null && popMean ? rnd((confirmed / popMean) * 1000, 2) : null,
    severe_pct_of_confirmed: pairRatio((p) => p.severe, (p) => p.confirmed, 100),
    deaths_per_1000_confirmed: pairRatio((p) => p.deaths, (p) => p.confirmed, 1000),
    admissions_per_100_confirmed: pairRatio((p) => p.admissions, (p) => p.confirmed, 100),
    opd_malaria_share_pct: pairRatio((p) => p.confirmed, (p) => p.outpatient, 100),
    stockout_days: sumOf("stockout_days", (p) => p.stockout_days),
    missing_weeks: missing,
  };
}

// ----------------------------------------------------------------------------- relationships
const REL_VARS: [keyof WeekPoint, string, LagCorrelation["group"], string][] = [
  ["rainfall_mm", "Rainfall", "environment", "mm/week"],
  ["temperature_c", "Mean temperature", "environment", "°C"],
  ["humidity_pct", "Relative humidity", "environment", "%"],
  ["ndvi", "NDVI (vegetation)", "environment", "index"],
  ["mosquito_density", "Mosquito density", "environment", "index"],
  ["larval_density", "Larval density", "environment", "index"],
  ["mobility_index", "Human mobility", "environment", "index"],
  ["bed_net_coverage_pct", "Bed-net coverage", "prevention", "%"],
  ["irs_pct", "Indoor residual spraying", "prevention", "%"],
];

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < RULES.MIN_CORRELATION_PAIRS) return null;
  const mx = mean(xs) as number;
  const my = mean(ys) as number;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

function relationships(points: WeekPoint[]): LagCorrelation[] {
  return REL_VARS.map(([key, label, group, unit]) => {
    const lags: LagCorrelation["lags"] = [];
    for (let lag = 0; lag <= RULES.MAX_LAG_WEEKS; lag++) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (let i = lag; i < points.length; i++) {
        const x = points[i - lag][key] as number | null;
        const y = points[i].confirmed;
        if (x === null || y === null) continue;
        xs.push(x);
        ys.push(y);
      }
      lags.push({ lag, r: rndN(pearson(xs, ys), 3), n: xs.length });
    }
    let best: LagCorrelation["best"] = null;
    for (const l of lags) {
      if (l.r === null) continue;
      if (!best || Math.abs(l.r) > Math.abs(best.r)) best = { lag: l.lag, r: l.r, n: l.n };
    }
    const a = best ? Math.abs(best.r) : 0;
    const strength: LagCorrelation["strength"] = !best
      ? "insufficient"
      : a >= 0.5
        ? "strong"
        : a >= 0.3
          ? "moderate"
          : "weak";
    return { variable: key as string, label, group, unit, lags, best, strength };
  });
}

// ----------------------------------------------------------------------------- per-district status & prioritisation
const LEVEL_RANK: Record<SignalLevel, number> = { ELEVATED: 0, WATCH: 1, NONE: 2, INSUFFICIENT: 3 };

function recentIndicators(s: WeekPoint[]) {
  const last4 = s.slice(-4);
  const last = s.length ? s[s.length - 1] : null;
  const conf = last4.map((p) => p.confirmed);
  const tested = last4.map((p) => p.tested);
  const incidence =
    last4.length === 4 && conf.every((x) => x !== null) && last?.population
      ? rnd((add(conf as number[]) / last.population) * 1000, 2)
      : null;
  const positivity =
    last4.length === 4 && conf.every((x) => x !== null) && tested.every((x) => x !== null) && add(tested as number[]) > 0
      ? rnd((add(conf as number[]) / add(tested as number[])) * 100, 2)
      : null;
  const stockout = nonNull(last4.map((p) => p.stockout_days));
  return { last, incidence, positivity, stockoutRecent: stockout.length ? add(stockout) : null };
}

function prioritisation(perDistrict: Map<string, WeekPoint[]>): PriorityRow[] {
  const rows = [...perDistrict.entries()].map(([district, s]) => {
    const { last, incidence, positivity, stockoutRecent } = recentIndicators(s);
    const level = last?.signal.level ?? "INSUFFICIENT";
    const points: string[] = [];
    if (level === "ELEVATED") points.push("Elevated signal in the latest week");
    if (level === "WATCH") points.push("Watch signal in the latest week");
    if (last?.bed_net_coverage_pct != null && last.bed_net_coverage_pct < RULES.NET_COVERAGE_REVIEW_PCT)
      points.push(`Bed-net coverage ${fmt(last.bed_net_coverage_pct, 1)}% (below ${RULES.NET_COVERAGE_REVIEW_PCT}%)`);
    if (last?.irs_pct != null && last.irs_pct < RULES.IRS_COVERAGE_REVIEW_PCT)
      points.push(`IRS coverage ${fmt(last.irs_pct, 1)}% (below ${RULES.IRS_COVERAGE_REVIEW_PCT}%)`);
    if (last?.act_stock_days != null && last.act_stock_days < RULES.STOCK_REVIEW_DAYS)
      points.push(`ACT stock ${fmt(last.act_stock_days)} days (below ${RULES.STOCK_REVIEW_DAYS})`);
    if (last?.rdt_stock_days != null && last.rdt_stock_days < RULES.STOCK_REVIEW_DAYS)
      points.push(`RDT stock ${fmt(last.rdt_stock_days)} days (below ${RULES.STOCK_REVIEW_DAYS})`);
    if (stockoutRecent) points.push(`${plural(stockoutRecent, "stockout day")} in the last 4 weeks`);
    if (last?.reporting_completeness_pct != null && last.reporting_completeness_pct < RULES.COMPLETENESS_MIN_PCT)
      points.push(`Reporting completeness ${fmt(last.reporting_completeness_pct, 1)}% (below ${RULES.COMPLETENESS_MIN_PCT}%)`);
    return {
      rank: 0,
      district,
      province: provinceOf(district),
      level,
      recent_incidence_per_1000: incidence,
      recent_positivity_pct: positivity,
      bed_net_coverage_pct: last?.bed_net_coverage_pct ?? null,
      irs_pct: last?.irs_pct ?? null,
      act_stock_days: last?.act_stock_days ?? null,
      rdt_stock_days: last?.rdt_stock_days ?? null,
      review_points: points,
    } as PriorityRow;
  });
  rows.sort((a, b) => {
    if (LEVEL_RANK[a.level] !== LEVEL_RANK[b.level]) return LEVEL_RANK[a.level] - LEVEL_RANK[b.level];
    const ia = a.recent_incidence_per_1000;
    const ib = b.recent_incidence_per_1000;
    if (ia !== ib) {
      if (ia === null) return 1;
      if (ib === null) return -1;
      return ib - ia;
    }
    return a.district < b.district ? -1 : a.district > b.district ? 1 : 0;
  });
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

function districtStatuses(
  districts: string[],
  perDistrict: Map<string, WeekPoint[]>,
  alerts: SurveillanceAlert[],
  today: string,
): DistrictStatus[] {
  return districts.map((d) => {
    const s = perDistrict.get(d);
    if (!s || !s.length) {
      return {
        district: d,
        province: provinceOf(d),
        hasData: false,
        weeks: 0,
        first_week: null,
        latest_week: null,
        days_since_latest: null,
        stale: false,
        latest_confirmed: null,
        latest_change_vs_baseline_pct: null,
        latest_level: null,
        recent_incidence_per_1000: null,
        recent_positivity_pct: null,
        mean_reporting_completeness_pct: null,
        alerts: 0,
        totals: null,
      };
    }
    const { last, incidence, positivity } = recentIndicators(s);
    const since = daysBetween((last as WeekPoint).week_start, today);
    return {
      district: d,
      province: provinceOf(d),
      hasData: true,
      weeks: s.length,
      first_week: s[0].week_start,
      latest_week: (last as WeekPoint).week_start,
      days_since_latest: since,
      stale: since > RULES.STALE_AFTER_DAYS,
      latest_confirmed: last?.confirmed ?? null,
      latest_change_vs_baseline_pct: last?.change_vs_baseline_pct ?? null,
      latest_level: last?.signal.level ?? null,
      recent_incidence_per_1000: incidence,
      recent_positivity_pct: positivity,
      mean_reporting_completeness_pct: rndN(mean(nonNull(s.map((p) => p.reporting_completeness_pct))), 2),
      alerts: alerts.filter((a) => a.district === d).length,
      totals: totalsFor(s),
    };
  });
}

// ----------------------------------------------------------------------------- projection
/** Solve A x = b (small dense system) by Gaussian elimination with partial pivoting. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    if (piv !== c) {
      const tmp = M[c];
      M[c] = M[piv];
      M[piv] = tmp;
    }
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/** Ridge regression on standardised features; returns a predictor or null. */
function fitRidge(X: number[][], y: number[]): ((x: number[]) => number) | null {
  const n = X.length;
  const k = X[0].length;
  const mu: number[] = [];
  const sd: number[] = [];
  for (let j = 0; j < k; j++) {
    const col = X.map((r) => r[j]);
    const m = mean(col) as number;
    let s = 0;
    for (const v of col) s += (v - m) * (v - m);
    const d = Math.sqrt(s / n);
    mu.push(m);
    sd.push(d > 0 ? d : 1);
  }
  const ym = mean(y) as number;
  const Z = X.map((r) => r.map((v, j) => (v - mu[j]) / sd[j]));
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < k; i++) {
    const row: number[] = [];
    for (let j = 0; j < k; j++) {
      let s = 0;
      for (let t = 0; t < n; t++) s += Z[t][i] * Z[t][j];
      row.push(i === j ? s + RULES.FORECAST_RIDGE : s);
    }
    A.push(row);
    let s = 0;
    for (let t = 0; t < n; t++) s += Z[t][i] * (y[t] - ym);
    b.push(s);
  }
  const beta = solve(A, b);
  if (!beta) return null;
  return (x: number[]) => {
    let v = ym;
    for (let j = 0; j < k; j++) v += beta[j] * ((x[j] - mu[j]) / sd[j]);
    return v < 0 ? 0 : v;
  };
}

function projection(points: WeekPoint[]): Forecast {
  const n = points.length;
  const empty = (reason: string): Forecast => ({ available: false, reason, features: [], origin_week: null, horizons: [] });
  if (n < RULES.FORECAST_MIN_TRAIN + RULES.FORECAST_MIN_BACKTEST)
    return empty(`Needs at least ${RULES.FORECAST_MIN_TRAIN + RULES.FORECAST_MIN_BACKTEST} weeks of data.`);
  if (!points.every((p) => p.complete && p.confirmed !== null))
    return empty("Needs a complete weekly case series (no missing or partially reported weeks).");
  for (let i = 1; i < n; i++)
    if (daysBetween(points[i - 1].week_start, points[i].week_start) !== 7)
      return empty("Needs consecutive weeks with no gaps.");

  const y = points.map((p) => p.confirmed as number);
  const useRain = points.every((p) => p.rainfall_4wk_avg !== null);
  const feat = (t: number) =>
    useRain ? [y[t], y[t - 1], points[t].rainfall_4wk_avg as number] : [y[t], y[t - 1]];
  const features = ["Confirmed cases in the latest week", "Confirmed cases the week before"];
  if (useRain) features.push("4-week average rainfall");

  const fit = (h: number, origin: number) => {
    const X: number[][] = [];
    const Y: number[] = [];
    for (let t = 1; t + h <= origin; t++) {
      X.push(feat(t));
      Y.push(y[t + h]);
    }
    return X.length >= 8 ? fitRidge(X, Y) : null;
  };

  const last = n - 1;
  const horizons: ForecastHorizon[] = [];
  for (let h = 1; h <= RULES.FORECAST_MAX_H; h++) {
    const errs: number[] = [];
    const naive: number[] = [];
    const ape: number[] = [];
    for (let o = RULES.FORECAST_MIN_TRAIN; o + h <= last; o++) {
      const model = fit(h, o);
      if (!model) continue;
      const actual = y[o + h];
      const e = actual - model(feat(o));
      errs.push(e);
      naive.push(Math.abs(actual - y[o]));
      if (actual > 0) ape.push(Math.abs(e) / actual);
    }
    const nb = errs.length;
    const mae = nb ? (mean(errs.map(Math.abs)) as number) : null;
    const naiveMae = nb ? (mean(naive) as number) : null;
    const rmse = nb ? Math.sqrt(mean(errs.map((e) => e * e)) as number) : null;
    const skill = mae !== null && naiveMae ? (1 - mae / naiveMae) * 100 : null;
    const model = fit(h, last);
    const est = model ? model(feat(last)) : null;
    const shown = est !== null && nb >= RULES.FORECAST_MIN_BACKTEST && skill !== null && skill > 0;
    horizons.push({
      h,
      week_start: addDays(points[last].week_start, 7 * h),
      estimate: est === null ? null : rnd(est, 0),
      lower: est === null || rmse === null ? null : rnd(Math.max(0, est - 1.96 * rmse), 0),
      upper: est === null || rmse === null ? null : rnd(est + 1.96 * rmse, 0),
      shown,
      backtest: {
        n: nb,
        mae: rndN(mae, 1),
        mape_pct: ape.length ? rnd((mean(ape) as number) * 100, 1) : null,
        naive_mae: rndN(naiveMae, 1),
        skill_pct: rndN(skill, 1),
      },
    });
  }
  const anyShown = horizons.some((h) => h.shown);
  return {
    available: anyShown,
    reason: anyShown ? null : "The model did not outperform the naive estimate (next week = this week) in backtesting, so no projection is shown.",
    features,
    origin_week: points[last].week_start,
    horizons,
  };
}

// ----------------------------------------------------------------------------- data quality
function qualityFor(combined: Combined, districts: string[]): DataQuality {
  const rs = combined.records.filter((r) => districts.includes(r.district));
  const dates = rs.map((r) => r.week_start).sort();
  const weeksPer: Record<string, number> = {};
  for (const d of districts) {
    const n = rs.filter((r) => r.district === d).length;
    if (n) weeksPer[d] = n;
  }
  const missing_by_column = NUMERIC_COLUMNS.filter((c) => combined.supplied.includes(c)).map((c) => ({
    column: c as string,
    missing: rs.filter((r) => r[c] === null).length,
  }));
  const comp = nonNull(rs.map((r) => r.reporting_completeness_pct));
  const delay = nonNull(rs.map((r) => r.reporting_delay_days));
  const latestDate = dates.length ? dates[dates.length - 1] : null;
  const latest = rs.filter((r) => r.week_start === latestDate);
  const sumLatest = (get: (r: WeekRecord) => number | null) => {
    const v = latest.map(get);
    return v.length && v.every((x) => x !== null) ? add(v as number[]) : null;
  };
  const exp = sumLatest((r) => r.facilities_expected);
  const rep = sumLatest((r) => r.facilities_reporting);

  return {
    records: rs.length,
    districts: Object.keys(weeksPer),
    date_start: dates[0] ?? null,
    date_end: latestDate,
    weeks_per_district: weeksPer,
    missing_values_total: add(missing_by_column.map((c) => c.missing)),
    missing_by_column,
    columns_not_supplied: COLUMNS.filter((c) => !combined.supplied.includes(c)) as string[],
    reporting_completeness: {
      mean: rndN(mean(comp), 2),
      min: comp.length ? Math.min(...comp) : null,
      weeks_below_90: comp.filter((x) => x < RULES.COMPLETENESS_MIN_PCT).length,
    },
    reporting_delay_days: {
      mean: rndN(mean(delay), 2),
      max: delay.length ? Math.max(...delay) : null,
      weeks_above_3: delay.filter((x) => x > RULES.DELAY_MAX_DAYS).length,
    },
    facilities: {
      expected_latest: exp,
      reporting_latest: rep,
      reporting_rate_pct: exp && rep !== null ? rnd((rep / exp) * 100, 1) : null,
    },
    validation: combined.validation,
  };
}

// ----------------------------------------------------------------------------- method
export const METHOD: MethodRule[] = [
  {
    key: "ingestion",
    label: "Data ingestion",
    rule: "Uploaded CSV files are validated, cleaned and combined. Required columns: week_start, district, confirmed_malaria_cases; other surveillance columns are optional. Rows for unrecognised districts are excluded. When two uploads supply the same district-week, the most recent upload is used. Missing values are excluded from calculations, never filled in.",
  },
  {
    key: "baseline",
    label: "Recent baseline",
    rule: "Average of confirmed cases in the 4 weeks before the current week (the current week is not included). Needs 4 earlier, fully reported weeks.",
  },
  {
    key: "cases_above_baseline",
    label: "Cases above recent baseline",
    rule: `Confirmed cases are ${RULES.CASE_DEVIATION_PCT}% or more above the recent baseline.`,
  },
  {
    key: "unusual_increase",
    label: "Unusual increase (anomaly)",
    rule: `Confirmed cases are ${RULES.Z_THRESHOLD} or more standard deviations above the mean of the previous 8 weeks.`,
  },
  {
    key: "positivity_increased",
    label: "Positivity increased",
    rule: `Test positivity is ${RULES.POSITIVITY_RISE_PP} or more percentage points above its previous 4-week average.`,
  },
  {
    key: "severe_above_baseline",
    label: "Severe cases above recent baseline",
    rule: `Severe cases are at least ${RULES.SEVERE_RATIO}× and at least ${RULES.SEVERE_MIN_EXCESS} cases above their previous 4-week average.`,
  },
  {
    key: "level",
    label: "Signal level",
    rule: "A signal must include a case-based rule (cases above recent baseline, or unusual increase). Case-based rule plus at least one more rule → Elevated signal. One case-based rule alone → Watch (increased surveillance attention). Positivity or severe-case rises without a case-based rule are listed as observations, not alerts. Fewer than 4 earlier weeks, or incomplete district reporting → not evaluated.",
  },
  {
    key: "context",
    label: "Environmental context",
    rule: `Shown only when a signal is present: 4-week rainfall, mosquito density or larval density ${RULES.CONTEXT_ABOVE_PCT}% or more above its average over the data period. Context never raises the level on its own.`,
  },
  {
    key: "quality",
    label: "Data confidence",
    rule: `Reporting completeness below ${RULES.COMPLETENESS_MIN_PCT}%, reporting delay above ${RULES.DELAY_MAX_DAYS} days, facilities not reporting, or districts missing from a combined week are shown as cautions. Data is flagged as stale when no new week has been reported for more than ${RULES.STALE_AFTER_DAYS} days.`,
  },
  {
    key: "aggregation",
    label: "Province and national figures",
    rule: "Counts are summed over the districts that reported; positivity, testing rate and incidence are recomputed from the summed counts; environmental and health-system indices are averaged across districts. Districts with no uploaded data are not included and are shown as not reporting.",
  },
  {
    key: "relationships",
    label: "Environmental and prevention relationships",
    rule: `Pearson correlation between confirmed cases and each variable 0–${RULES.MAX_LAG_WEEKS} weeks earlier. Association within the uploaded data only — not evidence of cause.`,
  },
  {
    key: "prioritisation",
    label: "Prevention prioritisation",
    rule: `Districts are ordered by latest signal level, then by incidence over the last 4 weeks. Review prompts list bed-net coverage below ${RULES.NET_COVERAGE_REVIEW_PCT}%, IRS below ${RULES.IRS_COVERAGE_REVIEW_PCT}%, ACT or RDT stock below ${RULES.STOCK_REVIEW_DAYS} days, recent stockouts and low reporting completeness.`,
  },
  {
    key: "projection",
    label: "Short-term projection (model estimate)",
    rule: `Ridge regression on this week's and last week's confirmed cases and 4-week rainfall, one model per horizon (1–${RULES.FORECAST_MAX_H} weeks). Backtested with rolling origins after ${RULES.FORECAST_MIN_TRAIN} weeks of history; a horizon is shown only if it has at least ${RULES.FORECAST_MIN_BACKTEST} backtest points and beats the naive estimate (next week = this week). The range is ±1.96 × backtest RMSE. Estimates are not observations.`,
  },
];

// ----------------------------------------------------------------------------- entry
export function analyze(combined: Combined, scopeRaw: string | null | undefined, today: string): Analytics {
  const records = combined.records;
  const scope = resolveScope(records, scopeRaw);
  const withData = new Set(records.map((r) => r.district));
  const inScope = districtsOf(scope);
  const dataDistricts = inScope.filter((d) => withData.has(d));
  const place = placeOf(scope);

  const weekly = dataDistricts.length ? seriesFor(records, dataDistricts, place) : [];
  const perDistrict = new Map(dataDistricts.map((d) => [d, seriesFor(records, [d], `in ${d}`)]));
  const latest = weekly.length ? weekly[weekly.length - 1] : null;

  const alerts = dataDistricts
    .flatMap((d) => buildAlerts(d, perDistrict.get(d) as WeekPoint[]))
    .sort((a, b) =>
      a.week_start === b.week_start
        ? a.district < b.district
          ? -1
          : 1
        : a.week_start < b.week_start
          ? 1
          : -1,
    );

  const quality = qualityFor(combined, dataDistricts);
  const districts = districtStatuses(inScope, perDistrict, alerts, today);
  const coverage: Coverage = {
    districts_total: inScope.length,
    districts_with_data: dataDistricts.length,
    districts_reporting_latest_week: latest ? latest.districts_reporting : 0,
    by_province: PROVINCES.filter((p) => DISTRICTS.some((d) => d.province === p && inScope.includes(d.district))).map(
      (p) => {
        const ds = DISTRICTS.filter((d) => d.province === p && inScope.includes(d.district));
        return { province: p, districts_total: ds.length, districts_with_data: ds.filter((d) => withData.has(d.district)).length };
      },
    ),
  };
  const since = latest ? daysBetween(latest.week_start, today) : null;

  const counts = { ELEVATED: 0, WATCH: 0 };
  for (const p of weekly) if (p.signal.level === "ELEVATED" || p.signal.level === "WATCH") counts[p.signal.level]++;
  const accepted = combined.sources.filter((s) => s.accepted);
  const errors = combined.validation.filter((v) => v.level === "error").length;
  const warnings = combined.validation.filter((v) => v.level === "warn").length;
  const zScored = weekly.filter((p) => p.z_prev8 !== null);
  const forecast = projection(weekly);

  const pipeline: PipelineStage[] = [
    {
      stage: "Data ingestion",
      detail: `${plural(accepted.length, "dataset")} · ${add(accepted.map((s) => s.cleaning.rowsRead))} rows uploaded`,
    },
    {
      stage: "Data validation",
      detail: `${combined.validation.length} checks on the combined data · ${plural(errors, "error")}, ${plural(warnings, "warning")}`,
    },
    {
      stage: "Data cleaning",
      detail: `${plural(records.length, "district-week record")} kept · ${add(accepted.map((s) => s.cleaning.rowsRead - s.cleaning.rowsKept))} rows excluded · ${add(accepted.map((s) => s.cleaning.valuesSetToNull))} values set to missing`,
    },
    {
      stage: "Feature preparation",
      detail: `${plural(weekly.length, "weekly point")} for ${scope.label} from ${plural(dataDistricts.length, "reporting district")} · rates and 4-week moving average`,
    },
    {
      stage: "Trend analysis",
      detail: latest
        ? `Latest week ${latest.week_start}: ${fmt(latest.confirmed)} confirmed cases · 4-week moving average ${fmt(latest.cases_ma4, 1)}`
        : "No data",
    },
    {
      stage: "Baseline comparison",
      detail: `${plural(weekly.filter((p) => p.baseline_prev4 !== null).length, "week")} compared with the previous 4-week average`,
    },
    {
      stage: "Anomaly detection",
      detail: `${plural(zScored.length, "week")} scored against the previous 8 weeks · ${zScored.filter((p) => (p.z_prev8 as number) >= RULES.Z_THRESHOLD).length} at or above ${RULES.Z_THRESHOLD} SD`,
    },
    {
      stage: "Risk signal",
      detail: `${plural(counts.ELEVATED, "elevated week")}, ${plural(counts.WATCH, "watch week")} · latest week: ${latest ? levelLabel(latest.signal.level) : "—"}`,
    },
    { stage: "Explainable alert", detail: `${plural(alerts.length, "district alert")}, each listing the rules that fired and the values behind them` },
    { stage: "Human review", detail: "Every alert requires verification and a recorded decision by the district health team" },
  ];

  return {
    scope,
    scopeOptions: scopeOptions(records),
    districtsInScope: inScope,
    districtsWithData: dataDistricts,
    hasData: dataDistricts.length > 0,
    today,
    sources: combined.sources,
    coverage,
    freshness: {
      latest_week: latest?.week_start ?? null,
      days_since_latest: since,
      stale: since !== null && since > RULES.STALE_AFTER_DAYS,
    },
    period: { start: quality.date_start, end: quality.date_end, weeks: weekly.length },
    latest,
    weekly,
    totals: totalsFor(weekly),
    districts,
    districtSignals: dataDistricts.map((d) => {
      const s = perDistrict.get(d) as WeekPoint[];
      return { district: d, province: provinceOf(d), latest: s.length ? s[s.length - 1] : null };
    }),
    alerts,
    relationships: relationships(weekly),
    prioritisation: prioritisation(perDistrict),
    forecast,
    quality,
    pipeline,
    method: METHOD,
  };
}

export function levelLabel(l: SignalLevel): string {
  return l === "ELEVATED"
    ? "Elevated signal"
    : l === "WATCH"
      ? "Watch"
      : l === "NONE"
        ? "No signal"
        : "Not evaluated";
}
