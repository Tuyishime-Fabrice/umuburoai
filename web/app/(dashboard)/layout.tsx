import { redirect } from "next/navigation";
import { Sidebar } from "@/components/app/sidebar";
import { Topbar, type SurveillanceStatus } from "@/components/app/topbar";
import { getSession } from "@/lib/session.server";
import { getScopedAnalytics } from "@/lib/surveillance/source";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  let status: SurveillanceStatus | null = null;
  try {
    const { analytics: a } = await getScopedAnalytics(session, "national");
    status = {
      scopeLabel: session.role === "national" ? "National" : `${a.scope.label} District`,
      epiWeek: a.latest?.epi_week ?? null,
      latestWeek: a.freshness.latest_week,
      daysSinceLatest: a.freshness.days_since_latest,
      stale: a.freshness.stale,
      districtsWithData: session.role === "national" ? a.coverage.districts_with_data : a.hasData ? 1 : 0,
      districtsTotal: session.role === "national" ? a.coverage.districts_total : 1,
    };
  } catch {
    status = null;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar session={session} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar session={session} status={status} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
