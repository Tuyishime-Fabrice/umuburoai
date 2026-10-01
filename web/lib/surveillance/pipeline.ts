// Surveillance analytics pipeline:
// CSV → validation → cleaning → feature preparation → trend analysis → baseline
// comparison → anomaly detection → risk signal → explainable alert → human review.
//
// Pure functions only (no I/O) so the same input always gives the same output.
// backend/analytics.py implements the identical algorithm for the API; keep the two
// in step (scripts compare their outputs).

import type {
  Analytics,
  CleaningSummary,
  DataQuality,
  DistrictComparison,
  LagCorrelation,
  MethodRule,
  NumericField,
  PipelineStage,
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
  MIN_CORRELATION_PAIRS: 10,
  MAX_LAG_WEEKS: 8,
} as const;

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
// Fields with no lower bound below zero beyond these special cases.
const SIGNED_FIELDS: NumericField[] = ["mean_temperature_c", "ndvi", "cases_change_vs_4wk_avg_pct"];

const NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ----------------------------------------------------------------------------- helpers
/** Round half up (JavaScript Math.round semantics) to `d` decimals. */
export function rnd(x: number, d: number): number {
  const f = 10 ** d;
  return Math.floor(x * f + 0.5) / f;
}
const rndN = (x: number | null, d: number) => (x === null ? null : rnd(x, d));

function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
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

function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

const fmt = (x: number | null, d = 0) =>
  x === null
    ? "—"
    : x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

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
  // drop blank lines
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// ----------------------------------------------------------------------------- validate + clean
export interface CleanResult {
  records: WeekRecord[];
  validation: ValidationCheck[];
  cleaning: CleaningSummary;
  header: string[];
}

export function validateAndClean(text: string): CleanResult {
  const table = parseCsv(text);
  const header = (table[0] ?? []).map((h) => h.trim());
  const body = table.slice(1);
  const validation: ValidationCheck[] = [];

  const missingCols = COLUMNS.filter((c) => !header.includes(c));
  const extraCols = header.filter((h) => !(COLUMNS as string[]).includes(h));
  validation.push(
    missingCols.length
      ? {
          check: "Required columns",
          level: "error",
          detail: `Missing column(s): ${missingCols.join(", ")}. Analytics that need them show as missing.`,
          count: missingCols.length,
        }
      : {
          check: "Required columns",
          level: "ok",
          detail: `All ${COLUMNS.length} expected columns are present.`,
          count: 0,
        },
  );
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
  let invalidNumbers = 0;
  const invalidNumberCols = new Set<string>();
  let outOfRange = 0;
  const outOfRangeCols = new Set<string>();
  const seen = new Set<string>();
  const records: WeekRecord[] = [];

  for (const r of body) {
    const week_start = cell(r, "week_start");
    const district = cell(r, "district");
    if (!isValidDate(week_start) || !district) {
      droppedInvalidKey++;
      continue;
    }
    const key = `${district.toLowerCase()}|${week_start}`;
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
          invalidNumberCols.add(col);
        }
      }
      if (v !== null && !inRange(col, v)) {
        outOfRange++;
        outOfRangeCols.add(col);
        v = null;
      }
      rec[col] = v;
    }
    records.push(rec);
  }

  records.sort((a, b) =>
    a.district === b.district
      ? a.week_start < b.week_start
        ? -1
        : a.week_start > b.week_start
          ? 1
          : 0
      : a.district < b.district
        ? -1
        : 1,
  );

  validation.push({
    check: "Row keys (date, district)",
    level: droppedInvalidKey ? "warn" : "ok",
    detail: droppedInvalidKey
      ? `${plural(droppedInvalidKey, "row")} dropped: week_start is not a valid YYYY-MM-DD date or district is empty.`
      : "Every row has a valid week_start date and a district.",
    count: droppedInvalidKey,
  });
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
      ? `${plural(invalidNumbers, "non-numeric value")} set to missing (${[...invalidNumberCols].join(", ")}).`
      : "All numeric columns contain numbers.",
    count: invalidNumbers,
  });
  validation.push({
    check: "Value ranges",
    level: outOfRange ? "warn" : "ok",
    detail: outOfRange
      ? `${plural(outOfRange, "out-of-range value")} set to missing (${[...outOfRangeCols].join(", ")}).`
      : "Percentages are within 0–100, counts are non-negative, NDVI is within −1 to 1.",
    count: outOfRange,
  });

  let emptyCells = 0;
  for (const rec of records) for (const c of NUMERIC_COLUMNS) if (rec[c] === null) emptyCells++;
  const nulledByUs = invalidNumbers + outOfRange;
  validation.push({
    check: "Missing values",
    level: emptyCells ? "warn" : "ok",
    detail: emptyCells
      ? `${plural(emptyCells, "cell")} missing after cleaning (${nulledByUs} set to missing by validation). Missing values are excluded from calculations, never filled in.`
      : "No missing values.",
    count: emptyCells,
  });

  validation.push(...consistencyChecks(records));
  validation.push(continuityCheck(records));

  return {
    records,
    validation,
    header,
    cleaning: {
      rowsRead: body.length,
      rowsKept: records.length,
      droppedInvalidKey,
      droppedDuplicate,
      valuesSetToNull: nulledByUs,
    },
  };
}

function inRange(col: NumericField, v: number): boolean {
  if (col === "ndvi") return v >= -1 && v <= 1;
  if (col === "mean_temperature_c") return v >= -10 && v <= 50;
  if (col === "cases_change_vs_4wk_avg_pct") return true;
  if (col === "epidemiological_week") return Number.isInteger(v) && v >= 1 && v <= 53;
  if (col === "alert_label") return v === 0 || v === 1;
  if (PCT_FIELDS.includes(col)) return v >= 0 && v <= 100;
  if (SIGNED_FIELDS.includes(col)) return true;
  return v >= 0;
}

function consistencyChecks(records: WeekRecord[]): ValidationCheck[] {
  const out: ValidationCheck[] = [];

  const logical: [string, (r: WeekRecord) => boolean | null][] = [
    ["tested ≤ suspected", (r) => cmp(r.tested_cases, r.suspected_malaria_cases)],
    ["confirmed ≤ tested", (r) => cmp(r.confirmed_malaria_cases, r.tested_cases)],
    ["facilities reporting ≤ expected", (r) => cmp(r.facilities_reporting, r.facilities_expected)],
  ];
  for (const [label, fn] of logical) {
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

  // Derived columns in the file vs recomputation from the raw counts.
  const derived: {
    check: string;
    tol: number;
    unit: string;
    note: string;
    file: (r: WeekRecord) => number | null;
    calc: (r: WeekRecord, i: number, rs: WeekRecord[]) => number | null;
  }[] = [
    {
      check: "positive_tests_pct = confirmed ÷ tested",
      tol: 0.05,
      unit: " pp",
      note: "Single district-weeks show the file's value; combined figures are recomputed from counts.",
      file: (r) => r.positive_tests_pct,
      calc: (r) => ratio(r.confirmed_malaria_cases, r.tested_cases, 100),
    },
    {
      check: "testing_rate_pct = tested ÷ suspected",
      tol: 0.05,
      unit: " pp",
      note: "",
      file: (r) => r.testing_rate_pct,
      calc: (r) => ratio(r.tested_cases, r.suspected_malaria_cases, 100),
    },
    {
      check: "incidence_per_1000 = confirmed ÷ population × 1,000",
      tol: 0.001,
      unit: "",
      note: "",
      file: (r) => r.incidence_per_1000,
      calc: (r) => ratio(r.confirmed_malaria_cases, r.population_at_risk, 1000),
    },
    {
      check: "confirmed_cases_4wk_avg = trailing 4-week mean (incl. current week)",
      tol: 0.05,
      unit: "",
      note: "The system's baseline uses the 4 weeks before the current week instead, so a rise is not averaged into its own baseline.",
      file: (r) => r.confirmed_cases_4wk_avg,
      calc: (_r, i, rs) => trailingMean(rs, i, (x) => x.confirmed_malaria_cases),
    },
    {
      check: "cases_change_vs_4wk_avg_pct matches the file's 4-week average",
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

function cmp(a: number | null, b: number | null): boolean | null {
  return a === null || b === null ? null : a <= b;
}

function ratio(num: number | null, den: number | null, scale: number): number | null {
  return num === null || den === null || den === 0 ? null : (num / den) * scale;
}

function trailingMean<T>(rs: T[], i: number, get: (x: T) => number | null): number | null {
  if (get(rs[i]) === null) return null;
  return mean(nonNull(rs.slice(Math.max(0, i - 3), i + 1).map(get)));
}

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
 * Build the weekly series for a set of districts. One district: values exactly as in
 * the file. Several districts: counts are summed (missing if any district is missing),
 * rates are recomputed from the summed counts, and indices are averaged.
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
    const complete = rs.length === districts.length;
    const p = {
      week_start: w,
      epi_week: rs[0].epidemiological_week,
      districts_reporting: rs.length,
    } as WeekPoint;

    for (const [out, col, agg] of SERIES_FIELDS) {
      const vals = rs.map((r) => r[col]);
      const nn = nonNull(vals);
      let v: number | null;
      if (agg === "sum") v = complete && nn.length === vals.length ? nn.reduce((s, x) => s + x, 0) : null;
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
      p.file_alert_label =
        complete && labels.every((x) => x !== null)
          ? (labels as number[]).reduce((s, x) => s + x, 0)
          : null;
    }
    points.push(p);
  }
  return points;
}

// ----------------------------------------------------------------------------- features
function prevWindow(points: WeekPoint[], i: number, n: number, get: (p: WeekPoint) => number | null) {
  if (i < n) return null;
  const vals = points.slice(i - n, i).map(get);
  return vals.every((v) => v !== null) ? (vals as number[]) : null;
}

function addFeatures(points: WeekPoint[]): void {
  points.forEach((p, i) => {
    p.cases_ma4 = rndN(trailingMean(points, i, (x) => x.confirmed), 2);

    const prev4 = prevWindow(points, i, 4, (x) => x.confirmed);
    const b = prev4 ? (mean(prev4) as number) : null;
    p.baseline_prev4 = rndN(b, 2);
    p.change_vs_baseline_pct =
      b !== null && b > 0 && p.confirmed !== null ? rnd(((p.confirmed - b) / b) * 100, 1) : null;

    const prev8 = prevWindow(points, i, 8, (x) => x.confirmed);
    const m8 = prev8 ? mean(prev8) : null;
    const sd8 = prev8 ? sampleSd(prev8) : null;
    p.baseline_prev8_mean = rndN(m8, 2);
    p.baseline_prev8_sd = rndN(sd8, 2);
    p.z_prev8 =
      m8 !== null && sd8 !== null && sd8 > 0 && p.confirmed !== null
        ? rnd((p.confirmed - m8) / sd8, 2)
        : null;

    const pos4 = prevWindow(points, i, 4, (x) => x.positivity_pct);
    const pb = pos4 ? (mean(pos4) as number) : null;
    p.positivity_baseline_prev4 = rndN(pb, 2);
    p.positivity_change_pp =
      pb !== null && p.positivity_pct !== null ? rnd(p.positivity_pct - pb, 2) : null;

    const sev4 = prevWindow(points, i, 4, (x) => x.severe);
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
      detail: `Confirmed malaria cases (${fmt(p.confirmed)}) are ${fmt(p.change_vs_baseline_pct, 1)}% above the previous 4-week average (${fmt(p.baseline_prev4, 1)}) in ${place}.`,
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
    observations.unshift(
      ...signals.map((s) => ({ ...s, label: `${s.label} (no case-based signal)` })),
    );
    signals.length = 0;
  }
  const level: SignalLevel =
    p.baseline_prev4 === null
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
    else if (has("unusual_increase"))
      lead = `An unusual increase in confirmed malaria cases was observed in ${district} (${fmt(p.z_prev8, 2)} SD above the previous 8 weeks).`;
    else lead = s.signals[0].detail;
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
    verify.push(
      `Check case-management stock: ACT ${fmt(p.act_stock_days)} days, RDT ${fmt(p.rdt_stock_days)} days${p.stockout_days ? `, ${plural(p.stockout_days, "stockout day")} recorded` : ""}.`,
    );
    verify.push("Decide with the district team whether field investigation or a response is needed.");

    out.push({
      id: `${district}-${p.week_start}`,
      district,
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
    return nn.length ? rnd(nn.reduce((s, x) => s + x, 0), 2) : null;
  };
  const both = (a: (p: WeekPoint) => number | null, b: (p: WeekPoint) => number | null) => {
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
    return n ? { a: sa, b: sb } : null;
  };
  const pos = both((p) => p.confirmed, (p) => p.tested);
  const tr = both((p) => p.tested, (p) => p.suspected);
  const popMean = mean(nonNull(points.map((p) => p.population)));
  const confirmed = sumOf("confirmed", (p) => p.confirmed);

  return {
    weeks: points.length,
    suspected: sumOf("suspected", (p) => p.suspected),
    tested: sumOf("tested", (p) => p.tested),
    confirmed,
    severe: sumOf("severe", (p) => p.severe),
    deaths: sumOf("deaths", (p) => p.deaths),
    admissions: sumOf("admissions", (p) => p.admissions),
    outpatient: sumOf("outpatient", (p) => p.outpatient),
    positivity_pct: pos && pos.b > 0 ? rnd((pos.a / pos.b) * 100, 2) : null,
    testing_rate_pct: tr && tr.b > 0 ? rnd((tr.a / tr.b) * 100, 2) : null,
    incidence_per_1000:
      confirmed !== null && popMean ? rnd((confirmed / popMean) * 1000, 2) : null,
    stockout_days: sumOf("stockout_days", (p) => p.stockout_days),
    missing_weeks: missing,
  };
}

// ----------------------------------------------------------------------------- relationships
const REL_VARS: [keyof WeekPoint, string, string][] = [
  ["rainfall_mm", "Rainfall", "mm/week"],
  ["temperature_c", "Mean temperature", "°C"],
  ["humidity_pct", "Relative humidity", "%"],
  ["ndvi", "NDVI (vegetation)", "index"],
  ["mosquito_density", "Mosquito density", "index"],
  ["larval_density", "Larval density", "index"],
  ["mobility_index", "Human mobility", "index"],
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
  return REL_VARS.map(([key, label, unit]) => {
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
      const r = pearson(xs, ys);
      lags.push({ lag, r: rndN(r, 3), n: xs.length });
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
    return { variable: key as string, label, unit, lags, best, strength };
  });
}

// ----------------------------------------------------------------------------- data quality
function qualityFor(clean: CleanResult, districts: string[]): DataQuality {
  const rs = clean.records.filter((r) => districts.includes(r.district));
  const dates = rs.map((r) => r.week_start).sort();
  const weeksPer: Record<string, number> = {};
  for (const d of districts) weeksPer[d] = rs.filter((r) => r.district === d).length;

  const missing_by_column = NUMERIC_COLUMNS.map((c) => ({
    column: c as string,
    missing: rs.filter((r) => r[c] === null).length,
  }));
  const comp = nonNull(rs.map((r) => r.reporting_completeness_pct));
  const delay = nonNull(rs.map((r) => r.reporting_delay_days));

  const latestDate = dates.length ? dates[dates.length - 1] : null;
  const latest = rs.filter((r) => r.week_start === latestDate);
  const sumLatest = (get: (r: WeekRecord) => number | null) => {
    const v = latest.map(get);
    return v.length && v.every((x) => x !== null) ? (v as number[]).reduce((s, x) => s + x, 0) : null;
  };
  const exp = sumLatest((r) => r.facilities_expected);
  const rep = sumLatest((r) => r.facilities_reporting);

  return {
    records: rs.length,
    districts,
    date_start: dates[0] ?? null,
    date_end: latestDate,
    weeks_per_district: weeksPer,
    missing_values_total: missing_by_column.reduce((s, c) => s + c.missing, 0),
    missing_by_column,
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
    validation: clean.validation,
    cleaning: clean.cleaning,
  };
}

// ----------------------------------------------------------------------------- method
export const METHOD: MethodRule[] = [
  {
    key: "baseline",
    label: "Recent baseline",
    rule: "Average of confirmed cases in the 4 weeks before the current week (the current week is not included). Needs 4 earlier weeks.",
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
    rule: "A signal must include a case-based rule (cases above recent baseline, or unusual increase). Case-based rule plus at least one more rule → Elevated signal. One case-based rule alone → Watch (increased surveillance attention). Positivity or severe-case rises without a case-based rule are listed as observations, not alerts. Fewer than 4 earlier weeks → Insufficient history.",
  },
  {
    key: "context",
    label: "Environmental context",
    rule: `Shown only when a signal is present: 4-week rainfall, mosquito density or larval density ${RULES.CONTEXT_ABOVE_PCT}% or more above its average over the dataset period. Context never raises the level on its own.`,
  },
  {
    key: "quality",
    label: "Data confidence",
    rule: `Reporting completeness below ${RULES.COMPLETENESS_MIN_PCT}%, reporting delay above ${RULES.DELAY_MAX_DAYS} days, or facilities not reporting are shown as cautions.`,
  },
  {
    key: "aggregation",
    label: "All districts combined",
    rule: "Counts are summed (missing if any district is missing that week); positivity, testing rate and incidence are recomputed from the summed counts; environmental and health-system indices are averaged across districts.",
  },
  {
    key: "relationships",
    label: "Environmental relationships",
    rule: `Pearson correlation between confirmed cases and each variable 0–${RULES.MAX_LAG_WEEKS} weeks earlier. Association within this dataset only — not evidence of cause.`,
  },
  {
    key: "forecast",
    label: "Forecasting",
    rule: "No forecasting model is implemented. All figures are observed values or calculations from them.",
  },
];

// ----------------------------------------------------------------------------- entry
export function districtsIn(clean: CleanResult): string[] {
  return [...new Set(clean.records.map((r) => r.district))].sort();
}

/** Match a requested scope case-insensitively; anything unknown falls back to "All". */
export function resolveScope(clean: CleanResult, requested: string | null | undefined): string {
  const want = (requested ?? "").trim().toLowerCase();
  return districtsIn(clean).find((d) => d.toLowerCase() === want) ?? "All";
}

export function analyze(clean: CleanResult, scopeRequested: string, fileName: string): Analytics {
  const all = districtsIn(clean);
  const scope = resolveScope(clean, scopeRequested);
  const districts = scope === "All" ? all : [scope];
  const place = scope === "All" ? "all districts combined" : scope;

  const weekly = seriesFor(clean.records, districts, place);
  const perDistrict = new Map(districts.map((d) => [d, seriesFor(clean.records, [d], d)]));
  const latest = weekly.length ? weekly[weekly.length - 1] : null;

  const alerts = districts
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

  const comparison: DistrictComparison[] =
    scope === "All"
      ? districts.map((d) => {
          const s = perDistrict.get(d) as WeekPoint[];
          const l = s.length ? s[s.length - 1] : null;
          return {
            district: d,
            latest_confirmed: l?.confirmed ?? null,
            latest_change_vs_baseline_pct: l?.change_vs_baseline_pct ?? null,
            latest_level: l?.signal.level ?? "INSUFFICIENT",
            totals: totalsFor(s),
            mean_reporting_completeness_pct: rndN(mean(nonNull(s.map((p) => p.reporting_completeness_pct))), 2),
            alerts: alerts.filter((a) => a.district === d).length,
          };
        })
      : [];

  const quality = qualityFor(clean, districts);
  const counts = { ELEVATED: 0, WATCH: 0 };
  for (const p of weekly) if (p.signal.level === "ELEVATED" || p.signal.level === "WATCH") counts[p.signal.level]++;
  const errors = clean.validation.filter((v) => v.level === "error").length;
  const warnings = clean.validation.filter((v) => v.level === "warn").length;
  const zScored = weekly.filter((p) => p.z_prev8 !== null);

  const pipeline: PipelineStage[] = [
    { stage: "CSV", detail: `${fileName}: ${clean.cleaning.rowsRead} rows × ${clean.header.length} columns read` },
    { stage: "Data validation", detail: `${clean.validation.length} checks · ${plural(errors, "error")}, ${plural(warnings, "warning")}` },
    {
      stage: "Data cleaning",
      detail: `${clean.cleaning.rowsKept} rows kept · ${clean.cleaning.droppedInvalidKey + clean.cleaning.droppedDuplicate} dropped · ${clean.cleaning.valuesSetToNull} values set to missing`,
    },
    { stage: "Feature preparation", detail: `${plural(weekly.length, "weekly point")} for ${place} · rates and 4-week moving average` },
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
    { stage: "Human review", detail: "Every alert requires verification and a decision by the district health team" },
  ];

  return {
    scope,
    scopes: ["All", ...all],
    districts,
    source: { file: fileName, rows: clean.cleaning.rowsRead, columns: clean.header.length },
    period: { start: quality.date_start, end: quality.date_end, weeks: weekly.length },
    latest,
    weekly,
    totals: totalsFor(weekly),
    districtSignals: districts.map((d) => {
      const s = perDistrict.get(d) as WeekPoint[];
      return { district: d, latest: s.length ? s[s.length - 1] : null };
    }),
    alerts,
    relationships: relationships(weekly),
    comparison,
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
        : "Insufficient history";
}
