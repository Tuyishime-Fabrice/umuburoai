import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DistrictMap } from "@/components/maps/district-map";
import { LevelBadge } from "@/components/surveillance/level-badge";
import { PageHeader } from "@/components/surveillance/page-header";
import { fmt, fmtDate, signed } from "@/lib/surveillance/display";
import { getScopedAnalytics } from "@/lib/surveillance/source";
import { getSession } from "@/lib/session.server";

const PROVINCES = ["Kigali City", "Southern", "Western", "Northern", "Eastern"];

export default async function DistrictsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const data = await getScopedAnalytics(session, (await searchParams).scope);
  const a = data.analytics;
  const reporting = a.districts.filter((d) => d.hasData).length;

  return (
    <div className="space-y-6">
      <PageHeader
        data={data}
        title="Districts"
        description="Reporting status and latest signal for every district. Select a district for its full profile."
      />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          ["Districts", String(a.districts.length)],
          ["Reporting", String(reporting)],
          ["No data reported", String(a.districts.length - reporting)],
          ["Stale (no new data > 3 weeks)", String(a.districts.filter((d) => d.stale).length)],
        ].map(([k, v]) => (
          <Card key={k} className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{k}</p>
            <p className="mt-1.5 text-2xl font-bold">{v}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="pt-5">
          <DistrictMap districts={a.districts} height={440} />
        </CardContent>
      </Card>

      {PROVINCES.filter((p) => a.districts.some((d) => d.province === p)).map((p) => (
        <Card key={p}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{p === "Kigali City" ? "Kigali City" : `${p} Province`}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-48">District</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Latest week</TableHead>
                  <TableHead className="text-right">Weeks</TableHead>
                  <TableHead className="text-right">Latest cases</TableHead>
                  <TableHead className="text-right">vs baseline</TableHead>
                  <TableHead>Signal</TableHead>
                  <TableHead className="text-right">Incidence, 4 wk</TableHead>
                  <TableHead className="text-right">Positivity, 4 wk</TableHead>
                  <TableHead className="text-right">Alerts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.districts
                  .filter((d) => d.province === p)
                  .map((d) => (
                    <TableRow key={d.district} className={d.hasData ? "" : "text-muted-foreground"}>
                      <TableCell>
                        <Link href={`/districts/${encodeURIComponent(d.district)}`} className="font-medium text-foreground hover:text-primary">
                          {d.district}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {!d.hasData ? (
                          <span className="text-xs">No data reported</span>
                        ) : d.stale ? (
                          <span className="text-xs text-[color:var(--risk-watch)]">Stale · {d.days_since_latest} days</span>
                        ) : (
                          <span className="text-xs text-[color:var(--risk-low)]">Reporting</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{d.latest_week ? fmtDate(d.latest_week) : "—"}</TableCell>
                      <TableCell className="text-right">{d.weeks || "—"}</TableCell>
                      <TableCell className="text-right">{fmt(d.latest_confirmed)}</TableCell>
                      <TableCell className="text-right">{signed(d.latest_change_vs_baseline_pct, 1, "%")}</TableCell>
                      <TableCell>{d.latest_level ? <LevelBadge level={d.latest_level} size="sm" /> : "—"}</TableCell>
                      <TableCell className="text-right">{fmt(d.recent_incidence_per_1000, 2)}</TableCell>
                      <TableCell className="text-right">{d.recent_positivity_pct != null ? `${fmt(d.recent_positivity_pct, 1)}%` : "—"}</TableCell>
                      <TableCell className="text-right">{d.hasData ? d.alerts : "—"}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
