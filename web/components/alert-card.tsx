import { Card } from "@/components/ui/card";
import { RiskBadge } from "@/components/risk-badge";
import type { Alert } from "@/lib/types";
import { cn } from "@/lib/utils";

export function AlertCard({ alert, compact = false }: { alert: Alert; compact?: boolean }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <RiskBadge level={alert.level} size="sm" />
            <span className="text-xs text-muted-foreground">
              {alert.scope === "sector" ? `${alert.district} · ${alert.sector}` : alert.district}
            </span>
          </div>
          <h4 className="mt-2 font-semibold leading-snug">{alert.headline}</h4>
          <p className="mt-1 text-xs text-muted-foreground">{alert.signal}</p>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          {alert.confidence} conf.
        </span>
      </div>

      {!compact && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Signal drivers
            </p>
            <ul className="mt-1.5 space-y-1">
              {alert.drivers.map((d) => (
                <li key={d} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                  {d}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--risk-watch)]">
              Verify first
            </p>
            <ul className="mt-1.5 space-y-1">
              {alert.verify_first.map((v) => (
                <li key={v} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[color:var(--risk-watch)]" />
                  {v}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className={cn("mt-4 rounded-lg bg-muted/50 p-3", compact && "mt-3")}>
        <p className="text-xs">
          <span className="font-semibold text-foreground">Then act: </span>
          <span className="text-muted-foreground">{alert.then_act}</span>
        </p>
      </div>
    </Card>
  );
}
