export type RiskLevel = "HIGH" | "WATCH" | "LOW";

export interface YoY {
  fy: string;
  cases: number;
  incidence: number;
  change_pct: number | null;
}

export interface DistrictClimate {
  rain_now: number;
  rain_lead_6_8w: number;
  temp_c: number;
  rain_case_corr: number;
  favourable: boolean;
  favourable_band: string;
}

export interface District {
  district: string;
  province: string;
  risk: RiskLevel;
  lat: number;
  lng: number;
  cases_latest: number;
  expected_latest: number;
  anomaly_z: number;
  trend_pct: number;
  forecast: number[]; // 1..4 week ahead
  positivity: number;
  incidence_per_1000: number;
  chw_reporting_pct: number;
  population: number;
  drivers: string[];
  prevention_gap: number;
  rainfall_mm: number;
  rainfall_lead: number;
  temp_avg_c: number;
  climate_signal: boolean;
  yoy: YoY[];
  climate: DistrictClimate;
}

export interface Suggestion {
  category: string;
  action: string;
  why: string;
}

export interface NationalSummary {
  as_of: string;
  epi_week: string;
  cases_latest_week: number;
  incidence_per_1000_annualised: number;
  districts_total: number;
  risk_counts: Record<RiskLevel, number>;
  data_completeness_pct: number;
  active_alerts: number;
  context: {
    resurgence_note: string;
    surveillance_gap: string;
    source: string;
    [k: string]: unknown;
  };
  total_est_cases_avertible: number;
  yoy: YoY[];
  climate: {
    next_peak_week: number;
    weeks_to_peak: number;
    favourable_band: string;
    note: string;
  };
  suggestions: Suggestion[];
}

export interface Alert {
  level: RiskLevel;
  scope: "district" | "sector";
  district: string;
  sector: string | null;
  headline: string;
  signal: string;
  drivers: string[];
  verify_first: string[];
  then_act: string;
  confidence: string;
}

export interface Meta {
  generated_at: string;
  model: Record<string, string>;
  data_status: string;
  human_in_the_loop: string;
}

export interface TimeSeries {
  weeks: string[];
  actual: number[];
  baseline: number[];
  forecast_weeks: string[];
  forecast: number[];
}

export interface Intervention {
  action: string;
  why: string;
}

export interface Sector {
  district: string;
  sector: string;
  risk: RiskLevel;
  cases_latest: number;
  expected_latest: number;
  anomaly_z: number;
  trend_pct: number;
  positivity: number;
}

export interface Cell {
  district: string;
  sector: string;
  cell: string;
  cases_latest: number;
  expected: number;
  risk: RiskLevel;
  spark: number[];
  positivity: number;
}

export interface Village {
  district: string;
  sector: string;
  cell: string;
  village: string;
  cases_latest: number;
  risk: RiskLevel;
  households: number;
  itn_ownership: number;
  itn_use: number;
  irs: string;
  careseeking: number;
}

export interface PreventionDistrict {
  district: string;
  tier_high: boolean;
  itn_ownership_pct: number;
  itn_usage_pct: number;
  irs_coverage_pct: number;
  careseeking_pct: number;
  chw_reporting_pct: number;
  prevention_gap: number;
  predicted_peak_cases: number;
  vulnerability: number;
  est_cases_avertible: number;
  interventions: Intervention[];
}
