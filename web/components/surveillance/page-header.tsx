import { Database } from "lucide-react";
import { ScopeTabs } from "@/components/surveillance/scope-tabs";
import { fmtDate } from "@/lib/surveillance/display";
import type { ScopedAnalytics } from "@/lib/surveillance/source";

/** Scope selector plus the provenance of every number on the page. */
export function PageHeader({ data, intro }: { data: ScopedAnalytics; intro: string }) {
  const a = data.analytics;
  const latest = a.latest;
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">{intro}</p>
        <ScopeTabs scopes={data.allowedScopes} current={a.scope} />
      </div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <Database className="h-3.5 w-3.5 shrink-0" />
        <span>
          Calculated from <span className="font-medium text-foreground [overflow-wrap:anywhere]">{a.source.file}</span> ·{" "}
          {a.source.rows} rows · {fmtDate(a.period.start)} – {fmtDate(a.period.end)}
          {latest ? ` · latest week ${fmtDate(latest.week_start)} (epi week ${latest.epi_week ?? "—"})` : ""}
        </span>
        <span className="text-muted-foreground/70">
          · computed by {data.computedBy === "api" ? "the Umuburo API" : "this server"}
        </span>
      </p>
    </div>
  );
}
