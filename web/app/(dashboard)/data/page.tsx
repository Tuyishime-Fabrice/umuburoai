import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, Download, UploadCloud, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Legend, SeriesChart } from "@/components/charts/series-chart";
import { KpiTile } from "@/components/surveillance/kpi-tile";
import { PageHeader } from "@/components/surveillance/page-header";
import { chartRows, fmt, fmtDate, scopeName } from "@/lib/surveillance/display";
import type { CheckLevel } from "@/lib/surveillance/types";
import { getScopedAnalytics } from "@/lib/surveillance/source";
import { getSession } from "@/lib/session.server";

const CHECK_ICON: Record<CheckLevel, { icon: typeof CheckCircle2; color: string }> = {
  ok: { icon: CheckCircle2, color: "var(--risk-low)" },
  warn: { icon: AlertTriangle, color: "var(--risk-watch)" },
  error: { icon: XCircle, color: "var(--risk-high)" },
};

export default async function DataPage({
  searchParams,
}: {
  searchParams: Promise<{ district?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const data = await getScopedAnalytics(session, (await searchParams).district);
  const a = data.analytics;
  const q = a.quality;
  const w = a.weekly;
  const missingCols = q.missing_by_column.filter((c) => c.missing > 0);
  const combined = a.scope === "All";

  return (
    <div className="space-y-6">
      <PageHeader
        data={data}
        intro="Data quality and environmental conditions for the selected scope, exactly as calculated from the surveillance file."
      />

      {/* data quality */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Data quality · {scopeName(a.scope)}</h2>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <a href="/api/dataset" download>
                <Download className="h-4 w-4" /> Download source CSV
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/upload">
                <UploadCloud className="h-4 w-4" /> Validate another file
              </Link>
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiTile
            label="Records"
            value={fmt(q.records)}
            sub={Object.entries(q.weeks_per_district)
              .map(([d, n]) => `${d}: ${n} weeks`)
              .join(" · ")}
          />
          <KpiTile label="Districts covered" value={String(q.districts.length)} sub={q.districts.join(", ")} />
          <KpiTile label="Date range" value={`${fmtDate(q.date_start, false)} – ${fmtDate(q.date_end)}`} sub="Weekly records (week_start)" />
          <KpiTile
            label="Missing values"
            value={fmt(q.missing_values_total)}
            tone={q.missing_values_total ? "var(--risk-watch)" : undefined}
            sub={
              missingCols.length
                ? missingCols.map((c) => `${c.column} (${c.missing})`).join(", ")
                : `None in ${q.missing_by_column.length} numeric columns`
            }
          />
          <KpiTile
            label="Reporting completeness"
            value={`${fmt(q.reporting_completeness.mean, 1)}% avg`}
            sub={`Lowest ${fmt(q.reporting_completeness.min, 1)}% · ${q.reporting_completeness.weeks_below_90} district-week(s) below 90%`}
          />
          <KpiTile
            label="Reporting delay"
            value={`${fmt(q.reporting_delay_days.mean, 2)} days avg`}
            sub={`Longest ${fmt(q.reporting_delay_days.max, 1)} days · ${q.reporting_delay_days.weeks_above_3} district-week(s) above 3 days`}
          />
          <KpiTile label="Facilities expected" value={fmt(q.facilities.expected_latest)} sub="Latest week" />
          <KpiTile
            label="Facilities reporting"
            value={fmt(q.facilities.reporting_latest)}
            sub={`Latest week · ${fmt(q.facilities.reporting_rate_pct, 1)}% of expected`}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Validation and cleaning (whole file)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {q.cleaning.rowsRead} rows read · {q.cleaning.rowsKept} kept · {q.cleaning.droppedInvalidKey} dropped for
            an invalid date or district · {q.cleaning.droppedDuplicate} duplicate(s) dropped ·{" "}
            {q.cleaning.valuesSetToNull} value(s) set to missing. Missing values are never filled in.
          </p>
          <ul className="space-y-2.5">
            {q.validation.map((v) => {
              const I = CHECK_ICON[v.level];
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

      {/* environment */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Environmental conditions · {scopeName(a.scope)}</h2>
        {combined && (
          <p className="mb-3 text-xs text-muted-foreground">All districts: values are averaged across districts.</p>
        )}
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rainfall</CardTitle>
            </CardHeader>
            <CardContent>
              <SeriesChart
                height={230}
                data={chartRows(w, ["rainfall_mm", "rainfall_4wk_avg"])}
                series={[
                  { key: "rainfall_mm", label: "Weekly rainfall", color: "#38bdf8", type: "bar", decimals: 1, unit: " mm" },
                  { key: "rainfall_4wk_avg", label: "4-week average", color: "#f5b301", decimals: 1, unit: " mm" },
                ]}
              />
              <Legend items={[{ label: "Weekly rainfall, mm (bars)", color: "#38bdf8", dot: true }, { label: "4-week average", color: "#f5b301" }]} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Temperature and humidity</CardTitle>
            </CardHeader>
            <CardContent>
              <SeriesChart
                height={230}
                rightUnit="%"
                data={chartRows(w, ["temperature_c", "humidity_pct"])}
                series={[
                  { key: "temperature_c", label: "Mean temperature", color: "#f97316", decimals: 1, unit: " °C" },
                  { key: "humidity_pct", label: "Relative humidity", color: "#22d3ee", axis: "right", dashed: true, decimals: 1, unit: "%" },
                ]}
              />
              <Legend items={[{ label: "Mean temperature, °C", color: "#f97316" }, { label: "Relative humidity % (right axis)", color: "#22d3ee", dashed: true }]} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mosquito and larval density</CardTitle>
            </CardHeader>
            <CardContent>
              <SeriesChart
                height={230}
                data={chartRows(w, ["mosquito_density", "larval_density"])}
                series={[
                  { key: "mosquito_density", label: "Mosquito density index", color: "#ef4444", decimals: 2 },
                  { key: "larval_density", label: "Larval density index", color: "#a78bfa", axis: "right", decimals: 2 },
                ]}
              />
              <Legend items={[{ label: "Mosquito density index", color: "#ef4444" }, { label: "Larval density index (right axis)", color: "#a78bfa" }]} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Vegetation (NDVI) and human mobility</CardTitle>
            </CardHeader>
            <CardContent>
              <SeriesChart
                height={230}
                data={chartRows(w, ["ndvi", "mobility_index"])}
                series={[
                  { key: "ndvi", label: "NDVI", color: "#22c55e", decimals: 3 },
                  { key: "mobility_index", label: "Human mobility index", color: "#94a3b8", axis: "right", dashed: true, decimals: 3 },
                ]}
              />
              <Legend items={[{ label: "NDVI", color: "#22c55e" }, { label: "Human mobility index (right axis)", color: "#94a3b8", dashed: true }]} />
            </CardContent>
          </Card>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          How these variables relate to confirmed cases in this dataset is on the{" "}
          <Link href={`/overview${a.scope === "All" ? "" : `?district=${encodeURIComponent(a.scope)}`}`} className="text-primary hover:underline">
            Signal Analysis
          </Link>{" "}
          page.
        </p>
      </div>

      {/* records */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Weekly records · {scopeName(a.scope)} ({w.length} weeks{combined ? ", combined" : ", as in the CSV"})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[520px] overflow-auto rounded-lg border border-border">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  {[
                    "Week of", "Epi wk", "Suspected", "Tested", "Confirmed", "Positivity %", "Severe", "Deaths",
                    "Admissions", "Incidence /1k", "Rain mm", "Temp °C", "Humidity %", "NDVI", "Mosquito", "Larval",
                    "Completeness %", "Delay d", "Facilities", "ACT d", "RDT d", "Stockout d", "Beds %", "CSV label",
                  ].map((h) => (
                    <TableHead key={h} className="whitespace-nowrap text-right first:text-left">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...w].reverse().map((p) => (
                  <TableRow key={p.week_start} className="text-xs">
                    <TableCell className="whitespace-nowrap">{p.week_start}</TableCell>
                    {[
                      fmt(p.epi_week), fmt(p.suspected), fmt(p.tested), fmt(p.confirmed), fmt(p.positivity_pct, 2),
                      fmt(p.severe), fmt(p.deaths), fmt(p.admissions), fmt(p.incidence_per_1000, 3),
                      fmt(p.rainfall_mm, 1), fmt(p.temperature_c, 2), fmt(p.humidity_pct, 1), fmt(p.ndvi, 3),
                      fmt(p.mosquito_density, 2), fmt(p.larval_density, 2), fmt(p.reporting_completeness_pct, 1),
                      fmt(p.reporting_delay_days, 1), `${fmt(p.facilities_reporting)}/${fmt(p.facilities_expected)}`,
                      fmt(p.act_stock_days, combined ? 1 : 0), fmt(p.rdt_stock_days, combined ? 1 : 0),
                      fmt(p.stockout_days), fmt(p.bed_occupancy_pct, 1), fmt(p.file_alert_label),
                    ].map((v, i) => (
                      <TableCell key={i} className="whitespace-nowrap text-right">
                        {v}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {combined
              ? "Counts summed across districts; positivity and incidence recomputed from the sums; other values averaged. Select a district to see its rows exactly as in the CSV."
              : "Values exactly as in the CSV. — marks a missing value."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
