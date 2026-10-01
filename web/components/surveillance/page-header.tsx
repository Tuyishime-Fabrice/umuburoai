import { CalendarRange, Radio } from "lucide-react";
import { ScopePicker } from "@/components/surveillance/scope-picker";
import { fmtDate } from "@/lib/surveillance/display";
import type { ScopedAnalytics } from "@/lib/surveillance/source";

/** Page title, scope selector and the reporting context behind every number on the page. */
export function PageHeader({
  data,
  title,
  description,
  actions,
}: {
  data: ScopedAnalytics;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  const a = data.analytics;
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {actions}
          <ScopePicker options={data.allowedScopes} current={a.scope} />
        </div>
      </div>
      {a.hasData && (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarRange className="h-3.5 w-3.5" />
            Reporting period {fmtDate(a.period.start)} – {fmtDate(a.period.end)} · {a.period.weeks} weeks
          </span>
          {a.scope.level !== "district" && (
            <span className="inline-flex items-center gap-1.5">
              <Radio className="h-3.5 w-3.5" />
              {a.coverage.districts_with_data} of {a.coverage.districts_total} districts reporting
            </span>
          )}
        </p>
      )}
    </div>
  );
}
