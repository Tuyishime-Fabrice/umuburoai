import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, CheckCircle2, Eye, FileUp, Info, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Legend, SeriesChart } from "@/components/charts/series-chart";
import { DistrictMap } from "@/components/maps/district-map";
import { EmptyScope } from "@/components/surveillance/empty-scope";
import { KpiTile } from "@/components/surveillance/kpi-tile";
import { LevelBadge } from "@/components/surveillance/level-badge";
import { PageHeader } from "@/components/surveillance/page-header";
import { LEVEL_HEX, LEVEL_META, chartRows, fmt, fmtDate, shown, signed } from "@/lib/surveillance/display";
import { buildInsights, type Insight } from "@/lib/surveillance/insights";
import { getScopedAnalytics } from "@/lib/surveillance/source";
import { listDatasets } from "@/lib/store";
import { getSession } from "@/lib/session.server";

const TONE: Record<Insight["tone"], { icon: typeof Info; color: string }> = {
  alert: { icon: AlertTriangle, color: "var(--risk-high)" },
  watch: { icon: Eye, color: "var(--risk-watch)" },
  info: { icon: Info, color: "var(--primary)" },
  good: { icon: CheckCircle2, color: "var(--risk-low)" },
};

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const data = await getScopedAnalytics(session, (await searchParams).scope);
  const a = data.analytics;
  // Headline the latest week every reporting district has submitted; note a newer partial week.
  const l = [...a.weekly].reverse().find((p) => p.complete) ?? a.latest;
  const partial = a.latest && !a.latest.complete ? a.latest : null;
  const scopeParam = a.scope.id === "national" ? "" : a.scope.id;
  const q = scopeParam ? `?scope=${encodeURIComponent(scopeParam)}` : "";
  const insights = buildInsights(a, scopeParam);
  const own = session.role === "national" ? null : (session.district ?? "");
  const imports = listDatasets()
    .filter((d) => d.status === "active" && (!own || d.districts.includes(own)))
    .map((d) => (own ? { ...d, districts: [own] } : d))
    .sort((x, y) => (x.uploadedAt < y.uploadedAt ? 1 : -1))
    .slice(0, 4);
  const flagged = a.districtSignals.filter(
    (s) => s.latest && (s.latest.signal.level === "ELEVATED" || s.latest.signal.level === "WATCH"),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        data={data}
        title="Situation Overview"
        description={`Latest malaria surveillance picture for ${a.scope.label === "National" ? "Rwanda" : a.scope.label}: signals, burden and reporting.`}
      />

      {!a.hasData ? (
        <EmptyScope scope={a.scope} />
      ) : (
        <>
          {/* latest week */}
          <div>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">
                {partial ? "Latest complete week" : "Latest week"} · {fmtDate(l?.week_start)} · epi week {l?.epi_week ?? "—"}
              </h2>
              {partial && (
                <span className="text-xs text-[color:var(--risk-watch)]">
                  Week of {fmtDate(partial.week_start)} in progress: {partial.districts_reporting} of {partial.districts_expected}{" "}
                  reporting districts have submitted
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
              <KpiTile
                label="Confirmed cases"
                value={fmt(l?.confirmed)}
                tone={l ? LEVEL_META[l.signal.level].color : undefined}
                sub={l?.baseline_prev4 != null ? `${signed(l.change_vs_baseline_pct, 1, "%")} vs recent baseline` : "No baseline yet"}
              />
              <KpiTile
                label="Test positivity"
                value={shown([l?.positivity_pct], `${fmt(l?.positivity_pct, 1)}%`)}
                sub={l?.positivity_change_pp != null ? `${signed(l.positivity_change_pp, 1)} pp vs previous 4 wk` : undefined}
              />
              <KpiTile label="Tested" value={shown([l?.tested], fmt(l?.tested))} sub={l?.testing_rate_pct != null ? `Testing rate ${fmt(l.testing_rate_pct, 1)}%` : undefined} />
              <KpiTile label="Severe cases" value={shown([l?.severe], fmt(l?.severe))} sub={l?.deaths != null ? `${fmt(l.deaths)} deaths recorded` : undefined} />
              <KpiTile label="Incidence" value={shown([l?.incidence_per_1000], fmt(l?.incidence_per_1000, 2))} sub="per 1,000 this week" />
              <KpiTile
                label="Reporting completeness"
                value={shown([l?.reporting_completeness_pct], `${fmt(l?.reporting_completeness_pct, 1)}%`)}
                sub={l?.facilities_expected != null ? `${fmt(l.facilities_reporting)} of ${fmt(l.facilities_expected)} facilities` : undefined}
              />
            </div>
          </div>

          {/* map + signals */}
          <div className="grid gap-5 lg:grid-cols-5">
            <Card className="min-w-0 lg:col-span-3">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">District signals · latest reported week</CardTitle>
              </CardHeader>
              <CardContent>
                <DistrictMap districts={a.districts} height={400} />
              </CardContent>
            </Card>
            <Card className="min-w-0 lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-base">Signals requiring verification</CardTitle>
                <Link href={`/alerts${q}`} className="text-xs text-primary hover:underline">
                  All alerts
                </Link>
              </CardHeader>
              <CardContent className="space-y-3">
                {flagged.length === 0 && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-[color:var(--risk-low)]" /> No district has a signal in its latest week.
                  </p>
                )}
                {flagged.map(({ district, province, latest }) => (
                  <Link
                    key={district}
                    href={`/alerts?scope=${encodeURIComponent(`district:${district}`)}`}
                    className="block rounded-lg border border-border p-3 transition-colors hover:border-primary/40 hover:bg-muted/30"
                    style={{ borderLeft: `3px solid ${LEVEL_HEX[latest!.signal.level]}` }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{district}</span>
                      <LevelBadge level={latest!.signal.level} size="sm" />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {province} · week of {fmtDate(latest!.week_start)}
                    </p>
                    <ul className="mt-1.5 space-y-0.5">
                      {latest!.signal.signals.map((s) => (
                        <li key={s.key} className="text-xs text-muted-foreground">
                          • {s.label}
                        </li>
                      ))}
                    </ul>
                  </Link>
                ))}
                <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                  {a.districtsWithData.length} reporting district{a.districtsWithData.length === 1 ? "" : "s"} ·{" "}
                  {a.alerts.filter((x) => x.isLatestWeek).length} alert(s) in the latest week · {a.alerts.length} in the
                  reporting period
                </div>
              </CardContent>
            </Card>
          </div>

          {/* insights */}
          {insights.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Lightbulb className="h-4 w-4 text-primary" /> Key findings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-2.5 md:grid-cols-2">
                  {insights.map((i, n) => {
                    const T = TONE[i.tone];
                    return (
                      <li key={n} className="flex items-start gap-2.5 rounded-lg bg-muted/30 p-3 text-sm">
                        <T.icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: T.color }} />
                        <span>
                          {i.text}{" "}
                          {i.href && (
                            <Link href={i.href} className="whitespace-nowrap text-xs text-primary hover:underline">
                              View analysis →
                            </Link>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* trend */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base">Confirmed cases · {a.scope.label}</CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/analytics?${scopeParam ? `scope=${encodeURIComponent(scopeParam)}&` : ""}a=cases_trend,baseline_deviation,anomaly`}>
                  Open in Analytics <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              <SeriesChart
                height={240}
                data={chartRows(a.weekly, ["confirmed", "cases_ma4", "baseline_prev4"])}
                series={[
                  { key: "confirmed", label: "Confirmed cases", color: "#38bdf8", levelKey: "level" },
                  { key: "cases_ma4", label: "4-week moving average", color: "#f5b301", decimals: 1 },
                  { key: "baseline_prev4", label: "Recent baseline", color: "#94a3b8", dashed: true, decimals: 1 },
                ]}
              />
              <Legend
                items={[
                  { label: "Confirmed cases", color: "#38bdf8" },
                  { label: "4-week moving average", color: "#f5b301" },
                  { label: "Recent baseline", color: "#94a3b8", dashed: true },
                  { label: "Flagged week", color: LEVEL_HEX.ELEVATED, dot: true },
                ]}
              />
            </CardContent>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            {a.scope.level !== "district" && (
              <Card className="min-w-0">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Reporting coverage</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Province</TableHead>
                        <TableHead className="text-right">Districts</TableHead>
                        <TableHead className="text-right">Reporting</TableHead>
                        <TableHead className="w-1/3">Coverage</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {a.coverage.by_province.map((p) => (
                        <TableRow key={p.province}>
                          <TableCell className="font-medium">
                            <Link href={`/districts?scope=${encodeURIComponent(`province:${p.province}`)}`} className="hover:text-primary">
                              {p.province === "Kigali City" ? "Kigali City" : `${p.province} Province`}
                            </Link>
                          </TableCell>
                          <TableCell className="text-right">{p.districts_total}</TableCell>
                          <TableCell className="text-right">{p.districts_with_data}</TableCell>
                          <TableCell>
                            <div className="h-2 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${(p.districts_with_data / p.districts_total) * 100}%` }}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
            <Card className="min-w-0">
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base">Recent data imports</CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/data">
                    <FileUp className="h-4 w-4" /> Upload data
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {imports.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{d.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {d.districts.join(", ")} · {fmtDate(d.period.start)} – {fmtDate(d.period.end)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-[11px] text-muted-foreground">
                      <p>{fmt(d.rows)} rows</p>
                      <p>{fmtDate(d.uploadedAt.slice(0, 10))}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
