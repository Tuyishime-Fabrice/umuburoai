// Plain-language findings generated from the analytics. Each statement is computed
// from the data and only made when the data supports it.
import { fmt, fmtDate } from "./display";
import type { Analytics, SignalLevel } from "./types";

export interface Insight {
  tone: "alert" | "watch" | "info" | "good";
  text: string;
  href?: string;
}

const LEVEL_WORD: Record<SignalLevel, string> = {
  ELEVATED: "Elevated signal",
  WATCH: "Watch",
  NONE: "No signal",
  INSUFFICIENT: "Not evaluated",
};

export function buildInsights(a: Analytics, scopeParam: string): Insight[] {
  const out: Insight[] = [];
  if (!a.hasData) return out;
  const q = scopeParam ? `scope=${encodeURIComponent(scopeParam)}&` : "";

  // 1. Current signals per district
  for (const s of a.districtSignals) {
    const l = s.latest;
    if (!l || (l.signal.level !== "ELEVATED" && l.signal.level !== "WATCH")) continue;
    const lead = l.signal.signals[0];
    out.push({
      tone: l.signal.level === "ELEVATED" ? "alert" : "watch",
      text: `${s.district} — ${LEVEL_WORD[l.signal.level]} in the week of ${fmtDate(l.week_start)}: ${lead ? lead.label.toLowerCase() : "case-based rule fired"}${
        l.change_vs_baseline_pct !== null ? ` (${l.change_vs_baseline_pct > 0 ? "+" : ""}${fmt(l.change_vs_baseline_pct, 1)}% vs recent baseline)` : ""
      }. Requires verification.`,
      href: `/alerts?scope=${encodeURIComponent(`district:${s.district}`)}`,
    });
  }

  // Combined figures only use weeks that every reporting district has submitted.
  const w = a.weekly.filter((p) => p.complete);

  // 2. Four-week trend
  if (w.length >= 8) {
    const last4 = w.slice(-4).map((p) => p.confirmed);
    const prev4 = w.slice(-8, -4).map((p) => p.confirmed);
    if ([...last4, ...prev4].every((x) => x !== null)) {
      const s1 = (last4 as number[]).reduce((s, x) => s + x, 0);
      const s0 = (prev4 as number[]).reduce((s, x) => s + x, 0);
      if (s0 > 0) {
        const pct = ((s1 - s0) / s0) * 100;
        out.push({
          tone: pct >= 15 ? "watch" : pct <= -15 ? "good" : "info",
          text: `Confirmed cases in the last 4 weeks (${fmt(s1)}) were ${fmt(Math.abs(pct), 1)}% ${pct >= 0 ? "higher" : "lower"} than in the 4 weeks before (${fmt(s0)}).`,
          href: `/analytics?${q}a=cases_trend,baseline_deviation`,
        });
      }
    }
  }

  // 3. Positivity now vs period
  const l = w.length ? w[w.length - 1] : null;
  if (l?.positivity_pct != null && a.totals.positivity_pct != null) {
    const d = l.positivity_pct - a.totals.positivity_pct;
    out.push({
      tone: d >= 3 ? "watch" : "info",
      text: `Test positivity in the latest week was ${fmt(l.positivity_pct, 1)}%, compared with ${fmt(a.totals.positivity_pct, 1)}% over the whole period.`,
      href: `/analytics?${q}a=positivity,testing_cascade`,
    });
  }

  // 4. Strongest environmental association
  const env = a.relationships
    .filter((r) => r.group === "environment" && r.best && r.strength !== "weak")
    .sort((x, y) => Math.abs((y.best?.r ?? 0)) - Math.abs((x.best?.r ?? 0)))[0];
  if (env?.best) {
    out.push({
      tone: "info",
      text: `${env.label} shows the strongest association with confirmed cases (r = ${fmt(env.best.r, 2)}, ${
        env.best.lag === 0 ? "same week" : `${env.best.lag} week${env.best.lag > 1 ? "s" : ""} earlier`
      }). This is an association in the data, not proof of cause.`,
      href: `/analytics?${q}a=env_lag,rainfall`,
    });
  }

  // 5. Commodities
  const lowStock = a.prioritisation.filter((p) =>
    p.review_points.some((r) => r.startsWith("ACT stock") || r.startsWith("RDT stock") || r.includes("stockout")),
  );
  if (lowStock.length) {
    out.push({
      tone: "watch",
      text: `Medicine stock needs review in ${lowStock.map((p) => p.district).join(", ")} (low ACT/RDT stock days or recent stockouts).`,
      href: `/analytics?${q}a=commodities,prioritisation`,
    });
  }

  // 6. Prevention coverage
  const lowNets = a.prioritisation.filter((p) => p.review_points.some((r) => r.startsWith("Bed-net")));
  if (lowNets.length) {
    out.push({
      tone: "info",
      text: `Bed-net coverage is below 80% in ${lowNets.map((p) => `${p.district} (${fmt(p.bed_net_coverage_pct, 1)}%)`).join(", ")}.`,
      href: `/analytics?${q}a=prevention_coverage,prioritisation`,
    });
  }

  // 7. Reporting coverage
  if (a.scope.level !== "district") {
    const missing = a.coverage.districts_total - a.coverage.districts_with_data;
    if (missing > 0) {
      out.push({
        tone: "info",
        text: `${a.coverage.districts_with_data} of ${a.coverage.districts_total} districts in ${a.scope.label === "National" ? "the country" : a.scope.label} have surveillance data; ${missing} have not reported yet. Figures cover reporting districts only.`,
        href: "/districts",
      });
    }
  }

  // 8. Freshness
  if (a.freshness.stale) {
    out.push({
      tone: "watch",
      text: `No new weekly data for ${a.freshness.days_since_latest} days (latest week ${fmtDate(a.freshness.latest_week)}). Upload the latest reports to keep signals current.`,
      href: "/data",
    });
  }
  return out;
}
