import { redirect } from "next/navigation";
import { AnalysisPanel } from "@/components/analytics/panels";
import { AnalysisPicker } from "@/components/analytics/analysis-picker";
import { EmptyScope } from "@/components/surveillance/empty-scope";
import { PageHeader } from "@/components/surveillance/page-header";
import { ANALYSES, parseSelection } from "@/lib/surveillance/catalog";
import { getScopedAnalytics } from "@/lib/surveillance/source";
import { getSession } from "@/lib/session.server";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; a?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const sp = await searchParams;
  const data = await getScopedAnalytics(session, sp.scope);
  const a = data.analytics;
  const availability = Object.fromEntries(ANALYSES.map((d) => [d.id, d.unavailable(a)]));
  const selected = parseSelection(sp.a);
  const scopeParam = a.scope.id === "national" ? "" : a.scope.id;

  return (
    <div className="space-y-6">
      <PageHeader
        data={data}
        title="Analytics"
        description="Choose the analyses you need for the selected area. Each one is calculated from the imported surveillance data for that area."
      />
      {!a.hasData ? (
        <EmptyScope scope={a.scope} />
      ) : (
        <>
          <AnalysisPicker key={selected.join(",")} selected={selected} availability={availability} compact={selected.length > 0} />
          {selected.length > 0 && (
            <>
              <div className="flex flex-wrap gap-2">
                {selected.map((id) => (
                  <a
                    key={id}
                    href={`#${id}`}
                    className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  >
                    {ANALYSES.find((d) => d.id === id)?.title}
                  </a>
                ))}
              </div>
              <div className="space-y-5">
                {selected.map((id) => (
                  <AnalysisPanel key={id} id={id} a={a} scopeParam={scopeParam} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
