import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Legend, SeriesChart } from "@/components/charts/series-chart";
import { EmptyScope } from "@/components/surveillance/empty-scope";
import { KpiTile } from "@/components/surveillance/kpi-tile";
import { LevelBadge } from "@/components/surveillance/level-badge";
import { SignalPanel } from "@/components/surveillance/signal-panel";
import { PRESETS } from "@/lib/surveillance/catalog";
import { LEVEL_HEX, LEVEL_META, chartRows, fmt, fmtDate, shown, signed } from "@/lib/surveillance/display";
import { canonicalDistrict, provinceLabel, provinceOf } from "@/lib/surveillance/pipeline";
import { getScopedAnalytics } from "@/lib/surveillance/source";
import { getSession } from "@/lib/session.server";

export default async function DistrictProfilePage({ params }: { params: Promise<{ district: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const name = canonicalDistrict(decodeURIComponent((await params).district));
  if (!name) notFound();
  if (session.role !== "national" && canonicalDistrict(session.district ?? "") !== name)
    redirect(`/districts/${encodeURIComponent(session.district ?? "")}`);

  const scopeId = `district:${name}`;
  const { analytics: a } = await getScopedAnalytics(session, scopeId);
  const l = a.latest;
  const t = a.totals;
  const q = `scope=${encodeURIComponent(scopeId)}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {session.role === "national" && (
            <Link href="/districts" className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" /> All districts
            </Link>
          )}
          <h1 className="text-2xl font-bold tracking-tight">{name} District</h1>
          <p className="text-sm text-muted-foreground">{provinceLabel(provinceOf(name))}</p>
        </div>
        {a.hasData && (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/report?${q}`} target="_blank">
                <FileDown className="h-4 w-4" /> District summary
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/analytics?${q}`}>
                Analytics <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        )}
      </div>

      {!a.hasData ? (
        <EmptyScope scope={a.scope} />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {a.period.weeks} weeks of data · {fmtDate(a.period.start)} – {fmtDate(a.period.end)}
            {a.freshness.stale ? ` · no new data for ${a.freshness.days_since_latest} days` : ""}
          </p>
          <div className="grid gap-5 lg:grid-cols-5">
            <Card className="lg:col-span-2" style={l ? { borderColor: LEVEL_HEX[l.signal.level] + "55" } : undefined}>
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Current signal</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Week of {fmtDate(l?.week_start)} · epi week {l?.epi_week ?? "—"}
                  </p>
                </div>
                {l && <LevelBadge level={l.signal.level} />}
              </CardHeader>
              <CardContent>
                {l && <SignalPanel signal={l.signal} compact />}
                {a.alerts.length > 0 && (
                  <Link href={`/alerts?${q}`} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                    {a.alerts.length} alert{a.alerts.length > 1 ? "s" : ""} in the period <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </CardContent>
            </Card>
            <div className="grid grid-cols-2 gap-4 lg:col-span-3">
              <KpiTile
                label="Confirmed (latest week)"
                value={fmt(l?.confirmed)}
                tone={l ? LEVEL_META[l.signal.level].color : undefined}
                sub={`${signed(l?.change_vs_baseline_pct, 1, "%")} vs recent baseline`}
              />
              <KpiTile label="Test positivity" value={shown([l?.positivity_pct], `${fmt(l?.positivity_pct, 1)}%`)} sub={t.positivity_pct != null ? `period ${fmt(t.positivity_pct, 1)}%` : undefined} />
              <KpiTile label="Cases in period" value={fmt(t.confirmed)} sub={t.incidence_per_1000 != null ? `${fmt(t.incidence_per_1000, 1)} per 1,000` : undefined} />
              <KpiTile label="Severe / deaths (period)" value={shown([t.severe, t.deaths], `${fmt(t.severe)} / ${fmt(t.deaths)}`)} />
              <KpiTile label="Reporting completeness" value={shown([l?.reporting_completeness_pct], `${fmt(l?.reporting_completeness_pct, 1)}%`)} />
              <KpiTile label="ACT / RDT stock" value={shown([l?.act_stock_days, l?.rdt_stock_days], `${fmt(l?.act_stock_days)} / ${fmt(l?.rdt_stock_days)} d`)} />
            </div>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Confirmed cases</CardTitle>
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

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Open an analysis for {name}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button key={p.id} asChild variant="outline" size="sm">
                  <Link href={`/analytics?${q}&a=${p.analyses.join(",")}`}>{p.label}</Link>
                </Button>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
