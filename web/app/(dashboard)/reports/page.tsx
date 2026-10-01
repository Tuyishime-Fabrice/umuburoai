import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Legend, SeriesChart } from "@/components/charts/series-chart";
import { KpiTile } from "@/components/surveillance/kpi-tile";
import { PageHeader } from "@/components/surveillance/page-header";
import { chartRows, fmt, scopeName } from "@/lib/surveillance/display";
import type { WeekPoint } from "@/lib/surveillance/types";
import { getScopedAnalytics } from "@/lib/surveillance/source";
import { getSession } from "@/lib/session.server";

function minOf(points: WeekPoint[], get: (p: WeekPoint) => number | null) {
  const v = points.map(get).filter((x): x is number => x !== null);
  return v.length ? Math.min(...v) : null;
}

export default async function HealthSystemPage({
  searchParams,
}: {
  searchParams: Promise<{ district?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const data = await getScopedAnalytics(session, (await searchParams).district);
  const a = data.analytics;
  const l = a.latest;
  const w = a.weekly;
  const stockoutWeeks = w.filter((p) => (p.stockout_days ?? 0) > 0).length;
  const combined = a.scope === "All";

  return (
    <div className="space-y-6">
      <PageHeader
        data={data}
        intro="Health-system context recorded in the surveillance file: reporting, facilities, medicine stock, bed occupancy and prevention coverage. These help judge how reliable a signal is and how ready services are."
      />

      <div>
        <h2 className="mb-3 text-lg font-semibold">Latest week · {scopeName(a.scope)}</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiTile label="Reporting completeness" value={`${fmt(l?.reporting_completeness_pct, 1)}%`} />
          <KpiTile label="Reporting delay" value={`${fmt(l?.reporting_delay_days, 1)} days`} />
          <KpiTile
            label="Facilities reporting"
            value={`${fmt(l?.facilities_reporting)} / ${fmt(l?.facilities_expected)}`}
          />
          <KpiTile label="Bed occupancy" value={`${fmt(l?.bed_occupancy_pct, 1)}%`} />
          <KpiTile
            label="ACT stock"
            value={`${fmt(l?.act_stock_days, combined ? 1 : 0)} days`}
            sub={`Lowest in period: ${fmt(minOf(w, (p) => p.act_stock_days), combined ? 1 : 0)} days`}
          />
          <KpiTile
            label="RDT stock"
            value={`${fmt(l?.rdt_stock_days, combined ? 1 : 0)} days`}
            sub={`Lowest in period: ${fmt(minOf(w, (p) => p.rdt_stock_days), combined ? 1 : 0)} days`}
          />
          <KpiTile
            label="Stockout days"
            value={fmt(l?.stockout_days)}
            sub={`${fmt(a.totals.stockout_days)} in period · ${stockoutWeeks} week(s) with a stockout`}
          />
          <KpiTile
            label="Bed-net coverage / IRS"
            value={`${fmt(l?.bed_net_coverage_pct, 1)}% / ${fmt(l?.irs_pct, 1)}%`}
          />
        </div>
        {combined && (
          <p className="mt-2 text-xs text-muted-foreground">
            All districts: facilities and stockout days are summed; percentages, delays and stock days are
            averaged across districts.
          </p>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reporting completeness and delay</CardTitle>
          </CardHeader>
          <CardContent>
            <SeriesChart
              height={240}
              leftUnit="%"
              rightUnit="d"
              data={chartRows(w, ["reporting_completeness_pct", "reporting_delay_days"])}
              series={[
                { key: "reporting_completeness_pct", label: "Completeness", color: "#22c55e", decimals: 1, unit: "%" },
                { key: "reporting_delay_days", label: "Delay", color: "#f59e0b", axis: "right", dashed: true, decimals: 1, unit: " days" },
              ]}
              refLines={[{ y: 90, label: "90% caution line", color: "#ef4444" }]}
            />
            <Legend
              items={[
                { label: "Completeness %", color: "#22c55e" },
                { label: "Delay, days (right axis)", color: "#f59e0b", dashed: true },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Facilities expected vs reporting</CardTitle>
          </CardHeader>
          <CardContent>
            <SeriesChart
              height={240}
              data={chartRows(w, ["facilities_expected", "facilities_reporting"])}
              series={[
                { key: "facilities_expected", label: "Expected", color: "#94a3b8", dashed: true },
                { key: "facilities_reporting", label: "Reporting", color: "#38bdf8" },
              ]}
            />
            <Legend items={[{ label: "Expected", color: "#94a3b8", dashed: true }, { label: "Reporting", color: "#38bdf8" }]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Medicine stock (days) and stockouts</CardTitle>
          </CardHeader>
          <CardContent>
            <SeriesChart
              height={240}
              data={chartRows(w, ["act_stock_days", "rdt_stock_days", "stockout_days"])}
              series={[
                { key: "stockout_days", label: "Stockout days", color: "#ef4444", type: "bar", axis: "right" },
                { key: "act_stock_days", label: "ACT stock days", color: "#f5b301", decimals: 1 },
                { key: "rdt_stock_days", label: "RDT stock days", color: "#a78bfa", decimals: 1 },
              ]}
            />
            <Legend
              items={[
                { label: "ACT stock days", color: "#f5b301" },
                { label: "RDT stock days", color: "#a78bfa" },
                { label: "Stockout days (bars, right axis)", color: "#ef4444", dot: true },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bed occupancy and malaria admissions</CardTitle>
          </CardHeader>
          <CardContent>
            <SeriesChart
              height={240}
              rightUnit="%"
              data={chartRows(w, ["admissions", "bed_occupancy_pct"])}
              series={[
                { key: "admissions", label: "Malaria admissions", color: "#38bdf8", type: "bar" },
                { key: "bed_occupancy_pct", label: "Bed occupancy", color: "#f472b6", axis: "right", decimals: 1, unit: "%" },
              ]}
            />
            <Legend
              items={[
                { label: "Malaria admissions (bars)", color: "#38bdf8", dot: true },
                { label: "Bed occupancy % (right axis)", color: "#f472b6" },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prevention coverage recorded in the file</CardTitle>
        </CardHeader>
        <CardContent>
          <SeriesChart
            height={220}
            leftUnit="%"
            data={chartRows(w, ["bed_net_coverage_pct", "irs_pct"])}
            series={[
              { key: "bed_net_coverage_pct", label: "Bed-net coverage", color: "#22c55e", decimals: 1, unit: "%" },
              { key: "irs_pct", label: "Indoor residual spraying", color: "#f5b301", decimals: 1, unit: "%" },
            ]}
          />
          <Legend
            items={[
              { label: "Bed-net coverage %", color: "#22c55e" },
              { label: "Indoor residual spraying %", color: "#f5b301" },
            ]}
          />
          <p className="mt-3 text-xs text-muted-foreground">
            Values are shown as recorded. The system does not estimate the effect of prevention coverage on cases.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
