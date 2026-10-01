import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Legend, SeriesChart } from "@/components/charts/series-chart";
import { KpiTile } from "@/components/surveillance/kpi-tile";
import { LevelBadge } from "@/components/surveillance/level-badge";
import { PageHeader } from "@/components/surveillance/page-header";
import { SignalPanel } from "@/components/surveillance/signal-panel";
import { LEVEL_HEX, LEVEL_META, chartRows, fmt, fmtDate, scopeName, signed } from "@/lib/surveillance/display";
import { getScopedAnalytics } from "@/lib/surveillance/source";
import { getSession } from "@/lib/session.server";

export default async function MonitorPage({
  searchParams,
}: {
  searchParams: Promise<{ district?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const data = await getScopedAnalytics(session, (await searchParams).district);
  const a = data.analytics;
  const l = a.latest;
  const t = a.totals;
  const missingWeeks = Object.entries(t.missing_weeks).filter(([, n]) => n > 0);
  const q = (s: string) => (a.scope === "All" ? "" : `?district=${encodeURIComponent(s)}`);

  return (
    <div className="space-y-6">
      <PageHeader
        data={data}
        intro="Weekly malaria surveillance, recalculated for the selected scope. Signals flag unusual patterns; the district health team verifies and decides."
      />

      {/* current signal */}
      <div className={a.districtSignals.length > 1 ? "grid gap-5 lg:grid-cols-2" : "grid gap-5"}>
        {a.districtSignals.map(({ district, latest }) => (
          <Card key={district} style={latest ? { borderColor: LEVEL_HEX[latest.signal.level] + "55" } : undefined}>
            <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Current signal</p>
                <CardTitle className="mt-1 text-lg">{district}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Week of {fmtDate(latest?.week_start)} · epi week {latest?.epi_week ?? "—"}
                </p>
              </div>
              {latest && <LevelBadge level={latest.signal.level} />}
            </CardHeader>
            <CardContent>
              {latest ? <SignalPanel signal={latest.signal} compact /> : <p className="text-sm">No records.</p>}
              {latest && (latest.signal.level === "ELEVATED" || latest.signal.level === "WATCH") && (
                <Link
                  href={`/alerts?district=${encodeURIComponent(district)}`}
                  className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  Review the alert <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* latest week */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">
          Latest week · {scopeName(a.scope)} · {fmtDate(l?.week_start)}
        </h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiTile
            label="Confirmed cases"
            value={fmt(l?.confirmed)}
            tone={l ? LEVEL_META[l.signal.level].color : undefined}
            sub={
              l?.baseline_prev4 != null
                ? `${signed(l.change_vs_baseline_pct, 1, "%")} vs previous 4-week average (${fmt(l.baseline_prev4, 1)})`
                : "No 4-week baseline yet"
            }
          />
          <KpiTile label="Suspected cases" value={fmt(l?.suspected)} />
          <KpiTile label="Tested" value={fmt(l?.tested)} sub={`Testing rate ${fmt(l?.testing_rate_pct, 2)}%`} />
          <KpiTile
            label="Test positivity"
            value={`${fmt(l?.positivity_pct, 2)}%`}
            sub={
              l?.positivity_change_pp != null
                ? `${signed(l.positivity_change_pp, 2)} pp vs previous 4 weeks`
                : undefined
            }
          />
          <KpiTile
            label="Severe malaria cases"
            value={fmt(l?.severe)}
            sub={l?.severe_baseline_prev4 != null ? `Previous 4-week average ${fmt(l.severe_baseline_prev4, 1)}` : undefined}
          />
          <KpiTile label="Malaria deaths" value={fmt(l?.deaths)} />
          <KpiTile label="Malaria admissions" value={fmt(l?.admissions)} />
          <KpiTile
            label="Incidence per 1,000"
            value={fmt(l?.incidence_per_1000, 3)}
            sub={`Population at risk ${fmt(l?.population)}`}
          />
        </div>
      </div>

      {/* trends */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Weekly confirmed cases — {scopeName(a.scope)}</CardTitle>
        </CardHeader>
        <CardContent>
          <SeriesChart
            data={chartRows(a.weekly, ["confirmed", "cases_ma4", "baseline_prev4"])}
            series={[
              { key: "confirmed", label: "Confirmed cases", color: "#38bdf8", levelKey: "level" },
              { key: "cases_ma4", label: "4-week moving average", color: "#f5b301", decimals: 1 },
              { key: "baseline_prev4", label: "Previous 4-week average (baseline)", color: "#94a3b8", dashed: true, decimals: 1 },
            ]}
          />
          <Legend
            items={[
              { label: "Confirmed cases", color: "#38bdf8" },
              { label: "4-week moving average", color: "#f5b301" },
              { label: "Previous 4-week average (baseline)", color: "#94a3b8", dashed: true },
              { label: "Elevated signal", color: LEVEL_HEX.ELEVATED, dot: true },
              { label: "Watch", color: LEVEL_HEX.WATCH, dot: true },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Testing and positivity — {scopeName(a.scope)}</CardTitle>
        </CardHeader>
        <CardContent>
          <SeriesChart
            data={chartRows(a.weekly, ["suspected", "tested", "confirmed", "positivity_pct"])}
            rightUnit="%"
            series={[
              { key: "suspected", label: "Suspected", color: "#a78bfa" },
              { key: "tested", label: "Tested", color: "#38bdf8" },
              { key: "confirmed", label: "Confirmed", color: "#f5b301" },
              { key: "positivity_pct", label: "Positivity", color: "#ef4444", axis: "right", dashed: true, decimals: 2, unit: "%" },
            ]}
          />
          <Legend
            items={[
              { label: "Suspected", color: "#a78bfa" },
              { label: "Tested", color: "#38bdf8" },
              { label: "Confirmed", color: "#f5b301" },
              { label: "Positivity % (right axis)", color: "#ef4444", dashed: true },
            ]}
          />
        </CardContent>
      </Card>

      {/* period totals */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">
          Dataset period · {fmtDate(a.period.start)} – {fmtDate(a.period.end)} · {t.weeks} weeks
        </h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiTile label="Confirmed cases" value={fmt(t.confirmed)} />
          <KpiTile label="Suspected cases" value={fmt(t.suspected)} />
          <KpiTile label="Tested" value={fmt(t.tested)} sub={`Testing rate ${fmt(t.testing_rate_pct, 2)}%`} />
          <KpiTile label="Test positivity" value={`${fmt(t.positivity_pct, 2)}%`} sub="Σ confirmed ÷ Σ tested" />
          <KpiTile label="Severe malaria cases" value={fmt(t.severe)} />
          <KpiTile label="Malaria deaths" value={fmt(t.deaths)} />
          <KpiTile label="Malaria admissions" value={fmt(t.admissions)} />
          <KpiTile
            label="Cumulative incidence"
            value={`${fmt(t.incidence_per_1000, 2)} / 1,000`}
            sub="Σ confirmed ÷ population at risk"
          />
        </div>
        {missingWeeks.length > 0 && (
          <p className="mt-2 text-xs text-[color:var(--risk-watch)]">
            Totals exclude weeks with missing values:{" "}
            {missingWeeks.map(([k, n]) => `${k} (${n} wk)`).join(", ")}.
          </p>
        )}
      </div>

      {/* comparison */}
      {a.comparison.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">District comparison</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>District</TableHead>
                  <TableHead>Latest signal</TableHead>
                  <TableHead className="text-right">Latest week cases</TableHead>
                  <TableHead className="text-right">vs baseline</TableHead>
                  <TableHead className="text-right">Period cases</TableHead>
                  <TableHead className="text-right">Incidence /1,000</TableHead>
                  <TableHead className="text-right">Positivity</TableHead>
                  <TableHead className="text-right">Severe</TableHead>
                  <TableHead className="text-right">Deaths</TableHead>
                  <TableHead className="text-right">Reporting</TableHead>
                  <TableHead className="text-right">Alerts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.comparison.map((c) => (
                  <TableRow key={c.district}>
                    <TableCell className="font-medium">
                      <Link href={`/monitor?district=${encodeURIComponent(c.district)}`} className="hover:text-primary">
                        {c.district}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <LevelBadge level={c.latest_level} size="sm" />
                    </TableCell>
                    <TableCell className="text-right">{fmt(c.latest_confirmed)}</TableCell>
                    <TableCell className="text-right">{signed(c.latest_change_vs_baseline_pct, 1, "%")}</TableCell>
                    <TableCell className="text-right">{fmt(c.totals.confirmed)}</TableCell>
                    <TableCell className="text-right">{fmt(c.totals.incidence_per_1000, 2)}</TableCell>
                    <TableCell className="text-right">{fmt(c.totals.positivity_pct, 2)}%</TableCell>
                    <TableCell className="text-right">{fmt(c.totals.severe)}</TableCell>
                    <TableCell className="text-right">{fmt(c.totals.deaths)}</TableCell>
                    <TableCell className="text-right">{fmt(c.mean_reporting_completeness_pct, 1)}%</TableCell>
                    <TableCell className="text-right">{c.alerts}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/30 font-medium">
                  <TableCell>All districts</TableCell>
                  <TableCell>{l && <LevelBadge level={l.signal.level} size="sm" />}</TableCell>
                  <TableCell className="text-right">{fmt(l?.confirmed)}</TableCell>
                  <TableCell className="text-right">{signed(l?.change_vs_baseline_pct, 1, "%")}</TableCell>
                  <TableCell className="text-right">{fmt(t.confirmed)}</TableCell>
                  <TableCell className="text-right">{fmt(t.incidence_per_1000, 2)}</TableCell>
                  <TableCell className="text-right">{fmt(t.positivity_pct, 2)}%</TableCell>
                  <TableCell className="text-right">{fmt(t.severe)}</TableCell>
                  <TableCell className="text-right">{fmt(t.deaths)}</TableCell>
                  <TableCell className="text-right">{fmt(a.quality.reporting_completeness.mean, 1)}%</TableCell>
                  <TableCell className="text-right">{a.alerts.length}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <p className="mt-3 text-xs text-muted-foreground">
              Each district&apos;s signal is evaluated on its own weekly records. The &quot;All districts&quot; row is
              evaluated on the combined series (counts summed, rates recomputed from the sums).
            </p>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Observed data only — no forecast is shown.{" "}
        <Link href={`/report${q(a.scope)}`} target="_blank" className="text-primary hover:underline">
          Printable summary for {scopeName(a.scope)}
        </Link>
      </p>
    </div>
  );
}
