// Types for the surveillance analytics pipeline. Every value here is read from,
// or calculated from, the uploaded surveillance datasets — see pipeline.ts.

export type SignalLevel = "ELEVATED" | "WATCH" | "NONE" | "INSUFFICIENT";
export type ScopeLevel = "national" | "province" | "district";

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
  droppedUnknownDistrict: number;
  droppedOutsideScope: number;
  valuesSetToNull: number;
}

/** Input dataset for the pipeline (an upload). */
export interface DatasetInput {
  id: string;
  name: string;
  csv: string;
  /** Rows for other districts are excluded (uploads by district users). */
  restrictDistrict?: string | null;
}

export interface DatasetSummary {
  id: string;
  name: string;
  accepted: boolean;
  columns: string[];
  missingOptionalColumns: string[];
  districts: string[];
  period: { start: string | null; end: string | null };
  cleaning: CleaningSummary;
  validation: ValidationCheck[];
  /** District-weeks from this dataset that a later upload replaced. */
  superseded: number;
}

export interface ScopeOption {
  id: string;
  label: string;
  level: ScopeLevel;
  province: string | null;
  hasData: boolean;
}

/** One week of the selected scope (one district, or several districts combined). */
export interface WeekPoint {
  week_start: string;
  epi_week: number | null;
  districts_reporting: number;
  districts_expected: number;
  /** All districts with data in the scope reported this week. */
  complete: boolean;
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
  opd_malaria_share_pct: number | null;
  severe_pct_of_confirmed: number | null;
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
  /** Provided label column: 0/1 for one district; number of districts labelled 1 otherwise. */
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
  province: string;
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
  /** The alert is for the most recent week reported by its district. */
  isLatestWeek: boolean;
  file_alert_label: number | null;
}

export interface Totals {
  weeks: number;
  partial_weeks: number;
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
  severe_pct_of_confirmed: number | null;
  deaths_per_1000_confirmed: number | null;
  admissions_per_100_confirmed: number | null;
  opd_malaria_share_pct: number | null;
  stockout_days: number | null;
  missing_weeks: Record<string, number>;
}

export interface LagCorrelation {
  variable: string;
  label: string;
  group: "environment" | "prevention";
  unit: string;
  lags: { lag: number; r: number | null; n: number }[];
  best: { lag: number; r: number; n: number } | null;
  strength: "weak" | "moderate" | "strong" | "insufficient";
}

export interface DistrictStatus {
  district: string;
  province: string;
  hasData: boolean;
  weeks: number;
  first_week: string | null;
  latest_week: string | null;
  days_since_latest: number | null;
  stale: boolean;
  latest_confirmed: number | null;
  latest_change_vs_baseline_pct: number | null;
  latest_level: SignalLevel | null;
  recent_incidence_per_1000: number | null;
  recent_positivity_pct: number | null;
  mean_reporting_completeness_pct: number | null;
  alerts: number;
  totals: Totals | null;
}

export interface PriorityRow {
  rank: number;
  district: string;
  province: string;
  level: SignalLevel;
  recent_incidence_per_1000: number | null;
  recent_positivity_pct: number | null;
  bed_net_coverage_pct: number | null;
  irs_pct: number | null;
  act_stock_days: number | null;
  rdt_stock_days: number | null;
  review_points: string[];
}

export interface ForecastHorizon {
  h: number;
  week_start: string;
  estimate: number | null;
  lower: number | null;
  upper: number | null;
  shown: boolean;
  backtest: { n: number; mae: number | null; mape_pct: number | null; naive_mae: number | null; skill_pct: number | null };
}

export interface Forecast {
  available: boolean;
  reason: string | null;
  features: string[];
  origin_week: string | null;
  horizons: ForecastHorizon[];
}

export interface Coverage {
  districts_total: number;
  districts_with_data: number;
  districts_reporting_latest_week: number;
  by_province: { province: string; districts_total: number; districts_with_data: number }[];
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
  /** Columns that no active dataset supplied (analyses needing them are unavailable). */
  columns_not_supplied: string[];
  reporting_completeness: { mean: number | null; min: number | null; weeks_below_90: number };
  reporting_delay_days: { mean: number | null; max: number | null; weeks_above_3: number };
  facilities: {
    expected_latest: number | null;
    reporting_latest: number | null;
    reporting_rate_pct: number | null;
  };
  validation: ValidationCheck[];
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
  scope: ScopeOption;
  scopeOptions: ScopeOption[];
  /** Reference districts in the scope (with or without data). */
  districtsInScope: string[];
  /** Districts in the scope that have records. */
  districtsWithData: string[];
  hasData: boolean;
  today: string;
  sources: DatasetSummary[];
  coverage: Coverage;
  freshness: { latest_week: string | null; days_since_latest: number | null; stale: boolean };
  period: { start: string | null; end: string | null; weeks: number };
  latest: WeekPoint | null;
  weekly: WeekPoint[];
  totals: Totals;
  districts: DistrictStatus[];
  /** Latest-week signal per district with data in scope. */
  districtSignals: { district: string; province: string; latest: WeekPoint | null }[];
  alerts: SurveillanceAlert[];
  relationships: LagCorrelation[];
  prioritisation: PriorityRow[];
  forecast: Forecast;
  quality: DataQuality;
  pipeline: PipelineStage[];
  method: MethodRule[];
}
