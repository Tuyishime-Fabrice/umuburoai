import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Legend, SeriesChart } from "@/components/charts/series-chart";
import { LevelBadge } from "@/components/surveillance/level-badge";
import { PageHeader } from "@/components/surveillance/page-header";
import { SignalPanel } from "@/components/surveillance/signal-panel";
import { LEVEL_HEX, chartRows, fmt, fmtDate, scopeName, signed } from "@/lib/surveillance/display";
import { getScopedAnalytics } from "@/lib/surveillance/source";
import { getSession } from "@/lib/session.server";

const RULE_SHORT: Record<string, string> = {
  cases_above_baseline: "Cases ↑ baseline",
  unusual_increase: "Unusual increase",
  positivity_increased: "Positivity ↑",
  severe_above_baseline: "Severe ↑",
};

export default async function SignalAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ district?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const data = await getScopedAnalytics(session, (await searchParams).district);
  const a = data.analytics;
  const l = a.latest;
  const rows = [...a.weekly].reverse();
  const caseRule = a.method.find((m) => m.key === "cases_above_baseline");
  const singleDistrict = a.scope !== "All";

  return (
    <div className="space-y-6">
      <PageHeader
        data={data}
        intro="How each signal is produced, step by step, from the surveillance CSV. Every rule and threshold is listed below; nothing is forecast."
      />

      {/* pipeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Processing pipeline — {scopeName(a.scope)}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {a.pipeline.map((s, i) => (
              <li key={s.stage} className="relative rounded-lg border border-border bg-muted/30 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-primary/15 text-[10px]">{i + 1}</span>
                  {s.stage}
                  {i < a.pipeline.length - 1 && <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{s.detail}</p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* latest */}
      {l && (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-base">
              Latest week explained — {scopeName(a.scope)}, week of {fmtDate(l.week_start)}
            </CardTitle>
            <LevelBadge level={l.signal.level} />
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Fact label="Confirmed cases" value={fmt(l.confirmed)} />
              <Fact label="Previous 4-week average" value={fmt(l.baseline_prev4, 2)} />
              <Fact label="Change vs baseline" value={signed(l.change_vs_baseline_pct, 1, "%")} />
              <Fact label="Previous 8 weeks (mean / SD)" value={`${fmt(l.baseline_prev8_mean, 1)} / ${fmt(l.baseline_prev8_sd, 1)}`} />
              <Fact label="Anomaly score (z)" value={fmt(l.z_prev8, 2)} />
              <Fact label="Positivity change" value={`${signed(l.positivity_change_pp, 2)} pp`} />
              <Fact label="Severe cases / baseline" value={`${fmt(l.severe)} / ${fmt(l.severe_baseline_prev4, 1)}`} />
              <Fact label="Reporting completeness" value={`${fmt(l.reporting_completeness_pct, 1)}%`} />
            </dl>
            <SignalPanel signal={l.signal} compact />
          </CardContent>
        </Card>
      )}

      {/* baseline + anomaly charts */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Baseline comparison (% change vs previous 4 weeks)</CardTitle>
          </CardHeader>
          <CardContent>
            <SeriesChart
              height={240}
              leftUnit="%"
              data={chartRows(a.weekly, ["change_vs_baseline_pct"])}
              series={[{ key: "change_vs_baseline_pct", label: "Change vs baseline", color: "#38bdf8", type: "bar", decimals: 1, unit: "%" }]}
              refLines={[{ y: 25, label: "+25% rule", color: "#ef4444" }]}
            />
            <p className="mt-2 text-xs text-muted-foreground">{caseRule?.rule}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Anomaly score (z vs previous 8 weeks)</CardTitle>
          </CardHeader>
          <CardContent>
            <SeriesChart
              height={240}
              data={chartRows(a.weekly, ["z_prev8"])}
              series={[{ key: "z_prev8", label: "z-score", color: "#f5b301", decimals: 2, levelKey: "level" }]}
              refLines={[{ y: 2, label: "z = 2 rule", color: "#ef4444" }]}
            />
            <Legend
              items={[
                { label: "Elevated signal week", color: LEVEL_HEX.ELEVATED, dot: true },
                { label: "Watch week", color: LEVEL_HEX.WATCH, dot: true },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      {/* weekly table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Week-by-week signal evaluation ({a.weekly.length} weeks)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[560px] overflow-auto rounded-lg border border-border">
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
                  <TableHead className="text-right">Severe</TableHead>
                  <TableHead>Rules fired</TableHead>
                  <TableHead>Signal</TableHead>
                  <TableHead className="text-right" title="alert_label column in the CSV (number of districts labelled 1 for All)">
                    CSV label
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.week_start}>
                    <TableCell className="whitespace-nowrap">{fmtDate(p.week_start)}</TableCell>
                    <TableCell className="text-right">{p.epi_week ?? "—"}</TableCell>
                    <TableCell className="text-right">{fmt(p.confirmed)}</TableCell>
                    <TableCell className="text-right">{fmt(p.baseline_prev4, 1)}</TableCell>
                    <TableCell className="text-right">{signed(p.change_vs_baseline_pct, 1, "%")}</TableCell>
                    <TableCell className="text-right">{fmt(p.z_prev8, 2)}</TableCell>
                    <TableCell className="text-right">{signed(p.positivity_change_pp, 2)}</TableCell>
                    <TableCell className="text-right">{fmt(p.severe)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.signal.signals.map((s) => RULE_SHORT[s.key] ?? s.label).join(" · ") ||
                        (p.signal.observations.some((o) => o.key in RULE_SHORT)
                          ? `(${p.signal.observations.filter((o) => o.key in RULE_SHORT).map((o) => RULE_SHORT[o.key]).join(", ")} only)`
                          : "—")}
                    </TableCell>
                    <TableCell>
                      <LevelBadge level={p.signal.level} size="sm" />
                    </TableCell>
                    <TableCell className="text-right">{p.file_alert_label ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            &quot;CSV label&quot; is the <code>alert_label</code> column supplied in the file, shown for reference. It is
            not used to produce signals, and agreement with it is not a measure of real-world accuracy.
            {!singleDistrict && " For All districts it counts the districts labelled 1 that week."}
          </p>
        </CardContent>
      </Card>

      {/* relationships */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Environmental relationships with confirmed cases — {scopeName(a.scope)}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variable</TableHead>
                <TableHead className="text-right">r, same week</TableHead>
                <TableHead className="text-right">Strongest lag</TableHead>
                <TableHead className="text-right">r at that lag</TableHead>
                <TableHead className="text-right">Weeks (n)</TableHead>
                <TableHead>Association</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {a.relationships.map((r) => (
                <TableRow key={r.variable}>
                  <TableCell className="font-medium">
                    {r.label} <span className="text-xs text-muted-foreground">({r.unit})</span>
                  </TableCell>
                  <TableCell className="text-right">{fmt(r.lags[0]?.r, 2)}</TableCell>
                  <TableCell className="text-right">
                    {r.best ? (r.best.lag === 0 ? "same week" : `${r.best.lag} wk earlier`) : "—"}
                  </TableCell>
                  <TableCell className="text-right">{fmt(r.best?.r, 2)}</TableCell>
                  <TableCell className="text-right">{r.best?.n ?? "—"}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">
                    {r.strength}
                    {r.best && r.strength !== "insufficient" ? (r.best.r > 0 ? ", positive" : ", negative") : ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            Pearson correlation between weekly confirmed cases and each variable 0–8 weeks earlier, using only
            this dataset ({a.weekly.length} weeks). Weak &lt; 0.3 ≤ moderate &lt; 0.5 ≤ strong. With one season of
            data, shared seasonality can produce strong correlations; these are associations, not evidence of
            cause, and are not used to predict cases.
          </p>
        </CardContent>
      </Card>

      {/* method */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rules and definitions</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3">
            {a.method.map((m) => (
              <div key={m.key} className="grid gap-1 sm:grid-cols-[220px_1fr]">
                <dt className="text-sm font-medium">{m.label}</dt>
                <dd className="text-sm text-muted-foreground">{m.rule}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-2.5">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}
