import { redirect } from "next/navigation";
import { AlertsView, type Review } from "@/components/alerts/alerts-view";
import { EmptyScope } from "@/components/surveillance/empty-scope";
import { KpiTile } from "@/components/surveillance/kpi-tile";
import { PageHeader } from "@/components/surveillance/page-header";
import { LEVEL_META } from "@/lib/surveillance/display";
import { getScopedAnalytics } from "@/lib/surveillance/source";
import { listReviews } from "@/lib/store";
import { getSession } from "@/lib/session.server";

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const data = await getScopedAnalytics(session, (await searchParams).scope);
  const a = data.analytics;
  const ids = new Set(a.alerts.map((x) => x.id));
  const reviews: Review[] = listReviews()
    .filter((r) => ids.has(r.alertId))
    .map((r) => ({ id: r.id, alertId: r.alertId, decision: r.decision, note: r.note, at: r.at, by: { name: r.by.name, role: r.by.role } }));
  const latestDecision = new Map<string, string>();
  for (const r of [...reviews].sort((x, y) => (x.at < y.at ? -1 : 1))) latestDecision.set(r.alertId, r.decision);
  const canReview = session.role === "national" ? a.districtsWithData : a.districtsWithData.filter((d) => d === session.district);

  return (
    <div className="space-y-6">
      <PageHeader
        data={data}
        title="Alerts & Verification"
        description="Signals raised from the surveillance data. The system flags; the district health team verifies, records a decision and acts."
      />
      {!a.hasData ? (
        <EmptyScope scope={a.scope} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiTile label="Latest week" value={String(a.alerts.filter((x) => x.isLatestWeek).length)} sub="alerts" />
            <KpiTile
              label="Awaiting verification"
              value={String(a.alerts.filter((x) => !latestDecision.has(x.id)).length)}
              tone={LEVEL_META.WATCH.color}
            />
            <KpiTile
              label="Verified"
              value={String([...latestDecision.values()].filter((d) => d === "verified").length)}
              tone={LEVEL_META.ELEVATED.color}
            />
            <KpiTile
              label="Not confirmed"
              value={String([...latestDecision.values()].filter((d) => d === "not_confirmed").length)}
              tone={LEVEL_META.NONE.color}
            />
          </div>
          <AlertsView alerts={a.alerts} reviews={reviews} canReview={canReview} />
        </>
      )}
    </div>
  );
}
