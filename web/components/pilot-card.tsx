import Link from "next/link";
import { ArrowUpRight, TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { RiskBadge } from "@/components/risk-badge";
import { RISK_META, riskFactors, riskScore } from "@/lib/risk";
import type { District } from "@/lib/types";
import { nf } from "@/lib/utils";

export function PilotCard({ d }: { d: District }) {
  const score = riskScore(d);
  const color = RISK_META[d.risk].color;
  const forecast3 = d.forecast[2] ?? d.forecast[d.forecast.length - 1];
  const delta = d.cases_latest
    ? Math.round(((forecast3 - d.cases_latest) / d.cases_latest) * 100)
    : 0;
  const topDriver = riskFactors(d)[0];

  return (
    <Card className="relative overflow-hidden p-5" style={{ borderColor: color + "44" }}>
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: color }}
        aria-hidden="true"
      />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{d.province} Province</p>
          <h3 className="mt-0.5 text-xl font-bold">{d.district}</h3>
        </div>
        <RiskBadge level={d.risk} />
      </div>

      <div className="mt-4 flex items-end gap-4">
        <div>
          <span className="text-4xl font-bold" style={{ color }}>
            {score}%
          </span>
          <span className="ml-1 text-xs text-muted-foreground">risk</span>
        </div>
        <div className="mb-1 flex items-center gap-1 text-sm" style={{ color: delta > 0 ? color : "var(--risk-low)" }}>
          {delta > 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          {delta > 0 ? "+" : ""}
          {delta}% in 3 wks
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-muted/60 p-2.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Latest week</p>
          <p className="mt-0.5 font-semibold">{nf(d.cases_latest)} cases</p>
        </div>
        <div className="rounded-lg bg-muted/60 p-2.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">3-wk forecast</p>
          <p className="mt-0.5 font-semibold">{nf(forecast3)} cases</p>
        </div>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Main driver:</span> {topDriver.detail}
      </p>

      <Link
        href="/forecast"
        className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        Run forecast <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </Card>
  );
}
