import type { District, RiskLevel } from "./types";

/** The two pilot districts, grounded in the national FY2023-24 annual report. */
export const PILOTS = ["Kirehe", "Nyamasheke"] as const;

export const RISK_META: Record<
  RiskLevel,
  { label: string; color: string; soft: string; text: string; ring: string }
> = {
  HIGH: {
    label: "High Risk",
    color: "var(--risk-high)",
    soft: "var(--risk-high-soft)",
    text: "text-[color:var(--risk-high)]",
    ring: "ring-[color:var(--risk-high)]",
  },
  WATCH: {
    label: "Watch",
    color: "var(--risk-watch)",
    soft: "var(--risk-watch-soft)",
    text: "text-[color:var(--risk-watch)]",
    ring: "ring-[color:var(--risk-watch)]",
  },
  LOW: {
    label: "Normal",
    color: "var(--risk-low)",
    soft: "var(--risk-low-soft)",
    text: "text-[color:var(--risk-low)]",
    ring: "ring-[color:var(--risk-low)]",
  },
};

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

const BAND: Record<RiskLevel, [number, number]> = {
  HIGH: [70, 93],
  WATCH: [45, 67],
  LOW: [8, 40],
};

/**
 * A 0-100 risk score derived from the same signals the pipeline uses.
 * The score is then constrained to the band that matches the pipeline's own
 * risk label, so the number and the label can never disagree.
 */
export function riskScore(d: {
  anomaly_z: number;
  trend_pct: number;
  climate_signal: boolean;
  prevention_gap: number;
  forecast: number[];
  risk: RiskLevel;
}): number {
  let s = 0;
  s += clamp(d.anomaly_z / 4, 0, 1) * 44; // anomaly (epidemic-threshold style)
  s += clamp(d.trend_pct / 50, 0, 1) * 22; // short-term trend
  s += d.climate_signal ? 12 : 0; // climate favourability
  s += clamp(d.prevention_gap / 110, 0, 1) * 14; // prevention gap
  const fc = d.forecast ?? [];
  if (fc.length >= 2) {
    const rise = (fc[fc.length - 1] - fc[0]) / Math.max(fc[0], 1);
    s += clamp(rise / 0.2, 0, 1) * 8; // rising forecast trajectory
  }
  const [lo, hi] = BAND[d.risk];
  // Map the raw signal strength into the label's band.
  const norm = clamp(s / 100, 0, 1);
  return Math.round(lo + norm * (hi - lo));
}

export interface RiskFactor {
  label: string;
  detail: string;
  weight: number; // 0-1 contribution
  tone: RiskLevel;
}

/** Break the score into the human-readable factors that drove it. */
export function riskFactors(d: District): RiskFactor[] {
  const factors: RiskFactor[] = [
    {
      label: "Case anomaly vs seasonal baseline",
      detail:
        d.anomaly_z >= 2
          ? `Cases ${d.trend_pct > 0 ? "+" : ""}${Math.round(
              ((d.cases_latest - d.expected_latest) / Math.max(d.expected_latest, 1)) * 100,
            )}% above the expected seasonal level (z = ${d.anomaly_z.toFixed(1)}).`
          : `Cases near the expected seasonal level (z = ${d.anomaly_z.toFixed(1)}).`,
      weight: clamp(d.anomaly_z / 4, 0, 1),
      tone: d.anomaly_z >= 2 ? "HIGH" : d.anomaly_z >= 1 ? "WATCH" : "LOW",
    },
    {
      label: "Short-term trend",
      detail: `${d.trend_pct > 0 ? "+" : ""}${d.trend_pct}% versus the trailing 4-week average.`,
      weight: clamp(d.trend_pct / 50, 0, 1),
      tone: d.trend_pct >= 25 ? "HIGH" : d.trend_pct >= 10 ? "WATCH" : "LOW",
    },
    {
      label: "Climate lead signal",
      detail: d.climate_signal
        ? `Rainfall 6-8 weeks ago was favourable for transmission (${d.rainfall_lead.toFixed(
            0,
          )} mm/wk); rainfall leads cases by ~8 weeks.`
        : "Recent climate conditions are not driving added transmission risk.",
      weight: d.climate_signal ? 0.6 : 0.15,
      tone: d.climate_signal ? "WATCH" : "LOW",
    },
    {
      label: "Prevention gap",
      detail: `Prevention-gap index ${d.prevention_gap.toFixed(0)} (net ownership vs usage, spray coverage).`,
      weight: clamp(d.prevention_gap / 110, 0, 1),
      tone: d.prevention_gap >= 80 ? "HIGH" : d.prevention_gap >= 50 ? "WATCH" : "LOW",
    },
  ];
  return factors.sort((a, b) => b.weight - a.weight);
}
