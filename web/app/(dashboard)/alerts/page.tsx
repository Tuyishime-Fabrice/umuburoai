import { redirect } from "next/navigation";
import { AlertsView } from "@/components/alerts/alerts-view";
import { KpiTile } from "@/components/surveillance/kpi-tile";
import { PageHeader } from "@/components/surveillance/page-header";
import { LEVEL_META, fmtDate } from "@/lib/surveillance/display";
import { getScopedAnalytics } from "@/lib/surveillance/source";
import { getSession } from "@/lib/session.server";

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ district?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const data = await getScopedAnalytics(session, (await searchParams).district);
  const a = data.analytics;
  const latest = a.alerts.filter((x) => x.isLatestWeek);

  return (
    <div className="space-y-6">
      <PageHeader
        data={data}
        intro="Alerts are generated only from observations in the CSV, one per district-week where a case-based rule fired. The system flags a signal; the health team verifies and decides."
      />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiTile label="Alerts in latest week" value={String(latest.length)} sub={`Week of ${fmtDate(a.period.end)}`} />
        <KpiTile label="Alerts in dataset period" value={String(a.alerts.length)} sub={`${a.period.weeks} weeks × ${a.districts.length} district(s)`} />
        <KpiTile
          label="Elevated signal"
          value={String(a.alerts.filter((x) => x.level === "ELEVATED").length)}
          tone={LEVEL_META.ELEVATED.color}
        />
        <KpiTile label="Watch" value={String(a.alerts.filter((x) => x.level === "WATCH").length)} tone={LEVEL_META.WATCH.color} />
      </div>
      <AlertsView alerts={a.alerts} />
    </div>
  );
}
