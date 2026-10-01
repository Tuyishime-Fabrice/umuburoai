"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  Eye,
  FileDown,
  ListChecks,
  Send,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RiskBadge } from "@/components/risk-badge";
import { RISK_META } from "@/lib/risk";
import type { Alert, RiskLevel } from "@/lib/types";
import { cn } from "@/lib/utils";

const PILOTS = ["Kirehe", "Nyamasheke"];
type Filter = "all" | "HIGH" | "WATCH";

function alertId(a: Alert) {
  return `${a.district}-${a.scope}-${a.headline}`;
}

export function AlertsView({
  alerts,
  asOf,
  epiWeek,
}: {
  alerts: Alert[];
  asOf: string;
  epiWeek: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [verified, setVerified] = useState<Set<string>>(new Set());

  const counts = useMemo(
    () => ({
      all: alerts.length,
      HIGH: alerts.filter((a) => a.level === "HIGH").length,
      WATCH: alerts.filter((a) => a.level === "WATCH").length,
    }),
    [alerts],
  );

  const shown = alerts.filter((a) => filter === "all" || a.level === filter);

  function toggleVerified(id: string) {
    setVerified((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        toast.success("Signal marked verified — you can now prepare a response.");
      }
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryTile label="Active alerts" value={counts.all} icon={Bell} />
        <SummaryTile label="High risk" value={counts.HIGH} icon={AlertTriangle} tone="HIGH" />
        <SummaryTile label="Watch" value={counts.WATCH} icon={Eye} tone="WATCH" />
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Last updated
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold">
            <Clock className="h-4 w-4 text-muted-foreground" /> {asOf}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">epi week {epiWeek}</p>
        </Card>
      </div>

      {/* filters */}
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border bg-card p-1">
          {(
            [
              ["all", `All (${counts.all})`],
              ["HIGH", `High (${counts.HIGH})`],
              ["WATCH", `Watch (${counts.WATCH})`],
            ] as [Filter, string][]
          ).map(([f, label]) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                filter === f ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* cards */}
      <div className="grid gap-4">
        {shown.map((a) => (
          <AlertItem
            key={alertId(a)}
            alert={a}
            verified={verified.has(alertId(a))}
            onVerify={() => toggleVerified(alertId(a))}
          />
        ))}
        {shown.length === 0 && (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            No alerts at this level.
          </Card>
        )}
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Bell;
  tone?: RiskLevel;
}) {
  const color = tone ? RISK_META[tone].color : undefined;
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-3xl font-bold" style={color ? { color } : undefined}>
            {value}
          </p>
        </div>
        <div
          className="grid h-9 w-9 place-items-center rounded-lg"
          style={{
            background: color ? color + "1f" : "var(--muted)",
            color: color ?? "var(--muted-foreground)",
          }}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function AlertItem({
  alert,
  verified,
  onVerify,
}: {
  alert: Alert;
  verified: boolean;
  onVerify: () => void;
}) {
  const m = RISK_META[alert.level];
  const reportDistrict = PILOTS.includes(alert.district) ? alert.district : "Nyamasheke";
  const Icon = alert.level === "HIGH" ? AlertTriangle : Eye;

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-1" style={{ background: m.color }} aria-hidden />
      <CardContent className="p-5 pl-6">
        {/* header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg"
              style={{ background: m.soft, color: m.color }}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <RiskBadge level={alert.level} size="sm" />
                <span className="text-xs text-muted-foreground">
                  {alert.scope === "sector"
                    ? `${alert.district} · ${alert.sector}`
                    : `${alert.district} district`}
                </span>
                {verified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--risk-low-soft)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--risk-low)]">
                    <CheckCircle2 className="h-3 w-3" /> Verified
                  </span>
                )}
              </div>
              <h3 className="mt-2 font-semibold leading-snug">{alert.headline}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{alert.signal}</p>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {alert.confidence} confidence
          </span>
        </div>

        {/* drivers + verify */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <ListChecks className="h-3.5 w-3.5" /> Why this fired
            </p>
            <ul className="mt-2 space-y-1">
              {alert.drivers.map((d) => (
                <li key={d} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                  {d}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-[color:var(--risk-watch)]/30 bg-[color:var(--risk-watch-soft)] p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--risk-watch)]">
              <ShieldCheck className="h-3.5 w-3.5" /> Verify first
            </p>
            <ul className="mt-2 space-y-1">
              {alert.verify_first.map((v) => (
                <li key={v} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[color:var(--risk-watch)]" />
                  {v}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* then act */}
        <div className="mt-4 rounded-lg bg-muted/50 p-3 text-sm">
          <span className="font-semibold">Then act: </span>
          <span className="text-muted-foreground">{alert.then_act}</span>
        </div>

        {/* actions */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant={verified ? "outline" : "default"}
            size="sm"
            onClick={onVerify}
          >
            <CheckCircle2 className="h-4 w-4" />
            {verified ? "Verified" : "Mark verified"}
          </Button>
          <Button
            size="sm"
            disabled={!verified}
            onClick={() =>
              toast.success(`Response prepared — shared with the ${alert.district} district team.`)
            }
          >
            <Send className="h-4 w-4" /> Prepare response
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/report?district=${encodeURIComponent(reportDistrict)}`} target="_blank">
              <FileDown className="h-4 w-4" /> Export PDF
            </Link>
          </Button>
        </div>
        {!verified && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Verify the signal before preparing a response — Umuburo AI never acts on its own.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
