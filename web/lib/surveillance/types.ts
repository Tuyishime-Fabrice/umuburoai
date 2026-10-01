// Types for the surveillance analytics pipeline. Every value here is read from,
// or calculated from, the surveillance CSV — see pipeline.ts for the rules.

export type SignalLevel = "ELEVATED" | "WATCH" | "NONE" | "INSUFFICIENT";

export type Scope = string; // "All" or a district name present in the dataset

/** One cleaned CSV row. Missing or invalid cells are null. */
export interface WeekRecord {
  week_start: string;
  epidemiological_week: number | null;
  district: string;
  population_at_risk: number | null;
  suspected_malaria_cases: number | null;
  tested_cases: number | null;
  confirmed_malaria_cases: number | null;
  positive_tests_pct: number | null;
  severe_malaria_cases: number | null;
  malaria_deaths: number | null;
  malaria_admissions: number | null;
  outpatient_visits: number | null;
  incidence_per_1000: number | null;
  testing_rate_pct: number | null;
  rainfall_mm: number | null;
  mean_temperature_c: number | null;
  relative_humidity_pct: number | null;
  ndvi: number | null;
  mosquito_density_index: number | null;
  larval_density_index: number | null;
  human_mobility_index: number | null;
  reporting_completeness_pct: number | null;
  reporting_delay_days: number | null;
  facilities_expected: number | null;
  facilities_reporting: number | null;
  act_stock_days: number | null;
  rdt_stock_days: number | null;
  stockout_days: number | null;
  bed_occupancy_pct: number | null;
  bed_net_coverage_pct: number | null;
  indoor_residual_spraying_pct: number | null;
  confirmed_cases_4wk_avg: number | null;
  rainfall_4wk_avg: number | null;
  cases_change_vs_4wk_avg_pct: number | null;
  alert_label: number | null;
}

export type NumericField = Exclude<keyof WeekRecord, "week_start" | "district">;

export type CheckLevel = "ok" | "warn" | "error";

export interface ValidationCheck {
  check: string;
  level: CheckLevel;
  detail: string;
  count: number;
}

export interface CleaningSummary {
  rowsRead: number;
  rowsKept: number;
  droppedInvalidKey: number;
  droppedDuplicate: number;
  valuesSetToNull: number;
}

/** One week of the selected scope (one district, or all districts combined). */
export interface WeekPoint {
  week_start: string;
  epi_week: number | null;
  districts_reporting: number;
  population: number | null;
  suspected: number | null;
  tested: number | null;
  confirmed: number | null;
  severe: number | null;
  deaths: number | null;
  admissions: number | null;
  outpatient: number | null;
  positivity_pct: number | null;
  testing_rate_pct: number | null;
  incidence_per_1000: number | null;
  rainfall_mm: number | null;
  rainfall_4wk_avg: number | null;
  temperature_c: number | null;
  humidity_pct: number | null;
  ndvi: number | null;
  mosquito_density: number | null;
  larval_density: number | null;
  mobility_index: number | null;
  reporting_completeness_pct: number | null;
  reporting_delay_days: number | null;
  facilities_expected: number | null;
  facilities_reporting: number | null;
  act_stock_days: number | null;
  rdt_stock_days: number | null;
  stockout_days: number | null;
  bed_occupancy_pct: number | null;
  bed_net_coverage_pct: number | null;
  irs_pct: number | null;
  /** Provided label column: 0/1 for one district; number of districts labelled 1 for All. */
  file_alert_label: number | null;
  // features
  cases_ma4: number | null;
  baseline_prev4: number | null;
  change_vs_baseline_pct: number | null;
  baseline_prev8_mean: number | null;
  baseline_prev8_sd: number | null;
  z_prev8: number | null;
  positivity_baseline_prev4: number | null;
  positivity_change_pp: number | null;
  severe_baseline_prev4: number | null;
  signal: WeekSignal;
}

export interface SignalItem {
  key: string;
  label: string;
  detail: string;
}

export interface WeekSignal {
  level: SignalLevel;
  /** Epidemiological signals that determine the level. */
  signals: SignalItem[];
  /** Observations worth verifying that do not change the level (e.g. deaths). */
  observations: SignalItem[];
  /** Environmental context, only listed when a signal is present and the data supports it. */
  context: SignalItem[];
  /** Data-confidence notes for the week. */
  quality: SignalItem[];
}

export interface SurveillanceAlert {
  id: string;
  district: string;
  week_start: string;
  epi_week: number | null;
  level: Exclude<SignalLevel, "NONE" | "INSUFFICIENT">;
  headline: string;
  summary: string;
  signals: SignalItem[];
  observations: SignalItem[];
  context: SignalItem[];
  quality: SignalItem[];
  verify: string[];
  isLatestWeek: boolean;
  file_alert_label: number | null;
}

export interface Totals {
  weeks: number;
  suspected: number | null;
  tested: number | null;
  confirmed: number | null;
  severe: number | null;
  deaths: number | null;
  admissions: number | null;
  outpatient: number | null;
  positivity_pct: number | null;
  testing_rate_pct: number | null;
  /** Cumulative incidence over the period per 1,000 (Σ confirmed ÷ mean weekly population). */
  incidence_per_1000: number | null;
  stockout_days: number | null;
  missing_weeks: Record<string, number>;
}

export interface LagCorrelation {
  variable: string;
  label: string;
  unit: string;
  lags: { lag: number; r: number | null; n: number }[];
  best: { lag: number; r: number; n: number } | null;
  strength: "weak" | "moderate" | "strong" | "insufficient";
}

export interface DistrictComparison {
  district: string;
  latest_confirmed: number | null;
  latest_change_vs_baseline_pct: number | null;
  latest_level: SignalLevel;
  totals: Totals;
  mean_reporting_completeness_pct: number | null;
  alerts: number;
}

export interface ColumnMissing {
  column: string;
  missing: number;
}

export interface DataQuality {
  records: number;
  districts: string[];
  date_start: string | null;
  date_end: string | null;
  weeks_per_district: Record<string, number>;
  missing_values_total: number;
  missing_by_column: ColumnMissing[];
  reporting_completeness: { mean: number | null; min: number | null; weeks_below_90: number };
  reporting_delay_days: { mean: number | null; max: number | null; weeks_above_3: number };
  facilities: {
    expected_latest: number | null;
    reporting_latest: number | null;
    reporting_rate_pct: number | null;
  };
  validation: ValidationCheck[];
  cleaning: CleaningSummary;
}

export interface MethodRule {
  key: string;
  label: string;
  rule: string;
}

export interface PipelineStage {
  stage: string;
  detail: string;
}

export interface Analytics {
  scope: Scope;
  scopes: string[];
  districts: string[];
  source: { file: string; rows: number; columns: number };
  period: { start: string | null; end: string | null; weeks: number };
  latest: WeekPoint | null;
  weekly: WeekPoint[];
  totals: Totals;
  /** Latest-week signal per district in scope (one entry for a single district). */
  districtSignals: { district: string; latest: WeekPoint | null }[];
  alerts: SurveillanceAlert[];
  relationships: LagCorrelation[];
  comparison: DistrictComparison[];
  quality: DataQuality;
  pipeline: PipelineStage[];
  method: MethodRule[];
}
