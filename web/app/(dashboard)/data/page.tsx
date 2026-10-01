import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatasetTable, type DatasetRow } from "@/components/data/dataset-table";
import { UploadImport } from "@/components/data/upload-import";
import { KpiTile } from "@/components/surveillance/kpi-tile";
import { PageHeader } from "@/components/surveillance/page-header";
import { fmt, fmtDate } from "@/lib/surveillance/display";
import type { CheckLevel } from "@/lib/surveillance/types";
import { getScopedAnalytics } from "@/lib/surveillance/source";
import { listDatasets } from "@/lib/store";
import { getSession } from "@/lib/session.server";

const ICON: Record<CheckLevel, { icon: typeof CheckCircle2; color: string }> = {
  ok: { icon: CheckCircle2, color: "var(--risk-low)" },
  warn: { icon: AlertTriangle, color: "var(--risk-watch)" },
  error: { icon: XCircle, color: "var(--risk-high)" },
};

export default async function DataPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const data = await getScopedAnalytics(session, (await searchParams).scope);
  const a = data.analytics;
  const q = a.quality;
  const summaries = new Map(a.sources.map((s) => [s.id, s]));
  const districtUser = session.role !== "national" ? (session.district ?? "") : null;
  const rows: DatasetRow[] = listDatasets()
    .filter((d) => !districtUser || d.districts.includes(districtUser))
    .sort((x, y) => (x.uploadedAt < y.uploadedAt ? 1 : -1))
    .map((d) => ({
      id: d.id,
      name: d.name,
      uploadedAt: d.uploadedAt,
      uploadedBy: d.uploadedBy.name,
      rows: d.rows,
      districts: districtUser ? d.districts.filter((x) => x === districtUser) : d.districts,
      periodStart: d.period.start,
      periodEnd: d.period.end,
      status: d.status,
      removedBy: d.removedBy?.name,
      removedAt: d.removedAt,
      warnings: summaries.get(d.id)?.validation.filter((v) => v.level === "warn").length ?? 0,
      superseded: summaries.get(d.id)?.superseded ?? 0,
    }));
  const missingCols = q.missing_by_column.filter((c) => c.missing > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        data={data}
        title="Data Management"
        description="Upload weekly surveillance reports, manage imported datasets and review data quality."
      />

      <UploadImport restrictDistrict={districtUser} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Imported datasets</CardTitle>
          <p className="text-xs text-muted-foreground">
            Datasets in use are combined in upload order; for any district-week supplied more than once, the most
            recent upload is used.
          </p>
        </CardHeader>
        <CardContent>
          <DatasetTable rows={rows} canRemove={session.role === "national"} />
        </CardContent>
      </Card>

      {a.hasData && (
        <>
          <div>
            <h2 className="mb-3 text-lg font-semibold">Data quality · {a.scope.label}</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <KpiTile
                label="Records"
                value={fmt(q.records)}
                sub={Object.entries(q.weeks_per_district).map(([d, n]) => `${d}: ${n} wk`).join(" · ")}
              />
              <KpiTile label="Date range" value={`${fmtDate(q.date_start, false)} – ${fmtDate(q.date_end)}`} />
              <KpiTile
                label="Missing values"
                value={fmt(q.missing_values_total)}
                tone={q.missing_values_total ? "var(--risk-watch)" : undefined}
                sub={missingCols.length ? missingCols.map((c) => `${c.column} (${c.missing})`).join(", ") : "None in supplied columns"}
              />
              <KpiTile
                label="Reporting completeness"
                value={`${fmt(q.reporting_completeness.mean, 1)}%`}
                sub={`Lowest ${fmt(q.reporting_completeness.min, 1)}% · ${q.reporting_completeness.weeks_below_90} district-week(s) < 90%`}
              />
              <KpiTile
                label="Reporting delay"
                value={`${fmt(q.reporting_delay_days.mean, 2)} days`}
                sub={`Longest ${fmt(q.reporting_delay_days.max, 1)} · ${q.reporting_delay_days.weeks_above_3} district-week(s) > 3 days`}
              />
              <KpiTile
                label="Facilities (latest week)"
                value={`${fmt(q.facilities.reporting_latest)} / ${fmt(q.facilities.expected_latest)}`}
                sub={`${fmt(q.facilities.reporting_rate_pct, 1)}% reporting`}
              />
              <KpiTile label="Districts with data" value={`${a.coverage.districts_with_data} / ${a.coverage.districts_total}`} />
              <KpiTile
                label="Data freshness"
                value={a.freshness.stale ? `${a.freshness.days_since_latest} days old` : "Current"}
                tone={a.freshness.stale ? "var(--risk-watch)" : "var(--risk-low)"}
                sub={`Latest week ${fmtDate(a.freshness.latest_week)}`}
              />
            </div>
            {q.columns_not_supplied.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Not supplied by any dataset: {q.columns_not_supplied.join(", ")}.
              </p>
            )}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Validation of the combined data</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5">
                {q.validation.map((v) => {
                  const I = ICON[v.level];
                  return (
                    <li key={v.check} className="flex items-start gap-3">
                      <I.icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: I.color }} />
                      <div className="text-sm">
                        <span className="font-medium">{v.check}</span>
                        <span className="text-muted-foreground"> — {v.detail}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
