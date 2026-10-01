import { getDistrict, getDistrictSeries, getNational, getPreventionFor, getSectors } from "./data";
import { riskFactors, riskScore, type RiskFactor } from "./risk";
import type { District, RiskLevel, TimeSeries } from "./types";

// Rough national rates from the FY2023-24 annual report, used only to frame the
// scale of a projected consequence (clearly a projection, not a claim).
const SEVERE_RATE = 0.0044; // severe cases per confirmed case
const DEATH_RATE = 0.00015; // deaths per confirmed case

export interface Recommendation {
  action: string;
  why: string;
  urgency: "now" | "soon" | "routine";
}

export interface Consequence {
  headline: string;
  projectedPeak: number;
  additionalCases: number;
  estSevere: number;
  estDeaths: number;
  text: string;
}

export interface SampleAlert {
  level: RiskLevel;
  sms: string;
  emailSubject: string;
  emailBody: string;
  recipient: string;
}

export interface ValidationCheck {
  label: string;
  ok: boolean;
  detail: string;
}
export interface Validation {
  confidence: "High" | "Medium" | "Low";
  checks: ValidationCheck[];
}

export interface DashboardDistrict {
  name: string;
  province: string;
  risk: RiskLevel;
  levelLabel: string;
  score: number;
  casesLatest: number;
  forecast3: number;
  deltaPct: number;
  threshold: number;
  crossesThreshold: boolean;
  series: TimeSeries; // extended to 8 weeks of forecast
  factors: RiskFactor[];
  recommendations: Recommendation[];
  consequence: Consequence;
  alert: SampleAlert;
  validation: Validation;
  sectors: { name: string; risk: RiskLevel; casesLatest: number; share: number }[];
  lat: number;
  lng: number;
}

function buildValidation(d: District, weeksOfHistory: number): Validation {
  const checks: ValidationCheck[] = [
    {
      label: "Reporting completeness",
      ok: d.chw_reporting_pct >= 90,
      detail: `${d.chw_reporting_pct}% of CHW + facility reports received`,
    },
    {
      label: "Historical depth",
      ok: weeksOfHistory >= 52,
      detail: `${weeksOfHistory} weeks of weekly case history`,
    },
    {
      label: "Climate corroboration",
      ok: d.climate_signal,
      detail: d.climate_signal
        ? "rainfall lead (~8 wks) supports the trend"
        : "no added climate pressure to corroborate",
    },
    {
      label: "Positivity plausibility",
      ok: d.positivity >= 0.05 && d.positivity <= 0.4,
      detail: `RDT positivity ${Math.round(d.positivity * 100)}% is in the expected range`,
    },
  ];
  const okCount = checks.filter((c) => c.ok).length;
  const confidence = okCount >= 4 ? "High" : okCount >= 3 ? "Medium" : "Low";
  return { confidence, checks };
}

const LABEL: Record<RiskLevel, string> = {
  HIGH: "High Risk",
  WATCH: "Watch",
  LOW: "Normal",
};

/** Extend the pipeline's 4-week forecast out to 8 weeks along its own slope. */
function extendForecast(fc: number[], toWeeks = 8): number[] {
  if (fc.length === 0) return [];
  const out = [...fc];
  const step = fc.length >= 2 ? (fc[fc.length - 1] - fc[0]) / (fc.length - 1) : 0;
  while (out.length < toWeeks) {
    const next = Math.max(0, Math.round(out[out.length - 1] + step));
    out.push(next);
  }
  return out.slice(0, toWeeks);
}

function buildRecommendations(d: District): Recommendation[] {
  const prev = getPreventionFor(d.district);
  const urgency: Recommendation["urgency"] =
    d.risk === "HIGH" ? "now" : d.risk === "WATCH" ? "soon" : "routine";
  const recs: Recommendation[] = [];

  if (d.risk !== "LOW") {
    recs.push({
      action: "Verify the signal, then pre-position RDTs & ACTs",
      why: `Confirm CHW reporting (${d.chw_reporting_pct}%) and RDT positivity (${Math.round(
        d.positivity * 100,
      )}%), then ensure case-management stock before demand rises.`,
      urgency,
    });
  }
  if (prev) {
    for (const iv of prev.interventions.slice(0, 3)) {
      recs.push({ action: iv.action, why: iv.why, urgency });
    }
  }
  if (d.risk === "LOW") {
    recs.push({
      action: "Maintain routine prevention & surveillance",
      why: "Cases track the expected seasonal level; continue nets, testing and weekly reporting.",
      urgency: "routine",
    });
  }
  return recs;
}

function buildConsequence(d: District, forecast8: number[]): Consequence {
  const projectedPeak = forecast8.length ? Math.max(...forecast8) : d.cases_latest;
  const baselineWeek = Math.max(d.expected_latest, 1);
  const extra = forecast8.reduce((s, v) => s + Math.max(0, v - baselineWeek), 0);
  const additionalCases = Math.round(extra);
  const estSevere = Math.round(additionalCases * SEVERE_RATE);
  const estDeaths = Math.round(additionalCases * DEATH_RATE);

  const headline =
    d.risk === "HIGH"
      ? "Act now to prevent an outbreak"
      : d.risk === "WATCH"
        ? "Act soon to stop this escalating"
        : "On track — maintain routine prevention";

  let text: string;
  if (d.risk === "LOW") {
    text = `${d.district} is tracking the expected seasonal level. With routine prevention maintained, no surge is projected over the next 8 weeks.`;
  } else {
    const deathsClause =
      estDeaths >= 1
        ? ` and could contribute to around ${estDeaths} preventable death${estDeaths > 1 ? "s" : ""}`
        : " with a rising risk of preventable severe illness";
    text = `If no targeted action is taken in the next 4–8 weeks, ${d.district} is projected to reach about ${projectedPeak.toLocaleString()} cases per week — roughly ${additionalCases.toLocaleString()} extra cases over the period. At current rates that risks about ${estSevere.toLocaleString()} additional severe case${estSevere === 1 ? "" : "s"}${deathsClause}.`;
  }

  return { headline, projectedPeak, additionalCases, estSevere, estDeaths, text };
}

function buildAlert(d: District, threshold: number, epiWeek: string): SampleAlert {
  const f3 = d.forecast[2] ?? d.forecast[d.forecast.length - 1] ?? d.cases_latest;
  const delta = d.cases_latest ? Math.round(((f3 - d.cases_latest) / d.cases_latest) * 100) : 0;
  const rel = f3 >= threshold ? "above the outbreak threshold" : "approaching the alert threshold";
  const recipient = `${d.district} District Health Officer`;

  if (d.risk === "LOW") {
    return {
      level: d.risk,
      recipient,
      sms: `UMUBURO AI [NORMAL] ${d.district}: cases stable (~${d.cases_latest}/wk), within expected range. No action needed. Continue routine surveillance.`,
      emailSubject: `[NORMAL] Malaria early-warning — ${d.district} (${epiWeek})`,
      emailBody: `Dear ${recipient},\n\nUmuburo AI shows ${d.district} tracking the expected seasonal level (~${d.cases_latest} cases this week). No abnormal signal detected. Continue routine prevention and weekly reporting.\n\n— Umuburo AI (decision support; verify before acting)`,
    };
  }

  const act =
    d.risk === "HIGH"
      ? "confirm stock and prepare a CHW surge"
      : "notify the district team and monitor closely";
  return {
    level: d.risk,
    recipient,
    sms: `UMUBURO AI [${d.risk}] ${d.district}: cases forecast to rise to ~${f3}/wk in 3 wks (${
      delta >= 0 ? "+" : ""
    }${delta}%), ${rel}. Verify CHW reporting & RDT/ACT stock, then ${act}.`,
    emailSubject: `[${d.risk}] Malaria early-warning — ${d.district} (${epiWeek})`,
    emailBody: `Dear ${recipient},\n\nUmuburo AI has flagged ${d.district} as ${LABEL[
      d.risk
    ].toUpperCase()}.\n\n• Latest week: ${d.cases_latest} confirmed cases\n• 3-week forecast: ~${f3} cases (${
      delta >= 0 ? "+" : ""
    }${delta}% vs now), ${rel} (~${threshold}).\n• Main drivers: ${d.drivers
      .slice(0, 2)
      .join("; ")}.\n\nRecommended: verify CHW reporting completeness and RDT/ACT stock first, then ${act}. This is a decision-support alert — please verify before acting.\n\n— Umuburo AI`,
  };
}

export function buildDashboardDistrict(name: string): DashboardDistrict | null {
  const d = getDistrict(name);
  if (!d) return null;
  const national = getNational();
  const baseSeries =
    getDistrictSeries(d.district) ??
    ({ weeks: [], actual: [], baseline: [], forecast_weeks: [], forecast: [] } as TimeSeries);

  const forecast8 = extendForecast(baseSeries.forecast, 8);
  const forecastWeeks8 = Array.from({ length: 8 }, (_, i) => `+${i + 1}w`);
  const series: TimeSeries = {
    ...baseSeries,
    forecast: forecast8,
    forecast_weeks: forecastWeeks8,
  };

  const recentBaseline = baseSeries.baseline.slice(-8);
  const baseAvg = recentBaseline.length
    ? recentBaseline.reduce((s, v) => s + v, 0) / recentBaseline.length
    : d.expected_latest;
  const threshold = Math.round(baseAvg * 1.3);

  const f3 = d.forecast[2] ?? d.forecast[d.forecast.length - 1] ?? d.cases_latest;
  const deltaPct = d.cases_latest ? Math.round(((f3 - d.cases_latest) / d.cases_latest) * 100) : 0;

  return {
    name: d.district,
    province: d.province,
    risk: d.risk,
    levelLabel: LABEL[d.risk],
    score: riskScore(d),
    casesLatest: d.cases_latest,
    forecast3: Math.round(f3),
    deltaPct,
    threshold,
    crossesThreshold: Math.max(...forecast8, d.cases_latest) >= threshold,
    series,
    factors: riskFactors(d),
    recommendations: buildRecommendations(d),
    consequence: buildConsequence(d, forecast8),
    alert: buildAlert(d, threshold, national.epi_week),
    validation: buildValidation(d, baseSeries.weeks.length),
    sectors: (() => {
      const secs = getSectors().filter((s) => s.district === d.district);
      const total = secs.reduce((a, s) => a + s.cases_latest, 0) || d.cases_latest || 1;
      return secs
        .sort((a, b) => b.cases_latest - a.cases_latest)
        .map((s) => ({
          name: s.sector,
          risk: s.risk,
          casesLatest: s.cases_latest,
          share: s.cases_latest / total,
        }));
    })(),
    lat: d.lat,
    lng: d.lng,
  };
}
