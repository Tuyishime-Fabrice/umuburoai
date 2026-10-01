import Link from "next/link";
import { ArrowRight, BookOpen, Info, ListChecks, Lightbulb } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Legend, SeriesChart } from "@/components/charts/series-chart";
import { LevelBadge } from "@/components/surveillance/level-badge";
import { ANALYSES } from "@/lib/surveillance/catalog";
import { interpret, type Action, type Priority } from "@/lib/surveillance/interpret";
import { LEVEL_HEX, chartRows, fmt, fmtDate, signed } from "@/lib/surveillance/display";
import type { Analytics, LagCorrelation } from "@/lib/surveillance/types";

const C = {
  cyan: "#38bdf8",
  gold: "#f5b301",
  slate: "#94a3b8",
  red: "#ef4444",
  violet: "#a78bfa",
  green: "#22c55e",
  orange: "#f97316",
  teal: "#22d3ee",
  pink: "#f472b6",
};

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Stats({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">{children}</div>;
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

const PRIORITY: Record<Priority, { label: string; color: string; soft: string }> = {
  high: { label: "Act now", color: "var(--risk-high)", soft: "var(--risk-high-soft)" },
  medium: { label: "Review", color: "var(--risk-watch)", soft: "var(--risk-watch-soft)" },
  routine: { label: "Routine", color: "var(--risk-low)", soft: "var(--risk-low-soft)" },
};

export function ActionItem({ action, source }: { action: Action; source?: React.ReactNode }) {
  const p = PRIORITY[action.priority];
  return (
    <li className="flex items-start gap-2.5 text-sm">
      <span
        className="mt-0.5 w-16 shrink-0 rounded px-1.5 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wide"
        style={{ color: p.color, background: p.soft }}
      >
        {p.label}
      </span>
      <span className="min-w-0">
        {action.text}
        {action.href && (
          <Link href={action.href} className="ml-1.5 inline-flex items-center gap-0.5 whitespace-nowrap text-primary hover:underline">
            {action.linkLabel ?? "Open"} <ArrowRight className="h-3 w-3" />
          </Link>
        )}
        {source && <span className="mt-0.5 block text-[11px] text-muted-foreground">{source}</span>}
      </span>
    </li>
  );
}

function Panel({ id, a, scopeParam, children }: { id: string; a: Analytics; scopeParam: string; children: React.ReactNode }) {
  const def = ANALYSES.find((d) => d.id === id);
  const reason = def?.unavailable(a) ?? null;
  const read = reason ? null : interpret(id, a, scopeParam);
  return (
    <Card id={id} className="scroll-mt-24">
      <CardHeader className="pb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">{def?.category}</p>
        <CardTitle className="text-base">
          {def?.title} · <span className="font-normal text-muted-foreground">{a.scope.label}</span>
        </CardTitle>
        {def && <p className="text-xs text-muted-foreground">{def.description}</p>}
      </CardHeader>
      <CardContent>
        {reason ? (
          <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">Not available: {reason}.</p>
        ) : (
          <>
            {read?.reading && (
              <p className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>
                  <span className="font-semibold text-foreground">How to read this: </span>
                  {read.reading}
                </span>
              </p>
            )}
            {children}
          </>
        )}
        {!reason && a.totals.partial_weeks > 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {a.totals.partial_weeks} week(s) not yet submitted by every reporting district are left blank in combined charts.
          </p>
        )}
        {read && (read.findings.length > 0 || read.actions.length > 0) && (
          <div className="mt-5 grid gap-4 border-t border-border pt-4 lg:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Lightbulb className="h-3.5 w-3.5 text-primary" /> What the data shows
              </p>
              {read.findings.length ? (
                <ul className="list-disc space-y-1.5 pl-5 text-sm marker:text-muted-foreground">
                  {read.findings.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No further findings for this scope.</p>
              )}
            </div>
            <div className="min-w-0">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <ListChecks className="h-3.5 w-3.5 text-primary" /> Recommended actions
              </p>
              <ul className="space-y-2">
                {read.actions.map((x) => (
                  <ActionItem key={x.text} action={x} />
                ))}
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function sum(xs: (number | null)[]) {
  const v = xs.filter((x): x is number => x !== null);
  return v.length === xs.length ? v.reduce((s, x) => s + x, 0) : null;
}

function LagHeatmap({ rows }: { rows: LagCorrelation[] }) {
  const lags = rows[0]?.lags.map((l) => l.lag) ?? [];
  const color = (r: number | null) => {
    if (r === null) return "transparent";
    const a = Math.min(1, Math.abs(r));
    return r >= 0 ? `rgba(245,179,1,${0.12 + a * 0.6})` : `rgba(56,189,248,${0.12 + a * 0.6})`;
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="px-2 py-1 text-left font-medium text-muted-foreground">Variable</th>
            {lags.map((l) => (
              <th key={l} className="px-1 py-1 text-center font-medium text-muted-foreground">
                {l === 0 ? "same wk" : `−${l} wk`}
              </th>
            ))}
            <th className="px-2 py-1 text-left font-medium text-muted-foreground">Strongest</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.variable}>
              <td className="whitespace-nowrap px-2 py-1 font-medium">{r.label}</td>
              {r.lags.map((l) => (
                <td
                  key={l.lag}
                  className="rounded px-1 py-1.5 text-center tabular-nums"
                  style={{
                    background: color(l.r),
                    outline: r.best?.lag === l.lag ? "1.5px solid #e8eef9" : undefined,
                  }}
                  title={`r = ${fmt(l.r, 3)} (n = ${l.n})`}
                >
                  {fmt(l.r, 2)}
                </td>
              ))}
              <td className="whitespace-nowrap px-2 py-1 text-muted-foreground">
                <span className="capitalize">{r.strength}</span>
                {r.best ? ` · ${r.best.lag === 0 ? "same week" : `${r.best.lag} wk earlier`}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AnalysisPanel({ id, a, scopeParam }: { id: string; a: Analytics; scopeParam: string }) {
  const w = a.weekly;
  // Headline figures use the latest week every reporting district has submitted.
  const wc = w.filter((p) => p.complete);
  const l = wc.length ? wc[wc.length - 1] : a.latest;
  const t = a.totals;
  const combined = a.scope.level !== "district";

  switch (id) {
    case "cases_trend": {
      const last4 = sum(wc.slice(-4).map((p) => p.confirmed));
      const prev4 = wc.length >= 8 ? sum(wc.slice(-8, -4).map((p) => p.confirmed)) : null;
      return (
        <Panel id={id} a={a} scopeParam={scopeParam}>
          <Stats>
            <Stat label="Latest week" value={fmt(l?.confirmed)} sub={l ? fmtDate(l.week_start) : undefined} />
            <Stat label="vs recent baseline" value={signed(l?.change_vs_baseline_pct, 1, "%")} sub={`baseline ${fmt(l?.baseline_prev4, 1)}`} />
            <Stat
              label="Last 4 weeks"
              value={fmt(last4)}
              sub={last4 !== null && prev4 ? `${signed(((last4 - prev4) / prev4) * 100, 1, "%")} vs previous 4 weeks` : undefined}
            />
            <Stat label="Period total" value={fmt(t.confirmed)} sub={`${t.weeks} weeks`} />
          </Stats>
          <SeriesChart
            data={chartRows(w, ["confirmed", "cases_ma4", "baseline_prev4"])}
            series={[
              { key: "confirmed", label: "Confirmed cases", color: C.cyan, levelKey: "level" },
              { key: "cases_ma4", label: "4-week moving average", color: C.gold, decimals: 1 },
              { key: "baseline_prev4", label: "Recent baseline (previous 4 weeks)", color: C.slate, dashed: true, decimals: 1 },
            ]}
          />
          <Legend
            items={[
              { label: "Confirmed cases", color: C.cyan },
              { label: "4-week moving average", color: C.gold },
              { label: "Recent baseline", color: C.slate, dashed: true },
              { label: "Elevated signal", color: LEVEL_HEX.ELEVATED, dot: true },
              { label: "Watch", color: LEVEL_HEX.WATCH, dot: true },
            ]}
          />
        </Panel>
      );
    }
    case "testing_cascade":
      return (
        <Panel id={id} a={a} scopeParam={scopeParam}>
          <Stats>
            <Stat label="Suspected (period)" value={fmt(t.suspected)} />
            <Stat label="Tested (period)" value={fmt(t.tested)} sub={`Testing rate ${fmt(t.testing_rate_pct, 1)}%`} />
            <Stat label="Confirmed (period)" value={fmt(t.confirmed)} sub={`Positivity ${fmt(t.positivity_pct, 1)}%`} />
            <Stat label="Latest testing rate" value={`${fmt(l?.testing_rate_pct, 1)}%`} sub={l ? fmtDate(l.week_start) : undefined} />
          </Stats>
          <SeriesChart
            data={chartRows(w, ["suspected", "tested", "confirmed", "testing_rate_pct"])}
            rightUnit="%"
            series={[
              { key: "suspected", label: "Suspected", color: C.violet },
              { key: "tested", label: "Tested", color: C.cyan },
              { key: "confirmed", label: "Confirmed", color: C.gold },
              { key: "testing_rate_pct", label: "Testing rate", color: C.green, axis: "right", dashed: true, decimals: 1, unit: "%" },
            ]}
          />
          <Legend
            items={[
              { label: "Suspected", color: C.violet },
              { label: "Tested", color: C.cyan },
              { label: "Confirmed", color: C.gold },
              { label: "Testing rate % (right axis)", color: C.green, dashed: true },
            ]}
          />
        </Panel>
      );
    case "positivity":
      return (
        <Panel id={id} a={a} scopeParam={scopeParam}>
          <Stats>
            <Stat label="Latest week" value={`${fmt(l?.positivity_pct, 2)}%`} />
            <Stat label="vs previous 4 weeks" value={`${signed(l?.positivity_change_pp, 2)} pp`} />
            <Stat label="Period" value={`${fmt(t.positivity_pct, 2)}%`} sub="Σ confirmed ÷ Σ tested" />
            <Stat
              label="Range"
              value={`${fmt(Math.min(...w.map((p) => p.positivity_pct ?? Infinity)), 1)}–${fmt(Math.max(...w.map((p) => p.positivity_pct ?? -Infinity)), 1)}%`}
            />
          </Stats>
          <SeriesChart
            leftUnit="%"
            data={chartRows(w, ["positivity_pct", "positivity_baseline_prev4"])}
            series={[
              { key: "positivity_pct", label: "Test positivity", color: C.red, decimals: 2, unit: "%" },
              { key: "positivity_baseline_prev4", label: "Previous 4-week average", color: C.slate, dashed: true, decimals: 2, unit: "%" },
            ]}
          />
          <Legend items={[{ label: "Test positivity", color: C.red }, { label: "Previous 4-week average", color: C.slate, dashed: true }]} />
          {!combined && <Note>Weekly values are the positivity reported in the file; the period figure is recomputed from counts.</Note>}
        </Panel>
      );
    case "incidence":
      return (
        <Panel id={id} a={a} scopeParam={scopeParam}>
          <Stats>
            <Stat label="Latest week" value={fmt(l?.incidence_per_1000, 3)} sub="per 1,000" />
            <Stat label="Cumulative (period)" value={fmt(t.incidence_per_1000, 2)} sub="per 1,000 population at risk" />
            <Stat label="Population at risk" value={fmt(l?.population)} />
            <Stat label="Weeks" value={String(t.weeks)} />
          </Stats>
          <SeriesChart
            data={chartRows(w, ["incidence_per_1000"])}
            series={[{ key: "incidence_per_1000", label: "Incidence per 1,000", color: C.gold, decimals: 3 }]}
          />
        </Panel>
      );
    case "severity":
      return (
        <Panel id={id} a={a} scopeParam={scopeParam}>
          <Stats>
            <Stat label="Severe cases" value={fmt(t.severe)} sub={`${fmt(t.severe_pct_of_confirmed, 2)}% of confirmed`} />
            <Stat label="Admissions" value={fmt(t.admissions)} sub={`${fmt(t.admissions_per_100_confirmed, 2)} per 100 confirmed`} />
            <Stat label="Deaths" value={fmt(t.deaths)} sub={`${fmt(t.deaths_per_1000_confirmed, 2)} per 1,000 confirmed`} />
            <Stat label="Latest week" value={`${fmt(l?.severe)} severe · ${fmt(l?.deaths)} deaths`} />
          </Stats>
          <SeriesChart
            data={chartRows(w, ["severe", "deaths", "admissions"])}
            series={[
              { key: "admissions", label: "Admissions", color: C.cyan, type: "bar" },
              { key: "severe", label: "Severe cases", color: C.orange },
              { key: "deaths", label: "Deaths", color: C.red },
            ]}
          />
          <Legend
            items={[
              { label: "Admissions (bars)", color: C.cyan, dot: true },
              { label: "Severe cases", color: C.orange },
              { label: "Deaths", color: C.red },
            ]}
          />
          <Note>Deaths are small counts; each recorded death should be confirmed through death review.</Note>
        </Panel>
      );
    case "opd_share":
      return (
        <Panel id={id} a={a} scopeParam={scopeParam}>
          <Stats>
            <Stat label="Latest week" value={`${fmt(l?.opd_malaria_share_pct, 1)}%`} />
            <Stat label="Period" value={`${fmt(t.opd_malaria_share_pct, 1)}%`} sub="Σ confirmed ÷ Σ outpatient visits" />
            <Stat label="Outpatient visits (period)" value={fmt(t.outpatient)} />
            <Stat label="Confirmed (period)" value={fmt(t.confirmed)} />
          </Stats>
          <SeriesChart
            leftUnit="%"
            data={chartRows(w, ["opd_malaria_share_pct"])}
            series={[{ key: "opd_malaria_share_pct", label: "Malaria share of OPD", color: C.violet, decimals: 2, unit: "%" }]}
          />
        </Panel>
      );
    case "baseline_deviation":
      return (
        <Panel id={id} a={a} scopeParam={scopeParam}>
          <SeriesChart
            leftUnit="%"
            data={chartRows(w, ["change_vs_baseline_pct"])}
            series={[{ key: "change_vs_baseline_pct", label: "Change vs recent baseline", color: C.cyan, type: "bar", decimals: 1, unit: "%" }]}
            refLines={[{ y: 25, label: "+25% rule", color: C.red }]}
          />
          <Note>{a.method.find((m) => m.key === "cases_above_baseline")?.rule} {a.method.find((m) => m.key === "baseline")?.rule}</Note>
        </Panel>
      );
    case "anomaly":
      return (
        <Panel id={id} a={a} scopeParam={scopeParam}>
          <SeriesChart
            data={chartRows(w, ["z_prev8"])}
            series={[{ key: "z_prev8", label: "Anomaly score (z)", color: C.gold, decimals: 2, levelKey: "level" }]}
            refLines={[{ y: 2, label: "z = 2 rule", color: C.red }]}
          />
          <Legend
            items={[
              { label: "Anomaly score", color: C.gold },
              { label: "Elevated signal week", color: LEVEL_HEX.ELEVATED, dot: true },
              { label: "Watch week", color: LEVEL_HEX.WATCH, dot: true },
            ]}
          />
          <Note>{a.method.find((m) => m.key === "unusual_increase")?.rule}</Note>
        </Panel>
      );
    case "signal_timeline":
      return (
        <Panel id={id} a={a} scopeParam={scopeParam}>
          <div className="max-h-[520px] overflow-auto rounded-lg border border-border">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead>Week of</TableHead>
                  <TableHead className="text-right">Epi wk</TableHead>
                  <TableHead className="text-right">Cases</TableHead>
                  <TableHead className="text-right">Baseline</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead className="text-right">z</TableHead>
                  <TableHead className="text-right">Positivity Δ</TableHead>
                  <TableHead>Rules fired</TableHead>
                  <TableHead>Signal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...w].reverse().map((p) => (
                  <TableRow key={p.week_start}>
                    <TableCell className="whitespace-nowrap">{fmtDate(p.week_start)}</TableCell>
                    <TableCell className="text-right">{p.epi_week ?? "—"}</TableCell>
                    <TableCell className="text-right">{fmt(p.confirmed)}</TableCell>
                    <TableCell className="text-right">{fmt(p.baseline_prev4, 1)}</TableCell>
                    <TableCell className="text-right">{signed(p.change_vs_baseline_pct, 1, "%")}</TableCell>
                    <TableCell className="text-right">{fmt(p.z_prev8, 2)}</TableCell>
                    <TableCell className="text-right">{signed(p.positivity_change_pp, 2)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.signal.signals.map((s) => s.label).join(" · ") ||
                        (!p.complete ? `${p.districts_reporting}/${p.districts_expected} districts reported` : "—")}
                    </TableCell>
                    <TableCell>
                      <LevelBadge level={p.signal.level} size="sm" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Panel>
      );
    case "projection": {
      const f = a.forecast;
      const shown = f.horizons.filter((h) => h.shown);
      const obs = w.slice(-16);
      const rows: Record<string, string | number | null>[] = [
        ...chartRows(obs, ["confirmed"]),
        ...shown.map((h) => ({ week_start: h.week_start, epi_week: null, level: null, estimate: h.estimate, lower: h.lower, upper: h.upper })),
      ];
      if (shown.length && rows.length > shown.length) rows[obs.length - 1].estimate = obs[obs.length - 1]?.confirmed ?? null;
      return (
        <Panel id={id} a={a} scopeParam={scopeParam}>
          {shown.length ? (
            <>
              <SeriesChart
                data={rows}
                series={[
                  { key: "confirmed", label: "Observed confirmed cases", color: C.cyan },
                  { key: "estimate", label: "Model estimate", color: C.gold, dashed: true },
                  { key: "upper", label: "Upper range", color: C.slate, dashed: true },
                  { key: "lower", label: "Lower range", color: C.slate, dashed: true },
                ]}
              />
              <Legend
                items={[
                  { label: "OBSERVED", color: C.cyan },
                  { label: "MODEL ESTIMATE", color: C.gold, dashed: true },
                  { label: "Estimate range (±1.96 × backtest RMSE)", color: C.slate, dashed: true },
                ]}
              />
            </>
          ) : (
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
              <p className="font-medium">No projection shown for {a.scope.label}.</p>
              <p className="mt-1 text-muted-foreground">{f.reason}</p>
            </div>
          )}
          {f.horizons.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Backtest (rolling origin)</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Horizon</TableHead>
                    <TableHead>Week of</TableHead>
                    <TableHead className="text-right">Estimate</TableHead>
                    <TableHead className="text-right">Tests</TableHead>
                    <TableHead className="text-right">MAE</TableHead>
                    <TableHead className="text-right">Naive MAE</TableHead>
                    <TableHead className="text-right">Skill vs naive</TableHead>
                    <TableHead className="text-right">MAPE</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {f.horizons.map((h) => (
                    <TableRow key={h.h}>
                      <TableCell>{h.h} week{h.h > 1 ? "s" : ""}</TableCell>
                      <TableCell>{fmtDate(h.week_start)}</TableCell>
                      <TableCell className="text-right">
                        {h.shown ? `${fmt(h.estimate)} (${fmt(h.lower)}–${fmt(h.upper)})` : "not shown"}
                      </TableCell>
                      <TableCell className="text-right">{h.backtest.n}</TableCell>
                      <TableCell className="text-right">{fmt(h.backtest.mae, 1)}</TableCell>
                      <TableCell className="text-right">{fmt(h.backtest.naive_mae, 1)}</TableCell>
                      <TableCell
                        className="text-right"
                        style={{ color: (h.backtest.skill_pct ?? 0) > 0 ? LEVEL_HEX.NONE : LEVEL_HEX.WATCH }}
                      >
                        {signed(h.backtest.skill_pct, 1, "%")}
                      </TableCell>
                      <TableCell className="text-right">{fmt(h.backtest.mape_pct, 1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <Note>{a.method.find((m) => m.key === "projection")?.rule}</Note>
        </Panel>
      );
    }
    case "rainfall":
      return (
        <Panel id={id} a={a} scopeParam={scopeParam}>
          <SeriesChart
            data={chartRows(w, ["rainfall_mm", "rainfall_4wk_avg", "confirmed"])}
            series={[
              { key: "rainfall_mm", label: "Weekly rainfall", color: C.cyan, type: "bar", decimals: 1, unit: " mm" },
              { key: "rainfall_4wk_avg", label: "4-week average rainfall", color: C.gold, decimals: 1, unit: " mm" },
              { key: "confirmed", label: "Confirmed cases", color: C.red, axis: "right" },
            ]}
          />
          <Legend
            items={[
              { label: "Weekly rainfall, mm (bars)", color: C.cyan, dot: true },
              { label: "4-week average rainfall", color: C.gold },
              { label: "Confirmed cases (right axis)", color: C.red },
            ]}
          />
          {(() => {
            const r = a.relationships.find((x) => x.variable === "rainfall_mm");
            return r?.best ? (
              <Note>
                Strongest association: r = {fmt(r.best.r, 2)} with rainfall{" "}
                {r.best.lag === 0 ? "in the same week" : `${r.best.lag} week${r.best.lag > 1 ? "s" : ""} earlier`} ({r.best.n} weeks). An
                association in the data, not proof of cause.
              </Note>
            ) : null;
          })()}
        </Panel>
      );
    case "climate":
      return (
        <Panel id={id} a={a} scopeParam={scopeParam}>
          <SeriesChart
            rightUnit="%"
            data={chartRows(w, ["temperature_c", "humidity_pct"])}
            series={[
              { key: "temperature_c", label: "Mean temperature", color: C.orange, decimals: 1, unit: " °C" },
              { key: "humidity_pct", label: "Relative humidity", color: C.teal, axis: "right", dashed: true, decimals: 1, unit: "%" },
            ]}
          />
          <Legend items={[{ label: "Mean temperature, °C", color: C.orange }, { label: "Relative humidity % (right axis)", color: C.teal, dashed: true }]} />
        </Panel>
      );
    case "vector":
      return (
        <Panel id={id} a={a} scopeParam={scopeParam}>
          <SeriesChart
            data={chartRows(w, ["mosquito_density", "larval_density"])}
            series={[
              { key: "mosquito_density", label: "Mosquito density index", color: C.red, decimals: 2 },
              { key: "larval_density", label: "Larval density index", color: C.violet, axis: "right", decimals: 2 },
            ]}
          />
          <Legend items={[{ label: "Mosquito density index", color: C.red }, { label: "Larval density index (right axis)", color: C.violet }]} />
        </Panel>
      );
    case "vegetation_mobility":
      return (
        <Panel id={id} a={a} scopeParam={scopeParam}>
          <SeriesChart
            data={chartRows(w, ["ndvi", "mobility_index"])}
            series={[
              { key: "ndvi", label: "NDVI", color: C.green, decimals: 3 },
              { key: "mobility_index", label: "Human mobility index", color: C.slate, axis: "right", dashed: true, decimals: 3 },
            ]}
          />
          <Legend items={[{ label: "NDVI", color: C.green }, { label: "Human mobility index (right axis)", color: C.slate, dashed: true }]} />
        </Panel>
      );
    case "env_lag":
      return (
        <Panel id={id} a={a} scopeParam={scopeParam}>
          <LagHeatmap rows={a.relationships.filter((r) => r.best)} />
          <Note>
            {a.method.find((m) => m.key === "relationships")?.rule} Gold = positive, blue = negative; the outlined cell is the
            strongest lag. With one season of data, shared seasonality can produce strong correlations.
          </Note>
        </Panel>
      );
    case "reporting":
      return (
        <Panel id={id} a={a} scopeParam={scopeParam}>
          <Stats>
            <Stat label="Latest completeness" value={`${fmt(l?.reporting_completeness_pct, 1)}%`} />
            <Stat label="Average completeness" value={`${fmt(a.quality.reporting_completeness.mean, 1)}%`} sub={`${a.quality.reporting_completeness.weeks_below_90} district-weeks below 90%`} />
            <Stat label="Latest delay" value={`${fmt(l?.reporting_delay_days, 1)} days`} />
            <Stat label="Average delay" value={`${fmt(a.quality.reporting_delay_days.mean, 2)} days`} sub={`${a.quality.reporting_delay_days.weeks_above_3} district-weeks above 3 days`} />
          </Stats>
          <SeriesChart
            leftUnit="%"
            rightUnit="d"
            data={chartRows(w, ["reporting_completeness_pct", "reporting_delay_days"])}
            series={[
              { key: "reporting_completeness_pct", label: "Completeness", color: C.green, decimals: 1, unit: "%" },
              { key: "reporting_delay_days", label: "Delay", color: "#f59e0b", axis: "right", dashed: true, decimals: 1, unit: " days" },
            ]}
            refLines={[{ y: 90, label: "90%", color: C.red }]}
          />
          <Legend items={[{ label: "Completeness %", color: C.green }, { label: "Delay, days (right axis)", color: "#f59e0b", dashed: true }]} />
        </Panel>
      );
    case "facilities":
      return (
        <Panel id={id} a={a} scopeParam={scopeParam}>
          <SeriesChart
            data={chartRows(w, ["facilities_expected", "facilities_reporting"])}
            series={[
              { key: "facilities_expected", label: "Expected", color: C.slate, dashed: true },
              { key: "facilities_reporting", label: "Reporting", color: C.cyan },
            ]}
          />
          <Legend items={[{ label: "Facilities expected", color: C.slate, dashed: true }, { label: "Facilities reporting", color: C.cyan }]} />
        </Panel>
      );
    case "commodities": {
      const minAct = Math.min(...w.map((p) => p.act_stock_days ?? Infinity));
      const minRdt = Math.min(...w.map((p) => p.rdt_stock_days ?? Infinity));
      return (
        <Panel id={id} a={a} scopeParam={scopeParam}>
          <Stats>
            <Stat label="ACT stock (latest)" value={`${fmt(l?.act_stock_days, combined ? 1 : 0)} days`} sub={`lowest ${fmt(Number.isFinite(minAct) ? minAct : null, combined ? 1 : 0)}`} />
            <Stat label="RDT stock (latest)" value={`${fmt(l?.rdt_stock_days, combined ? 1 : 0)} days`} sub={`lowest ${fmt(Number.isFinite(minRdt) ? minRdt : null, combined ? 1 : 0)}`} />
            <Stat label="Stockout days (period)" value={fmt(t.stockout_days)} sub={`${w.filter((p) => (p.stockout_days ?? 0) > 0).length} weeks with a stockout`} />
            <Stat label="Stockout days (latest)" value={fmt(l?.stockout_days)} />
          </Stats>
          <SeriesChart
            data={chartRows(w, ["act_stock_days", "rdt_stock_days", "stockout_days"])}
            series={[
              { key: "stockout_days", label: "Stockout days", color: C.red, type: "bar", axis: "right" },
              { key: "act_stock_days", label: "ACT stock days", color: C.gold, decimals: 1 },
              { key: "rdt_stock_days", label: "RDT stock days", color: C.violet, decimals: 1 },
            ]}
          />
          <Legend
            items={[
              { label: "ACT stock days", color: C.gold },
              { label: "RDT stock days", color: C.violet },
              { label: "Stockout days (bars, right axis)", color: C.red, dot: true },
            ]}
          />
        </Panel>
      );
    }
    case "beds":
      return (
        <Panel id={id} a={a} scopeParam={scopeParam}>
          <SeriesChart
            rightUnit="%"
            data={chartRows(w, ["admissions", "bed_occupancy_pct"])}
            series={[
              { key: "admissions", label: "Malaria admissions", color: C.cyan, type: "bar" },
              { key: "bed_occupancy_pct", label: "Bed occupancy", color: C.pink, axis: "right", decimals: 1, unit: "%" },
            ]}
          />
          <Legend items={[{ label: "Malaria admissions (bars)", color: C.cyan, dot: true }, { label: "Bed occupancy % (right axis)", color: C.pink }]} />
        </Panel>
      );
    case "prevention_coverage": {
      const rel = a.relationships.filter((r) => r.group === "prevention" && r.best);
      return (
        <Panel id={id} a={a} scopeParam={scopeParam}>
          <Stats>
            <Stat label="Bed-net coverage (latest)" value={`${fmt(l?.bed_net_coverage_pct, 1)}%`} />
            <Stat label="IRS coverage (latest)" value={`${fmt(l?.irs_pct, 1)}%`} />
            {rel.map((r) => (
              <Stat
                key={r.variable}
                label={`${r.label} ↔ cases`}
                value={`r = ${fmt(r.best?.r ?? null, 2)}`}
                sub={`${r.strength}, ${r.best?.lag === 0 ? "same week" : `${r.best?.lag} wk earlier`}`}
              />
            ))}
          </Stats>
          <SeriesChart
            leftUnit="%"
            data={chartRows(w, ["bed_net_coverage_pct", "irs_pct"])}
            series={[
              { key: "bed_net_coverage_pct", label: "Bed-net coverage", color: C.green, decimals: 1, unit: "%" },
              { key: "irs_pct", label: "Indoor residual spraying", color: C.gold, decimals: 1, unit: "%" },
            ]}
          />
          <Legend items={[{ label: "Bed-net coverage %", color: C.green }, { label: "Indoor residual spraying %", color: C.gold }]} />
          <Note>Coverage values are as reported. The association with cases is descriptive; it does not measure the effect of prevention.</Note>
        </Panel>
      );
    }
    case "prioritisation":
      return (
        <Panel id={id} a={a} scopeParam={scopeParam}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>District</TableHead>
                  <TableHead>Latest signal</TableHead>
                  <TableHead className="text-right">Incidence, last 4 wk</TableHead>
                  <TableHead className="text-right">Positivity, last 4 wk</TableHead>
                  <TableHead className="text-right">Bed nets</TableHead>
                  <TableHead className="text-right">IRS</TableHead>
                  <TableHead>Points to review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.prioritisation.map((p) => (
                  <TableRow key={p.district}>
                    <TableCell className="font-semibold">{p.rank}</TableCell>
                    <TableCell>
                      <Link href={`/districts/${encodeURIComponent(p.district)}`} className="font-medium hover:text-primary">
                        {p.district}
                      </Link>
                      <p className="text-[11px] text-muted-foreground">{p.province}</p>
                    </TableCell>
                    <TableCell>
                      <LevelBadge level={p.level} size="sm" />
                    </TableCell>
                    <TableCell className="text-right">{fmt(p.recent_incidence_per_1000, 2)} /1k</TableCell>
                    <TableCell className="text-right">{fmt(p.recent_positivity_pct, 1)}%</TableCell>
                    <TableCell className="text-right">{fmt(p.bed_net_coverage_pct, 1)}%</TableCell>
                    <TableCell className="text-right">{fmt(p.irs_pct, 1)}%</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.review_points.length ? p.review_points.join(" · ") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Note>{a.method.find((m) => m.key === "prioritisation")?.rule}</Note>
        </Panel>
      );
    case "district_comparison": {
      const rows = a.districts.filter((d) => d.hasData);
      const noData = a.districts.length - rows.length;
      return (
        <Panel id={id} a={a} scopeParam={scopeParam}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>District</TableHead>
                  <TableHead>Latest signal</TableHead>
                  <TableHead className="text-right">Latest cases</TableHead>
                  <TableHead className="text-right">vs baseline</TableHead>
                  <TableHead className="text-right">Period cases</TableHead>
                  <TableHead className="text-right">Incidence /1k</TableHead>
                  <TableHead className="text-right">Positivity</TableHead>
                  <TableHead className="text-right">Severe</TableHead>
                  <TableHead className="text-right">Deaths</TableHead>
                  <TableHead className="text-right">Reporting</TableHead>
                  <TableHead className="text-right">Alerts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((d) => (
                  <TableRow key={d.district}>
                    <TableCell>
                      <Link href={`/districts/${encodeURIComponent(d.district)}`} className="font-medium hover:text-primary">
                        {d.district}
                      </Link>
                    </TableCell>
                    <TableCell>{d.latest_level && <LevelBadge level={d.latest_level} size="sm" />}</TableCell>
                    <TableCell className="text-right">{fmt(d.latest_confirmed)}</TableCell>
                    <TableCell className="text-right">{signed(d.latest_change_vs_baseline_pct, 1, "%")}</TableCell>
                    <TableCell className="text-right">{fmt(d.totals?.confirmed ?? null)}</TableCell>
                    <TableCell className="text-right">{fmt(d.totals?.incidence_per_1000 ?? null, 2)}</TableCell>
                    <TableCell className="text-right">{fmt(d.totals?.positivity_pct ?? null, 2)}%</TableCell>
                    <TableCell className="text-right">{fmt(d.totals?.severe ?? null)}</TableCell>
                    <TableCell className="text-right">{fmt(d.totals?.deaths ?? null)}</TableCell>
                    <TableCell className="text-right">{fmt(d.mean_reporting_completeness_pct, 1)}%</TableCell>
                    <TableCell className="text-right">{d.alerts}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {noData > 0 && (
            <Note>
              {noData} district{noData > 1 ? "s" : ""} in {a.scope.label} {noData > 1 ? "have" : "has"} not reported data and{" "}
              {noData > 1 ? "are" : "is"} not included. See <Link href="/districts" className="text-primary hover:underline">Districts</Link>.
            </Note>
          )}
        </Panel>
      );
    }
    case "data_quality": {
      const q = a.quality;
      const missing = q.missing_by_column.filter((c) => c.missing > 0);
      return (
        <Panel id={id} a={a} scopeParam={scopeParam}>
          <Stats>
            <Stat label="Records" value={fmt(q.records)} sub={Object.entries(q.weeks_per_district).map(([d, n]) => `${d} ${n}`).join(" · ")} />
            <Stat label="Missing values" value={fmt(q.missing_values_total)} sub={missing.length ? missing.map((c) => c.column).join(", ") : "none in supplied columns"} />
            <Stat label="Completeness" value={`${fmt(q.reporting_completeness.mean, 1)}%`} sub={`lowest ${fmt(q.reporting_completeness.min, 1)}%`} />
            <Stat label="Reporting delay" value={`${fmt(q.reporting_delay_days.mean, 2)} d`} sub={`longest ${fmt(q.reporting_delay_days.max, 1)} d`} />
          </Stats>
          {q.columns_not_supplied.length > 0 && (
            <Note>Not supplied by any imported dataset: {q.columns_not_supplied.join(", ")}.</Note>
          )}
          <p className="mt-2 text-sm">
            Full validation results are on{" "}
            <Link href={`/data${scopeParam ? `?scope=${encodeURIComponent(scopeParam)}` : ""}`} className="text-primary hover:underline">
              Data Management
            </Link>
            .
          </p>
        </Panel>
      );
    }
    default:
      return null;
  }
}
