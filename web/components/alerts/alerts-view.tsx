"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  CloudRain,
  Eye,
  FileDown,
  ListChecks,
  Loader2,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LevelBadge } from "@/components/surveillance/level-badge";
import { LEVEL_META, fmtDate } from "@/lib/surveillance/display";
import type { SignalItem, SurveillanceAlert } from "@/lib/surveillance/types";
import { cn } from "@/lib/utils";

export type Decision = "verified" | "under_investigation" | "not_confirmed";
export interface Review {
  id: string;
  alertId: string;
  decision: Decision;
  note: string;
  at: string;
  by: { name: string; role: string };
}

const DECISION: Record<Decision, { label: string; color: string; soft: string; icon: typeof CheckCircle2 }> = {
  verified: { label: "Verified", color: "var(--risk-high)", soft: "var(--risk-high-soft)", icon: CheckCircle2 },
  under_investigation: { label: "Under investigation", color: "var(--risk-watch)", soft: "var(--risk-watch-soft)", icon: Search },
  not_confirmed: { label: "Not confirmed", color: "var(--risk-low)", soft: "var(--risk-low-soft)", icon: XCircle },
};

type Filter = "latest" | "pending" | "all" | "ELEVATED" | "WATCH";

function when(iso: string) {
  const d = new Date(iso);
  return `${fmtDate(iso.slice(0, 10))} ${d.toISOString().slice(11, 16)} UTC`;
}

export function AlertsView({
  alerts,
  reviews,
  canReview,
}: {
  alerts: SurveillanceAlert[];
  reviews: Review[];
  canReview: string[];
}) {
  const byAlert = useMemo(() => {
    const m = new Map<string, Review[]>();
    for (const r of reviews) m.set(r.alertId, [...(m.get(r.alertId) ?? []), r]);
    for (const v of m.values()) v.sort((x, y) => (x.at < y.at ? 1 : -1));
    return m;
  }, [reviews]);
  const status = (a: SurveillanceAlert) => byAlert.get(a.id)?.[0]?.decision ?? null;
  const [filter, setFilter] = useState<Filter>(alerts.some((a) => a.isLatestWeek) ? "latest" : "all");

  const counts = {
    latest: alerts.filter((a) => a.isLatestWeek).length,
    pending: alerts.filter((a) => !status(a)).length,
    all: alerts.length,
    ELEVATED: alerts.filter((a) => a.level === "ELEVATED").length,
    WATCH: alerts.filter((a) => a.level === "WATCH").length,
  };
  const shown = alerts.filter((a) =>
    filter === "all"
      ? true
      : filter === "latest"
        ? a.isLatestWeek
        : filter === "pending"
          ? !status(a)
          : a.level === filter,
  );
  const tabs: [Filter, string][] = [
    ["latest", `Latest week (${counts.latest})`],
    ["pending", `Awaiting verification (${counts.pending})`],
    ["all", `All (${counts.all})`],
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
          <AlertItem key={a.id} alert={a} history={byAlert.get(a.id) ?? []} canReview={canReview.includes(a.district)} />
        ))}
        {shown.length === 0 && (
          <Card className="p-10 text-center text-sm text-muted-foreground">No alerts for this filter.</Card>
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

function AlertItem({ alert, history, canReview }: { alert: SurveillanceAlert; history: Review[]; canReview: boolean }) {
  const router = useRouter();
  const m = LEVEL_META[alert.level];
  const current = history[0];
  const [decision, setDecision] = useState<Decision | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!decision) return;
    setSaving(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ district: alert.district, week_start: alert.week_start, decision, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the decision");
      toast.success(`Recorded: ${DECISION[decision].label} — ${alert.district}, ${fmtDate(alert.week_start)}`);
      setDecision(null);
      setNote("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the decision");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-1" style={{ background: m.color }} aria-hidden />
      <CardContent className="p-5 pl-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <LevelBadge level={alert.level} size="sm" />
              <span className="text-xs text-muted-foreground">
                {alert.district} · {alert.province} · week of {fmtDate(alert.week_start)}
                {alert.isLatestWeek ? " · latest week" : ""}
              </span>
            </div>
            <h3 className="mt-2 font-semibold leading-snug">{alert.headline}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{alert.summary}</p>
          </div>
          {current ? (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{ background: DECISION[current.decision].soft, color: DECISION[current.decision].color }}
            >
              {DECISION[current.decision].label}
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">Awaiting verification</span>
          )}
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
              <ListChecks className="h-3.5 w-3.5" /> Verification checklist
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

        {canReview && (
          <div className="mt-4 rounded-lg border border-border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Record decision</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(Object.keys(DECISION) as Decision[]).map((d) => {
                const D = DECISION[d];
                return (
                  <Button
                    key={d}
                    type="button"
                    size="sm"
                    variant={decision === d ? "default" : "outline"}
                    onClick={() => setDecision(decision === d ? null : d)}
                  >
                    <D.icon className="h-4 w-4" /> {D.label}
                  </Button>
                );
              })}
            </div>
            {decision && (
              <div className="mt-3 space-y-2">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  maxLength={1000}
                  placeholder="Note (what was checked, findings, action decided)"
                  className="w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <Button size="sm" onClick={save} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save decision
                </Button>
              </div>
            )}
          </div>
        )}

        {history.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Review history</p>
            {history.map((r) => (
              <p key={r.id} className="text-xs text-muted-foreground">
                <span className="font-medium" style={{ color: DECISION[r.decision].color }}>
                  {DECISION[r.decision].label}
                </span>{" "}
                · {r.by.name} · {when(r.at)}
                {r.note ? ` — ${r.note}` : ""}
              </p>
            ))}
          </div>
        )}

        <div className="mt-3 flex justify-end">
          <Button asChild variant="ghost" size="sm">
            <Link href={`/report?scope=${encodeURIComponent(`district:${alert.district}`)}`} target="_blank">
              <FileDown className="h-4 w-4" /> District summary
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
