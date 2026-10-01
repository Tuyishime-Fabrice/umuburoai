import { getDistrict, getDistrictSeries, getNational } from "./data";
import { riskFactors, riskScore, type RiskFactor } from "./risk";
import type { RiskLevel, TimeSeries } from "./types";

export interface ForecastResult {
  district: string;
  province: string;
  weeks: number;
  level: RiskLevel;
  levelLabel: string;
  score: number;
  current: number;
  predicted: number;
  deltaPct: number;
  positivity: number;
  chwReporting: number;
  series: TimeSeries;
  factors: RiskFactor[];
  narrative: string;
  verifyFirst: string[];
  asOf: string;
}

const LABEL: Record<RiskLevel, string> = {
  HIGH: "High Risk",
  WATCH: "Watch",
  LOW: "Normal",
};

export function runForecast(districtName: string, weeks: number): ForecastResult {
  const d = getDistrict(districtName);
  if (!d) throw new Error(`Unknown district: ${districtName}`);
  const w = Math.min(3, Math.max(1, Math.round(weeks || 3)));
  const series = getDistrictSeries(d.district) ?? {
    weeks: [],
    actual: [],
    baseline: [],
    forecast_weeks: [],
    forecast: [],
  };

  const current = d.cases_latest;
  const predicted = d.forecast[w - 1] ?? d.forecast[d.forecast.length - 1] ?? current;
  const deltaPct = current ? Math.round(((predicted - current) / current) * 100) : 0;
  const score = riskScore(d);
  const factors = riskFactors(d);
  const national = getNational();

  const top = factors.slice(0, 2).map((f) => f.detail.replace(/\.$/, "")).join("; ");
  const trend =
    deltaPct > 0
      ? `rising to about ${Math.round(predicted).toLocaleString()} cases in ${w} week${
          w > 1 ? "s" : ""
        } (+${deltaPct}%)`
      : `holding near ${Math.round(predicted).toLocaleString()} cases over ${w} week${
          w > 1 ? "s" : ""
        }`;

  const narrative =
    d.risk === "LOW"
      ? `${d.district} is currently Normal (${score}%). Cases track the expected seasonal level and the ${w}-week outlook is ${trend}. Continue routine surveillance.`
      : `${d.district} is ${LABEL[d.risk]} (${score}%). ${top}. The model projects cases ${trend}. Confirm the drivers below before any response is dispatched.`;

  // Trim the forecast series to the requested horizon for the result chart.
  const trimmedSeries: TimeSeries = {
    ...series,
    forecast_weeks: series.forecast_weeks.slice(0, w),
    forecast: series.forecast.slice(0, w),
  };

  return {
    district: d.district,
    province: d.province,
    weeks: w,
    level: d.risk,
    levelLabel: LABEL[d.risk],
    score,
    current,
    predicted: Math.round(predicted),
    deltaPct,
    positivity: d.positivity,
    chwReporting: d.chw_reporting_pct,
    series: trimmedSeries,
    factors,
    narrative,
    verifyFirst: [
      `Confirm CHW reporting completeness (currently ${d.chw_reporting_pct}%) to rule out a reporting artefact.`,
      `Cross-check the facility register and RDT positivity (${Math.round(d.positivity * 100)}%).`,
      `Check RDT & ACT stock for ${d.district} in the logistics system before acting.`,
    ],
    asOf: national.as_of,
  };
}
