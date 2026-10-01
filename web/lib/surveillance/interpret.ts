// Plain-language reading, findings and recommended actions for each analysis.
// Every finding is calculated from the analytics for the selected scope; an action is
// only recommended when the data meets the condition stated next to it. Actions are
// prompts for the surveillance team to review, never automatic decisions.
import { RULES } from "./pipeline";
import { fmt, fmtDate, signed } from "./display";
import type { Analytics, LagCorrelation, WeekPoint } from "./types";

/** Review thresholds used only for recommendations (signal rules live in pipeline.ts RULES). */
export const GUIDE = {
  TREND_PCT: 15, // last 4 weeks vs the 4 weeks before
  TESTING_DROP_PP: 5, // latest testing rate vs period rate
  OPD_SHARE_RISE_PCT: 25, // latest malaria share of OPD vs period share (relative)
  ABOVE_AVERAGE_PCT: RULES.CONTEXT_ABOVE_PCT, // recent environmental value vs period average
  BED_OCCUPANCY_PCT: 85,
} as const;

export type Priority = "high" | "medium" | "routine";

export interface Action {
  priority: Priority;
  text: string;
  href?: string;
  linkLabel?: string;
}

export interface Interpretation {
  /** How to read the chart or table. */
  reading: string;
  /** What the data shows for the selected scope. */
  findings: string[];
  /** What the team may want to do, with the condition that triggered it. */
  actions: Action[];
}

const ROUTINE: Action = {
  priority: "routine",
  text: "Nothing in this analysis calls for action now. Keep monitoring it each week as new data is uploaded.",
};

// ----------------------------------------------------------------------------- helpers
const nn = (xs: (number | null | undefined)[]) => xs.filter((x): x is number => x !== null && x !== undefined);
const avg = (xs: (number | null | undefined)[]) => {
  const v = nn(xs);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};
const total = (xs: (number | null)[]) => (xs.every((x) => x !== null) ? (xs as number[]).reduce((s, x) => s + x, 0) : null);
const pctChange = (now: number | null, ref: number | null) => (now === null || ref === null || ref === 0 ? null : ((now - ref) / ref) * 100);
const weeksWord = (n: number) => `${n} week${n === 1 ? "" : "s"}`;
const lagText = (lag: number) => (lag === 0 ? "in the same week" : `about ${weeksWord(lag)} earlier`);

/** Weeks submitted by every reporting district in scope (combined figures use only these). */
function complete(a: Analytics): WeekPoint[] {
  return a.weekly.filter((p) => p.complete);
}

function lastComplete(a: Analytics): WeekPoint | null {
  const w = complete(a);
  return w.length ? w[w.length - 1] : null;
}

/** Mean of the last n weeks against the mean of the whole period, in percent. */
function recentVsPeriod(w: WeekPoint[], get: (p: WeekPoint) => number | null, n = 4) {
  const recent = avg(w.slice(-n).map(get));
  const period = avg(w.map(get));
  return { recent, period, pct: pctChange(recent, period) };
}

function rel(a: Analytics, variable: string): LagCorrelation | null {
  const r = a.relationships.find((x) => x.variable === variable);
  return r?.best ? r : null;
}

function q(scopeParam: string) {
  return scopeParam ? `scope=${encodeURIComponent(scopeParam)}` : "";
}

function analyticsLink(scopeParam: string, ids: string) {
  const s = q(scopeParam);
  return `/analytics?${s ? `${s}&` : ""}a=${ids}`;
}

function alertsLink(scopeParam: string) {
  const s = q(scopeParam);
  return `/alerts${s ? `?${s}` : ""}`;
}

/** Districts in scope whose latest week carries a signal. */
function signalled(a: Analytics) {
  return a.districtSignals.filter((s) => s.latest && (s.latest.signal.level === "ELEVATED" || s.latest.signal.level === "WATCH"));
}

function verifyActions(a: Analytics, scopeParam: string): Action[] {
  return signalled(a).map((s) => {
    const l = s.latest as WeekPoint;
    const elevated = l.signal.level === "ELEVATED";
    return {
      priority: elevated ? "high" : "medium",
      text: `${s.district}: ${elevated ? "Elevated signal" : "Watch"} in the week of ${fmtDate(l.week_start)} (${l.signal.signals
        .map((x) => x.label.toLowerCase())
        .join(", ")}). Check the reports with the facilities and record a verification decision.`,
      href: alertsLink(scopeParam || `district:${s.district}`),
      linkLabel: "Open alerts",
    };
  });
}

// ----------------------------------------------------------------------------- per analysis
export function interpret(id: string, a: Analytics, scopeParam: string): Interpretation {
  const w = complete(a);
  const l = lastComplete(a);
  const place = a.scope.level === "district" ? `${a.scope.label} District` : a.scope.label === "National" ? "the reporting districts" : `${a.scope.label}`;
  const findings: string[] = [];
  const actions: Action[] = [];
  const done = (reading: string): Interpretation => ({ reading, findings, actions: actions.length ? actions : [ROUTINE] });

  switch (id) {
    case "cases_trend": {
      if (l) findings.push(`In the latest complete week (${fmtDate(l.week_start)}), ${place} reported ${fmt(l.confirmed)} confirmed cases, ${signed(l.change_vs_baseline_pct, 1, "%")} compared with the average of the 4 weeks before (${fmt(l.baseline_prev4, 1)}).`);
      const s1 = total(w.slice(-4).map((p) => p.confirmed));
      const s0 = w.length >= 8 ? total(w.slice(-8, -4).map((p) => p.confirmed)) : null;
      const trend = pctChange(s1, s0);
      if (trend !== null) findings.push(`The last 4 weeks (${fmt(s1)} cases) are ${signed(trend, 1, "%")} on the 4 weeks before (${fmt(s0)}).`);
      const peak = w.reduce<WeekPoint | null>((m, p) => (p.confirmed !== null && (!m || p.confirmed > (m.confirmed ?? -1)) ? p : m), null);
      if (peak) findings.push(`The highest week in the period was ${fmtDate(peak.week_start)} with ${fmt(peak.confirmed)} cases.`);
      actions.push(...verifyActions(a, scopeParam));
      if (trend !== null && trend >= GUIDE.TREND_PCT)
        actions.push({ priority: "medium", text: `Cases are rising (${signed(trend, 1, "%")} over 4 weeks, review point +${GUIDE.TREND_PCT}%). Check that health facilities have enough tests and ACTs and staff for the coming weeks.`, href: analyticsLink(scopeParam, "commodities,testing_cascade"), linkLabel: "Stock and testing" });
      if (trend !== null && trend <= -GUIDE.TREND_PCT)
        actions.push({ priority: "routine", text: `Cases are falling (${signed(trend, 1, "%")} over 4 weeks). Before reading this as a real decline, check that reporting completeness held steady.`, href: analyticsLink(scopeParam, "reporting"), linkLabel: "Reporting" });
      return done("The blue line shows confirmed cases each week, the gold line the 4-week moving average, and the grey dashed line the average of the 4 previous weeks (the baseline). Coloured dots mark weeks where a signal rule fired. A blue line well above the grey line means more cases than usual.");
    }

    case "testing_cascade": {
      const t = a.totals;
      findings.push(`Over the period, ${fmt(t.testing_rate_pct, 1)}% of suspected cases were tested and ${fmt(t.positivity_pct, 1)}% of tests were positive.`);
      if (l?.testing_rate_pct != null) findings.push(`In the latest complete week, the testing rate was ${fmt(l.testing_rate_pct, 1)}%.`);
      const drop = l?.testing_rate_pct != null && t.testing_rate_pct != null ? l.testing_rate_pct - t.testing_rate_pct : null;
      if (drop !== null && drop <= -GUIDE.TESTING_DROP_PP)
        actions.push({ priority: "medium", text: `The testing rate fell ${fmt(Math.abs(drop), 1)} points below the period rate (review point ${GUIDE.TESTING_DROP_PP} points). Check RDT stock and whether facilities are testing every suspected case before treatment.`, href: analyticsLink(scopeParam, "commodities"), linkLabel: "RDT stock" });
      return done("Purple: suspected cases. Blue: people tested. Gold: confirmed cases. The dashed green line (right axis) is the share of suspected cases that were tested. A widening gap between suspected and tested means some patients are not being tested.");
    }

    case "positivity": {
      if (l?.positivity_pct != null) findings.push(`Test positivity in the latest complete week was ${fmt(l.positivity_pct, 1)}% (${signed(l.positivity_change_pp, 2)} percentage points compared with the 4 weeks before). Over the whole period it was ${fmt(a.totals.positivity_pct, 1)}%.`);
      if (l?.positivity_change_pp != null && l.positivity_change_pp >= RULES.POSITIVITY_RISE_PP) {
        const testingDown = l.testing_rate_pct != null && a.totals.testing_rate_pct != null && l.testing_rate_pct < a.totals.testing_rate_pct - GUIDE.TESTING_DROP_PP;
        actions.push({
          priority: "medium",
          text: testingDown
            ? `Positivity rose ${fmt(l.positivity_change_pp, 1)} points, but the testing rate also fell. Fewer tests can push positivity up, so confirm testing practice before reading this as more transmission.`
            : `Positivity rose ${fmt(l.positivity_change_pp, 1)} points (signal rule: +${RULES.POSITIVITY_RISE_PP}) while testing held steady. This may mean more transmission. Verify the figures with the facilities that reported the increase.`,
          href: alertsLink(scopeParam),
          linkLabel: "Alerts",
        });
      }
      return done("The red line is the share of malaria tests that were positive each week; the grey dashed line is its average over the 4 weeks before. Positivity rising while testing stays steady suggests more transmission. Rising positivity with less testing may only reflect who was tested.");
    }

    case "incidence": {
      if (l?.incidence_per_1000 != null) findings.push(`In the latest complete week there were ${fmt(l.incidence_per_1000, 2)} confirmed cases per 1,000 people at risk, and ${fmt(a.totals.incidence_per_1000, 1)} per 1,000 over the whole period.`);
      const r = recentVsPeriod(w, (p) => p.incidence_per_1000);
      if (r.pct !== null) findings.push(`Average weekly incidence over the last 4 weeks is ${signed(r.pct, 1, "%")} compared with the period average.`);
      if (a.scope.level !== "district") {
        const top = [...a.prioritisation].filter((p) => p.recent_incidence_per_1000 !== null).sort((x, y) => (y.recent_incidence_per_1000 ?? 0) - (x.recent_incidence_per_1000 ?? 0))[0];
        if (top) {
          findings.push(`${top.district} has the highest incidence over the last 4 weeks (${fmt(top.recent_incidence_per_1000, 2)} per 1,000).`);
          actions.push({ priority: "routine", text: `Start district follow-up with ${top.district}, which has the highest recent incidence.`, href: `/districts/${encodeURIComponent(top.district)}`, linkLabel: "District profile" });
        }
      }
      return done("Incidence adjusts case counts for population size, so districts of different sizes can be compared. Higher values mean more confirmed cases for every 1,000 people at risk.");
    }

    case "severity": {
      const t = a.totals;
      findings.push(`${fmt(t.severe_pct_of_confirmed, 2)}% of confirmed cases were severe; there were ${fmt(t.admissions_per_100_confirmed, 1)} admissions per 100 confirmed cases and ${fmt(t.deaths)} recorded deaths (${fmt(t.deaths_per_1000_confirmed, 2)} per 1,000 confirmed).`);
      const deaths4 = nn(w.slice(-4).map((p) => p.deaths)).reduce((s, x) => s + x, 0);
      if (deaths4 > 0) {
        findings.push(`${fmt(deaths4)} malaria death${deaths4 > 1 ? "s were" : " was"} recorded in the last 4 complete weeks.`);
        actions.push({
          priority: "high",
          text: `Make sure ${deaths4 > 1 ? `each of the ${fmt(deaths4)} malaria deaths` : "the malaria death"} from the last 4 weeks has a death review that confirms the cause and records any delay in care.`,
        });
      }
      if (l?.severe != null && l.severe_baseline_prev4 != null && l.severe >= RULES.SEVERE_RATIO * l.severe_baseline_prev4 && l.severe - l.severe_baseline_prev4 >= RULES.SEVERE_MIN_EXCESS)
        actions.push({ priority: "high", text: `Severe cases (${fmt(l.severe)}) are at least ${RULES.SEVERE_RATIO}× the recent average (${fmt(l.severe_baseline_prev4, 1)}). Check referral pathways and whether hospitals have the supplies to treat severe malaria.` });
      return done("Bars show malaria admissions. Lines show severe cases (orange) and deaths (red). Deaths are small counts, so a single week can move them; a sustained rise in severe cases matters more than a single week.");
    }

    case "opd_share": {
      if (l?.opd_malaria_share_pct != null) findings.push(`Malaria was ${fmt(l.opd_malaria_share_pct, 1)}% of outpatient visits in the latest complete week, compared with ${fmt(a.totals.opd_malaria_share_pct, 1)}% over the period.`);
      const rise = pctChange(l?.opd_malaria_share_pct ?? null, a.totals.opd_malaria_share_pct);
      if (rise !== null && rise >= GUIDE.OPD_SHARE_RISE_PCT)
        actions.push({ priority: "medium", text: `Malaria makes up a larger share of outpatient visits than usual (${signed(rise, 0, "%")} relative to the period, review point +${GUIDE.OPD_SHARE_RISE_PCT}%). Check outpatient staffing and supplies at the busiest facilities.` });
      return done("The share of all outpatient visits that were confirmed malaria. It shows how much of the facilities' workload malaria takes up, whatever the overall number of visits.");
    }

    case "baseline_deviation": {
      const fired = w.filter((p) => (p.change_vs_baseline_pct ?? -Infinity) >= RULES.CASE_DEVIATION_PCT);
      findings.push(`${weeksWord(fired.length)} in the period ${fired.length === 1 ? "was" : "were"} ${RULES.CASE_DEVIATION_PCT}% or more above the average of the 4 weeks before.`);
      if (l?.change_vs_baseline_pct != null) findings.push(`The latest complete week is ${signed(l.change_vs_baseline_pct, 1, "%")} against its baseline.`);
      actions.push(...verifyActions(a, scopeParam));
      return done(`Each bar is a week's change in confirmed cases compared with the average of the 4 weeks before. Bars that reach the red line (+${RULES.CASE_DEVIATION_PCT}%) meet the case-based signal rule.`);
    }

    case "anomaly": {
      const fired = w.filter((p) => (p.z_prev8 ?? -Infinity) >= RULES.Z_THRESHOLD);
      findings.push(`${weeksWord(fired.length)} in the period had an anomaly score of ${RULES.Z_THRESHOLD} or more.`);
      if (l?.z_prev8 != null) findings.push(`The latest complete week scores ${fmt(l.z_prev8, 2)}.`);
      actions.push(...verifyActions(a, scopeParam));
      return done(`The score (z) measures how far a week's cases are from the average of the previous 8 weeks, in standard deviations. Around 0 is normal; ${RULES.Z_THRESHOLD} or more (red line) is unusually high and meets the signal rule.`);
    }

    case "signal_timeline": {
      const el = w.filter((p) => p.signal.level === "ELEVATED").length;
      const wa = w.filter((p) => p.signal.level === "WATCH").length;
      findings.push(`Over ${weeksWord(w.length)} of fully reported data: ${el} Elevated and ${wa} Watch week${wa === 1 ? "" : "s"} for ${place}.`);
      const last = [...w].reverse().find((p) => p.signal.level === "ELEVATED" || p.signal.level === "WATCH");
      if (last) findings.push(`The most recent signal was in the week of ${fmtDate(last.week_start)}.`);
      actions.push(...verifyActions(a, scopeParam));
      return done("One row per week, newest first. It lists the values each rule checked and which rules fired. A case-based rule must fire for any signal. A case-based rule alone gives Watch; together with a positivity or severe-case rule it gives Elevated.");
    }

    case "projection": {
      const f = a.forecast;
      const shown = f.horizons.filter((h) => h.shown);
      const h1 = f.horizons[0];
      if (shown.length) {
        findings.push(`For the week of ${fmtDate(shown[0].week_start)}, the model estimates ${fmt(shown[0].estimate)} cases (range ${fmt(shown[0].lower)}–${fmt(shown[0].upper)}).`);
        actions.push({ priority: "routine", text: "Use the estimate and its range for stock and staffing planning only, not as an alert. Compare it with the observed figures each week." });
      } else {
        findings.push("No projection is shown: tested against past weeks, the model was not more accurate than assuming next week equals this week.");
        if (h1?.backtest.mae != null) findings.push(`One week ahead, its average error was ${fmt(h1.backtest.mae, 1)} cases, against ${fmt(h1.backtest.naive_mae, 1)} for the simple estimate (${h1.backtest.n} test weeks).`);
        actions.push({ priority: "routine", text: "Plan from the observed trend and the signal rules. A projection will appear here automatically once enough data has been uploaded for the model to beat the simple estimate." });
      }
      return done("A projection is shown only for horizons where, tested on past weeks, it was more accurate than the simple estimate “next week = this week”. The table shows that test for each horizon.");
    }

    case "rainfall": {
      const r = recentVsPeriod(w, (p) => p.rainfall_mm);
      if (r.recent !== null) findings.push(`Rainfall averaged ${fmt(r.recent, 1)} mm a week over the last 4 weeks (${signed(r.pct, 0, "%")} compared with the period average of ${fmt(r.period, 1)} mm).`);
      const c = rel(a, "rainfall_mm");
      if (c?.best) findings.push(`In this data, cases are most closely associated with rainfall ${lagText(c.best.lag)} (r = ${fmt(c.best.r, 2)}, ${c.strength}).`);
      if (r.pct !== null && r.pct >= GUIDE.ABOVE_AVERAGE_PCT)
        actions.push({
          priority: "medium",
          text: `Recent rainfall is ${signed(r.pct, 0, "%")} above average (review point +${GUIDE.ABOVE_AVERAGE_PCT}%)${c?.best && c.best.r > 0 && c.strength !== "weak" && c.best.lag > 0 ? `, and cases have tended to follow rainfall by about ${weeksWord(c.best.lag)}` : ""}. Consider larval source management and checking ACT and RDT stock for the weeks ahead.`,
          href: analyticsLink(scopeParam, "vector,commodities"),
          linkLabel: "Vectors and stock",
        });
      return done("Bars show weekly rainfall and the gold line its 4-week average; the red line (right axis) shows confirmed cases. Look for case increases that follow rainfall by a few weeks. A shared pattern is an association, not proof of cause.");
    }

    case "climate": {
      const t = recentVsPeriod(w, (p) => p.temperature_c);
      const h = recentVsPeriod(w, (p) => p.humidity_pct);
      if (t.recent !== null) findings.push(`Mean temperature over the last 4 weeks was ${fmt(t.recent, 1)} °C (period average ${fmt(t.period, 1)} °C).`);
      if (h.recent !== null) findings.push(`Relative humidity over the last 4 weeks was ${fmt(h.recent, 1)}% (period average ${fmt(h.period, 1)}%).`);
      for (const v of ["temperature_c", "humidity_pct"]) {
        const c = rel(a, v);
        if (c?.best && c.strength !== "weak") findings.push(`${c.label} shows a ${c.strength} association with cases ${lagText(c.best.lag)} (r = ${fmt(c.best.r, 2)}).`);
      }
      return done("Warm, humid weeks favour mosquito breeding and parasite development. Use these lines as context for case changes, not as a signal on their own.");
    }

    case "vector": {
      const m = recentVsPeriod(w, (p) => p.mosquito_density);
      const lv = recentVsPeriod(w, (p) => p.larval_density);
      if (m.recent !== null) findings.push(`The mosquito density index averaged ${fmt(m.recent, 2)} over the last 4 weeks (${signed(m.pct, 0, "%")} compared with the period average).`);
      if (lv.recent !== null) findings.push(`The larval density index averaged ${fmt(lv.recent, 2)} over the last 4 weeks (${signed(lv.pct, 0, "%")} compared with the period average).`);
      const high = [m.pct !== null && m.pct >= GUIDE.ABOVE_AVERAGE_PCT ? "mosquito" : null, lv.pct !== null && lv.pct >= GUIDE.ABOVE_AVERAGE_PCT ? "larval" : null].filter(Boolean);
      if (high.length)
        actions.push({ priority: "medium", text: `The ${high.join(" and ")} density ${high.length > 1 ? "indices are" : "index is"} above average (review point +${GUIDE.ABOVE_AVERAGE_PCT}%). Consider entomological follow-up and larval source management where the indices are highest.` });
      return done("These indices come from entomological surveillance. Higher larval density usually comes before higher adult mosquito density, which can come before more cases.");
    }

    case "vegetation_mobility": {
      const n = recentVsPeriod(w, (p) => p.ndvi);
      const mob = recentVsPeriod(w, (p) => p.mobility_index);
      if (n.recent !== null) findings.push(`NDVI over the last 4 weeks averaged ${fmt(n.recent, 3)} (period ${fmt(n.period, 3)}).`);
      if (mob.recent !== null) findings.push(`The human mobility index over the last 4 weeks averaged ${fmt(mob.recent, 3)} (${signed(mob.pct, 0, "%")} compared with the period average).`);
      if (mob.pct !== null && mob.pct >= GUIDE.ABOVE_AVERAGE_PCT)
        actions.push({ priority: "routine", text: "Mobility is above average. When verifying signals, ask about recent travel to check for imported cases." });
      return done("NDVI measures how green the vegetation is; dense vegetation can provide mosquito habitat. The mobility index tracks population movement, which can bring in infections from elsewhere.");
    }

    case "env_lag": {
      const top = a.relationships
        .filter((r) => r.best && r.strength !== "weak")
        .sort((x, y) => Math.abs(y.best?.r ?? 0) - Math.abs(x.best?.r ?? 0))
        .slice(0, 3);
      if (top.length)
        for (const r of top) findings.push(`${r.label}: ${r.strength} ${(r.best?.r ?? 0) > 0 ? "positive" : "negative"} association with cases ${lagText(r.best?.lag ?? 0)} (r = ${fmt(r.best?.r ?? null, 2)}, ${r.best?.n} weeks).`);
      else findings.push("No variable shows more than a weak association with cases.");
      const lead = top.find((r) => r.group === "environment" && (r.best?.lag ?? 0) > 0 && (r.best?.r ?? 0) > 0);
      if (lead?.best)
        actions.push({ priority: "routine", text: `${lead.label} tends to move about ${weeksWord(lead.best.lag)} ahead of cases in this data. When it rises, watch the following weeks' case reports more closely. Treat this as a prompt to watch, not a forecast.` });
      return done("Each cell is the correlation (r, from −1 to 1) between cases and a variable measured that many weeks earlier. Gold cells are positive, blue negative; deeper colour means a stronger link. The outlined cell is the strongest lag. With one season of data, shared seasonality can make correlations look stronger than they are.");
    }

    case "reporting": {
      const qd = a.quality;
      if (l?.reporting_completeness_pct != null) findings.push(`Reporting completeness in the latest complete week was ${fmt(l.reporting_completeness_pct, 1)}%; ${qd.reporting_completeness.weeks_below_90} district-week(s) in the period were below ${RULES.COMPLETENESS_MIN_PCT}%.`);
      if (qd.reporting_delay_days.mean != null) findings.push(`Reports arrived on average ${fmt(qd.reporting_delay_days.mean, 1)} days after the week ended; ${qd.reporting_delay_days.weeks_above_3} district-week(s) took more than ${RULES.DELAY_MAX_DAYS} days.`);
      const recentLow = w.slice(-4).filter((p) => p.reporting_completeness_pct != null && p.reporting_completeness_pct < RULES.COMPLETENESS_MIN_PCT);
      if (recentLow.length)
        actions.push({ priority: "medium", text: `Completeness was below ${RULES.COMPLETENESS_MIN_PCT}% in ${weeksWord(recentLow.length)} of the last 4. Follow up with facilities that have not reported, and treat signals in those weeks with caution.` });
      const recentLate = w.slice(-4).filter((p) => p.reporting_delay_days != null && p.reporting_delay_days > RULES.DELAY_MAX_DAYS);
      if (recentLate.length)
        actions.push({ priority: "medium", text: `Reports were late (more than ${RULES.DELAY_MAX_DAYS} days) in ${weeksWord(recentLate.length)} of the last 4. Find out which facilities report late and what is delaying them.` });
      return done(`The green line is the share of expected reports that were received; below the red line (${RULES.COMPLETENESS_MIN_PCT}%) signals are less reliable. The dashed line (right axis) is the average number of days reports arrived after the week ended.`);
    }

    case "facilities": {
      if (l?.facilities_expected != null) {
        const missing = l.facilities_expected - (l.facilities_reporting ?? 0);
        findings.push(`${fmt(l.facilities_reporting)} of ${fmt(l.facilities_expected)} expected facilities reported in the latest complete week.`);
        if (missing > 0)
          actions.push({ priority: "medium", text: `${fmt(missing)} facilit${missing === 1 ? "y has" : "ies have"} not reported for the latest complete week. Get their reports so that the week's figures are complete.` });
      }
      return done("The dashed line is the number of facilities expected to report; the solid line is how many did. A gap between them means figures for that week are incomplete.");
    }

    case "commodities": {
      if (l) findings.push(`In the latest complete week there were ${fmt(l.act_stock_days, a.scope.level === "district" ? 0 : 1)} days of ACT stock and ${fmt(l.rdt_stock_days, a.scope.level === "district" ? 0 : 1)} days of RDT stock.`);
      const so = nn(w.slice(-4).map((p) => p.stockout_days)).reduce((s, x) => s + x, 0);
      if (so > 0) findings.push(`${fmt(so)} stockout day${so > 1 ? "s were" : " was"} recorded in the last 4 complete weeks.`);
      for (const p of a.prioritisation) {
        const low = [
          p.act_stock_days != null && p.act_stock_days < RULES.STOCK_REVIEW_DAYS ? `ACT ${fmt(p.act_stock_days)} days` : null,
          p.rdt_stock_days != null && p.rdt_stock_days < RULES.STOCK_REVIEW_DAYS ? `RDT ${fmt(p.rdt_stock_days)} days` : null,
        ].filter(Boolean);
        if (low.length)
          actions.push({ priority: "high", text: `${p.district}: ${low.join(", ")} of stock left (review point ${RULES.STOCK_REVIEW_DAYS} days). Request resupply or move stock from other facilities.` });
      }
      if (so > 0) actions.push({ priority: "medium", text: "Find out the cause of the recent stockouts (ordering, delivery or demand) and check that patients were not left untreated." });
      return done(`Lines show days of ACT (treatment) and RDT (test) stock left; bars (right axis) are days with a stockout. Stock under ${RULES.STOCK_REVIEW_DAYS} days is flagged for review.`);
    }

    case "beds": {
      const b = recentVsPeriod(w, (p) => p.bed_occupancy_pct);
      if (l?.bed_occupancy_pct != null) findings.push(`Bed occupancy was ${fmt(l.bed_occupancy_pct, 1)}% in the latest complete week (last 4 weeks average ${fmt(b.recent, 1)}%, period ${fmt(b.period, 1)}%).`);
      if (l?.bed_occupancy_pct != null && l.bed_occupancy_pct >= GUIDE.BED_OCCUPANCY_PCT)
        actions.push({ priority: "medium", text: `Bed occupancy is at or above ${GUIDE.BED_OCCUPANCY_PCT}%. Check surge capacity and the referral arrangements between hospitals.` });
      return done("Bars show malaria admissions; the pink line (right axis) shows bed occupancy. High occupancy combined with more admissions points to pressure on hospital capacity.");
    }

    case "prevention_coverage": {
      if (l?.bed_net_coverage_pct != null) findings.push(`Recorded bed-net coverage is ${fmt(l.bed_net_coverage_pct, 1)}% and IRS coverage ${fmt(l.irs_pct, 1)}% in the latest complete week.`);
      for (const p of a.prioritisation) {
        if (p.bed_net_coverage_pct != null && p.bed_net_coverage_pct < RULES.NET_COVERAGE_REVIEW_PCT)
          actions.push({ priority: "medium", text: `${p.district}: bed-net coverage is ${fmt(p.bed_net_coverage_pct, 1)}% (review point ${RULES.NET_COVERAGE_REVIEW_PCT}%). Consider a targeted net distribution or a net-use campaign.` });
        if (p.irs_pct != null && p.irs_pct < RULES.IRS_COVERAGE_REVIEW_PCT)
          actions.push({ priority: "medium", text: `${p.district}: IRS coverage is ${fmt(p.irs_pct, 1)}% (review point ${RULES.IRS_COVERAGE_REVIEW_PCT}%). Consider including it in the next spraying round.` });
      }
      return done("Coverage is as recorded in the uploaded data. The association with cases describes the data only; it does not measure how well prevention works.");
    }

    case "prioritisation": {
      const top = a.prioritisation[0];
      const one = a.prioritisation.length === 1;
      if (top)
        findings.push(
          `${top.district} ${one ? "currently has" : "ranks first, with"} ${top.level === "ELEVATED" ? "an Elevated signal" : top.level === "WATCH" ? "a Watch signal" : "no current signal"} and ${fmt(top.recent_incidence_per_1000, 2)} cases per 1,000 over the last 4 weeks.`,
        );
      if (top?.review_points.length)
        actions.push({
          priority: top.level === "ELEVATED" ? "high" : "medium",
          text: `${one ? `Points to review for ${top.district}` : `Look at ${top.district} first`}: ${top.review_points.join("; ")}.`,
          href: `/districts/${encodeURIComponent(top.district)}`,
          linkLabel: "District profile",
        });
      return done("Districts are ordered by current signal (Elevated first), then by incidence over the last 4 weeks. The last column lists the points behind each district's position. Use it to decide where to look first, not as a final allocation.");
    }

    case "district_comparison": {
      const rows = a.districts.filter((d) => d.hasData);
      const byInc = [...rows].sort((x, y) => (y.totals?.incidence_per_1000 ?? 0) - (x.totals?.incidence_per_1000 ?? 0))[0];
      const byPos = [...rows].sort((x, y) => (y.totals?.positivity_pct ?? 0) - (x.totals?.positivity_pct ?? 0))[0];
      if (byInc) findings.push(`Highest incidence over the period: ${byInc.district} (${fmt(byInc.totals?.incidence_per_1000 ?? null, 1)} per 1,000).`);
      if (byPos) findings.push(`Highest test positivity: ${byPos.district} (${fmt(byPos.totals?.positivity_pct ?? null, 1)}%).`);
      const noData = a.districts.length - rows.length;
      if (noData > 0) {
        findings.push(`${noData} of ${a.districts.length} districts in ${a.scope.label === "National" ? "the country" : a.scope.label} have no data yet.`);
        actions.push({ priority: "medium", text: `Upload weekly reports for the ${noData} district${noData > 1 ? "s" : ""} without data so that they can be compared.`, href: "/data", linkLabel: "Upload data" });
      }
      const stale = rows.filter((d) => d.stale);
      if (stale.length) actions.push({ priority: "medium", text: `No recent data for ${stale.map((d) => d.district).join(", ")}. Upload the latest weekly reports.`, href: "/data", linkLabel: "Upload data" });
      return done("Districts with data side by side. Compare incidence and positivity rather than raw case counts, because districts differ in population.");
    }

    case "data_quality": {
      const qd = a.quality;
      findings.push(`${fmt(qd.records)} district-week records; ${fmt(qd.missing_values_total)} missing values in the columns supplied.`);
      if (qd.columns_not_supplied.length) findings.push(`${qd.columns_not_supplied.length} column(s) were not supplied, so the analyses that need them are unavailable.`);
      if (a.freshness.stale)
        actions.push({ priority: "high", text: `The latest data is ${a.freshness.days_since_latest} days old (week of ${fmtDate(a.freshness.latest_week)}). Upload this week's reports so that signals are current.`, href: "/data", linkLabel: "Upload data" });
      if (qd.validation.some((v) => v.level === "error"))
        actions.push({ priority: "medium", text: "Some validation checks failed. Review them on Data Management and correct the source file.", href: "/data", linkLabel: "Validation" });
      return done("A summary of the data behind every other analysis. Missing values are left missing, never filled in, and analyses that need missing columns are marked unavailable.");
    }

    default:
      return { reading: "", findings: [], actions: [] };
  }
}

/**
 * Analyses worth opening for the current data, with the reason. Based on the same
 * conditions as the recommended actions above.
 */
export function suggestAnalyses(a: Analytics): { id: string; reason: string }[] {
  if (!a.hasData) return [];
  const out: { id: string; reason: string }[] = [];
  const add = (id: string, reason: string) => {
    if (!out.some((s) => s.id === id)) out.push({ id, reason });
  };
  const sig = signalled(a);
  if (sig.length) {
    add("signal_timeline", `${sig.length} district${sig.length > 1 ? "s have" : " has"} a signal in the latest week`);
    add("cases_trend", "See the case increase behind the signal");
  } else {
    add("cases_trend", "Weekly starting point: the case trend");
  }
  const w = complete(a);
  const s1 = total(w.slice(-4).map((p) => p.confirmed));
  const s0 = w.length >= 8 ? total(w.slice(-8, -4).map((p) => p.confirmed)) : null;
  const trend = pctChange(s1, s0);
  if (trend !== null && Math.abs(trend) >= GUIDE.TREND_PCT) add("baseline_deviation", `Cases ${trend > 0 ? "up" : "down"} ${fmt(Math.abs(trend), 0)}% over 4 weeks`);
  if (a.prioritisation.some((p) => p.review_points.some((r) => r.includes("stock")))) add("commodities", "Low ACT/RDT stock or recent stockouts");
  if (w.slice(-4).some((p) => p.reporting_completeness_pct != null && p.reporting_completeness_pct < RULES.COMPLETENESS_MIN_PCT))
    add("reporting", "Reporting completeness below 90% recently");
  const rain = recentVsPeriod(w, (p) => p.rainfall_mm);
  if (rain.pct !== null && rain.pct >= GUIDE.ABOVE_AVERAGE_PCT) add("rainfall", `Rainfall ${fmt(rain.pct, 0)}% above average`);
  const deaths4 = nn(w.slice(-4).map((p) => p.deaths)).reduce((s, x) => s + x, 0);
  if (deaths4 > 0) add("severity", `${deaths4} death${deaths4 > 1 ? "s" : ""} in the last 4 weeks`);
  if (a.prioritisation.some((p) => p.review_points.some((r) => r.startsWith("Bed-net") || r.startsWith("IRS")))) add("prevention_coverage", "Prevention coverage below review points");
  if (a.scope.level !== "district" && a.districtsWithData.length > 1) add("district_comparison", "Compare the reporting districts");
  if (a.freshness.stale) add("data_quality", "Data is out of date");
  return out.slice(0, 6);
}
