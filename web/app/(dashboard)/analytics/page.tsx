import { redirect } from "next/navigation";
import { ListChecks } from "lucide-react";
import { ActionItem, AnalysisPanel } from "@/components/analytics/panels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnalysisPicker } from "@/components/analytics/analysis-picker";
import { EmptyScope } from "@/components/surveillance/empty-scope";
import { PageHeader } from "@/components/surveillance/page-header";
import { ANALYSES, parseSelection } from "@/lib/surveillance/catalog";
import { interpret, suggestAnalyses, type Action } from "@/lib/surveillance/interpret";
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
  const suggested = suggestAnalyses(a).filter((s) => !availability[s.id]);

  // Recommended actions from every selected analysis, most urgent first, without repeats.
  const RANK = { high: 0, medium: 1, routine: 2 } as const;
  const summary: (Action & { from: string; fromId: string })[] = [];
  for (const id of selected) {
    if (availability[id]) continue;
    for (const x of interpret(id, a, scopeParam).actions) {
      if (x.priority === "routine" && !x.href) continue;
      if (!summary.some((y) => y.text === x.text))
        summary.push({ ...x, from: ANALYSES.find((d) => d.id === id)?.title ?? id, fromId: id });
    }
  }
  summary.sort((x, y) => RANK[x.priority] - RANK[y.priority]);

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
          <AnalysisPicker
            key={selected.join(",")}
            selected={selected}
            availability={availability}
            suggested={suggested}
            compact={selected.length > 0}
          />
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
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ListChecks className="h-4 w-4 text-primary" /> Summary of recommended actions · {a.scope.label}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    From the {selected.length} {selected.length === 1 ? "analysis" : "analyses"} below. Each action names the
                    condition in the data that triggered it; decisions remain with the surveillance team.
                  </p>
                </CardHeader>
                <CardContent>
                  {summary.length ? (
                    <ul className="space-y-2.5">
                      {summary.map((x) => (
                        <ActionItem
                          key={x.text}
                          action={x}
                          source={
                            <a href={`#${x.fromId}`} className="hover:text-foreground">
                              from {x.from}
                            </a>
                          }
                        />
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      None of the selected analyses calls for action this week. Keep monitoring routinely as new data is
                      uploaded.
                    </p>
                  )}
                </CardContent>
              </Card>
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
