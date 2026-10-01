"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  CloudRain,
  Eye,
  FileDown,
  ListChecks,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LevelBadge } from "@/components/surveillance/level-badge";
import { LEVEL_META, fmtDate } from "@/lib/surveillance/display";
import type { SignalItem, SurveillanceAlert } from "@/lib/surveillance/types";
import { cn } from "@/lib/utils";

type Filter = "all" | "latest" | "ELEVATED" | "WATCH";
type Review = "verified" | "not_confirmed";

export function AlertsView({ alerts }: { alerts: SurveillanceAlert[] }) {
  const [filter, setFilter] = useState<Filter>(alerts.some((a) => a.isLatestWeek) ? "latest" : "all");
  const [review, setReview] = useState<Record<string, Review>>({});

  const counts = useMemo(
    () => ({
      all: alerts.length,
      latest: alerts.filter((a) => a.isLatestWeek).length,
      ELEVATED: alerts.filter((a) => a.level === "ELEVATED").length,
      WATCH: alerts.filter((a) => a.level === "WATCH").length,
    }),
    [alerts],
  );
  const shown = alerts.filter((a) =>
    filter === "all" ? true : filter === "latest" ? a.isLatestWeek : a.level === filter,
  );

  const tabs: [Filter, string][] = [
    ["latest", `Latest week (${counts.latest})`],
    ["all", `All in period (${counts.all})`],
    ["ELEVATED", `Elevated (${counts.ELEVATED})`],
    ["WATCH", `Watch (${counts.WATCH})`],
  ];

  return (
    <div className="space-y-5">
      <div className="inline-flex flex-wrap rounded-lg border border-border bg-card p-1">
        {tabs.map(([f, label]) => (
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

      <div className="grid gap-4">
        {shown.map((a) => (
          <AlertItem
            key={a.id}
            alert={a}
            review={review[a.id]}
            onReview={(r) =>
              setReview((prev) => {
                const next = { ...prev };
                if (next[a.id] === r) delete next[a.id];
                else next[a.id] = r;
                return next;
              })
            }
          />
        ))}
        {shown.length === 0 && (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            No alerts for this filter. Alerts appear only when a case-based rule fires in the data.
          </Card>
        )}
      </div>
    </div>
  );
}

function Items({ title, items, icon: Icon, color }: { title: string; items: SignalItem[]; icon: typeof Eye; color: string }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color }}>
        <Icon className="h-3.5 w-3.5" /> {title}
      </p>
      <ul className="mt-1.5 space-y-1">
        {items.map((s) => (
          <li key={s.key} className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{s.label}.</span> {s.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AlertItem({
  alert,
  review,
  onReview,
}: {
  alert: SurveillanceAlert;
  review?: Review;
  onReview: (r: Review) => void;
}) {
  const m = LEVEL_META[alert.level];
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-1" style={{ background: m.color }} aria-hidden />
      <CardContent className="p-5 pl-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <LevelBadge level={alert.level} size="sm" />
              <span className="text-xs text-muted-foreground">
                {alert.district} · week of {fmtDate(alert.week_start)}
                {alert.isLatestWeek ? " · latest week" : ""}
              </span>
              {review && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    background: review === "verified" ? "var(--risk-low-soft)" : "var(--muted)",
                    color: review === "verified" ? "var(--risk-low)" : "var(--muted-foreground)",
                  }}
                >
                  {review === "verified" ? "Verified by reviewer" : "Not confirmed by reviewer"}
                </span>
              )}
            </div>
            <h3 className="mt-2 font-semibold leading-snug">{alert.headline}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{alert.summary}</p>
          </div>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            Requires verification
          </span>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-lg bg-muted/40 p-3">
            <Items title="Why this signal fired" items={alert.signals} icon={AlertTriangle} color="var(--risk-high)" />
            <Items title="Observations" items={alert.observations} icon={Eye} color="var(--risk-watch)" />
            <Items title="Environmental context" items={alert.context} icon={CloudRain} color="var(--primary)" />
            <Items title="Data confidence" items={alert.quality} icon={ShieldCheck} color="var(--risk-low)" />
          </div>
          <div className="rounded-lg border border-[color:var(--risk-watch)]/30 bg-[color:var(--risk-watch-soft)] p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--risk-watch)]">
              <ListChecks className="h-3.5 w-3.5" /> Verify before deciding
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-4">
              {alert.verify.map((v) => (
                <li key={v} className="text-xs text-muted-foreground">
                  {v}
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant={review === "verified" ? "default" : "outline"} size="sm" onClick={() => onReview("verified")}>
            <CheckCircle2 className="h-4 w-4" /> Signal verified
          </Button>
          <Button
            variant={review === "not_confirmed" ? "default" : "outline"}
            size="sm"
            onClick={() => onReview("not_confirmed")}
          >
            <XCircle className="h-4 w-4" /> Not confirmed
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/report?district=${encodeURIComponent(alert.district)}`} target="_blank">
              <FileDown className="h-4 w-4" /> District summary
            </Link>
          </Button>
          <span className="text-[11px] text-muted-foreground">
            CSV alert_label for this week: {alert.file_alert_label ?? "—"} · review choices are kept only in
            this browser tab (not saved).
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
