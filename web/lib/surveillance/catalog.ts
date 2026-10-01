// The analyses a user can choose from. Availability depends on the data imported for
// the selected scope; nothing is shown for data that was not supplied.
import type { Analytics, WeekPoint } from "./types";

export type AnalysisCategory =
  | "Surveillance burden"
  | "Early warning"
  | "Environment & vectors"
  | "Health system"
  | "Prevention"
  | "Comparison & data quality";

export interface AnalysisDef {
  id: string;
  title: string;
  category: AnalysisCategory;
  description: string;
  /** Reason the analysis cannot run for this scope, or null when it can. */
  unavailable: (a: Analytics) => string | null;
}

const has = (a: Analytics, get: (p: WeekPoint) => number | null) => a.weekly.some((p) => get(p) !== null);
const needs =
  (label: string, get: (p: WeekPoint) => number | null) =>
  (a: Analytics): string | null =>
    !a.hasData ? "No data for this scope" : has(a, get) ? null : `${label} not supplied in the imported data`;

export const CATEGORIES: AnalysisCategory[] = [
  "Surveillance burden",
  "Early warning",
  "Environment & vectors",
  "Health system",
  "Prevention",
  "Comparison & data quality",
];

export const ANALYSES: AnalysisDef[] = [
  {
    id: "cases_trend",
    title: "Confirmed cases trend",
    category: "Surveillance burden",
    description: "Weekly confirmed cases with the 4-week moving average, the recent baseline and flagged weeks.",
    unavailable: needs("Confirmed cases", (p) => p.confirmed),
  },
  {
    id: "testing_cascade",
    title: "Testing cascade",
    category: "Surveillance burden",
    description: "Suspected → tested → confirmed cases each week, with the testing rate.",
    unavailable: needs("Suspected and tested cases", (p) => p.tested),
  },
  {
    id: "positivity",
    title: "Test positivity",
    category: "Surveillance burden",
    description: "Share of tests that were positive, against its own recent average.",
    unavailable: needs("Test positivity", (p) => p.positivity_pct),
  },
  {
    id: "incidence",
    title: "Incidence per 1,000",
    category: "Surveillance burden",
    description: "Weekly confirmed cases per 1,000 population at risk, and cumulative incidence.",
    unavailable: needs("Population at risk", (p) => p.incidence_per_1000),
  },
  {
    id: "severity",
    title: "Severity, admissions and deaths",
    category: "Surveillance burden",
    description: "Severe malaria, admissions and deaths, with severity and fatality ratios.",
    unavailable: needs("Severe cases", (p) => p.severe),
  },
  {
    id: "opd_share",
    title: "Malaria share of outpatient visits",
    category: "Surveillance burden",
    description: "Confirmed malaria cases as a percentage of all outpatient visits.",
    unavailable: needs("Outpatient visits", (p) => p.opd_malaria_share_pct),
  },
  {
    id: "baseline_deviation",
    title: "Deviation from recent baseline",
    category: "Early warning",
    description: "Each week's change against the average of the 4 weeks before it.",
    unavailable: needs("A 4-week baseline", (p) => p.change_vs_baseline_pct),
  },
  {
    id: "anomaly",
    title: "Anomaly detection",
    category: "Early warning",
    description: "How unusual each week is compared with the previous 8 weeks (z-score).",
    unavailable: needs("An 8-week history", (p) => p.z_prev8),
  },
  {
    id: "signal_timeline",
    title: "Weekly signal evaluation",
    category: "Early warning",
    description: "Every week's rules, values and resulting signal level.",
    unavailable: needs("Confirmed cases", (p) => p.confirmed),
  },
  {
    id: "projection",
    title: "Short-term projection",
    category: "Early warning",
    description: "Model estimate for the next 1–4 weeks, shown only where backtesting beats a naive estimate.",
    unavailable: needs("Confirmed cases", (p) => p.confirmed),
  },
  {
    id: "rainfall",
    title: "Rainfall and cases",
    category: "Environment & vectors",
    description: "Weekly rainfall and its 4-week average alongside confirmed cases.",
    unavailable: needs("Rainfall", (p) => p.rainfall_mm ?? p.rainfall_4wk_avg),
  },
  {
    id: "climate",
    title: "Temperature and humidity",
    category: "Environment & vectors",
    description: "Mean temperature and relative humidity each week.",
    unavailable: needs("Temperature or humidity", (p) => p.temperature_c ?? p.humidity_pct),
  },
  {
    id: "vector",
    title: "Mosquito and larval density",
    category: "Environment & vectors",
    description: "Vector indices recorded by entomological surveillance.",
    unavailable: needs("Vector indices", (p) => p.mosquito_density ?? p.larval_density),
  },
  {
    id: "vegetation_mobility",
    title: "Vegetation (NDVI) and mobility",
    category: "Environment & vectors",
    description: "Vegetation index and human mobility index each week.",
    unavailable: needs("NDVI or mobility", (p) => p.ndvi ?? p.mobility_index),
  },
  {
    id: "env_lag",
    title: "Lagged relationships",
    category: "Environment & vectors",
    description: "Correlation of cases with each environmental and prevention variable 0–8 weeks earlier.",
    unavailable: (a) =>
      !a.hasData
        ? "No data for this scope"
        : a.relationships.some((r) => r.best)
          ? null
          : "Not enough overlapping weeks to estimate relationships",
  },
  {
    id: "reporting",
    title: "Reporting completeness and timeliness",
    category: "Health system",
    description: "Share of expected reports received and average reporting delay.",
    unavailable: needs("Reporting completeness", (p) => p.reporting_completeness_pct ?? p.reporting_delay_days),
  },
  {
    id: "facilities",
    title: "Facility reporting",
    category: "Health system",
    description: "Facilities expected to report against facilities that reported.",
    unavailable: needs("Facility counts", (p) => p.facilities_expected),
  },
  {
    id: "commodities",
    title: "ACT and RDT stock",
    category: "Health system",
    description: "Days of ACT and RDT stock and recorded stockout days.",
    unavailable: needs("Stock days", (p) => p.act_stock_days ?? p.rdt_stock_days),
  },
  {
    id: "beds",
    title: "Admissions and bed occupancy",
    category: "Health system",
    description: "Malaria admissions and hospital bed occupancy.",
    unavailable: needs("Bed occupancy", (p) => p.bed_occupancy_pct ?? p.admissions),
  },
  {
    id: "prevention_coverage",
    title: "Bed-net and IRS coverage",
    category: "Prevention",
    description: "Recorded bed-net and indoor residual spraying coverage, and their association with cases.",
    unavailable: needs("Prevention coverage", (p) => p.bed_net_coverage_pct ?? p.irs_pct),
  },
  {
    id: "prioritisation",
    title: "Prevention prioritisation",
    category: "Prevention",
    description: "Districts ordered by current signal and recent incidence, with points to review.",
    unavailable: (a) => (a.prioritisation.length ? null : "No district in this scope has data"),
  },
  {
    id: "district_comparison",
    title: "District comparison",
    category: "Comparison & data quality",
    description: "Reporting districts side by side: burden, incidence, positivity, signals and reporting.",
    unavailable: (a) =>
      a.scope.level === "district" ? "Choose a province or National to compare districts" : !a.hasData ? "No data for this scope" : null,
  },
  {
    id: "data_quality",
    title: "Data quality",
    category: "Comparison & data quality",
    description: "Records, missing values, reporting completeness and validation checks for this scope.",
    unavailable: (a) => (a.hasData ? null : "No data for this scope"),
  },
];

export const PRESETS: { id: string; label: string; analyses: string[] }[] = [
  { id: "situation", label: "Weekly situation", analyses: ["cases_trend", "testing_cascade", "positivity", "severity"] },
  { id: "early_warning", label: "Early warning", analyses: ["baseline_deviation", "anomaly", "signal_timeline", "projection"] },
  { id: "environment", label: "Environment & vectors", analyses: ["rainfall", "climate", "vector", "env_lag"] },
  { id: "health_system", label: "Health system", analyses: ["reporting", "facilities", "commodities", "beds"] },
  { id: "prevention", label: "Prevention planning", analyses: ["prevention_coverage", "prioritisation", "district_comparison"] },
];

export function parseSelection(raw: string | string[] | undefined): string[] {
  const v = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  const ids = v.split(",").map((s) => s.trim()).filter(Boolean);
  return ANALYSES.filter((d) => ids.includes(d.id)).map((d) => d.id);
}
