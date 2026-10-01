"use client";

import { useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  FileDown,
  Mail,
  MessageSquare,
  ShieldQuestion,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RiskBadge } from "@/components/risk-badge";
import { ForecastChart } from "@/components/charts/forecast-chart";
import { RiskMapLoader } from "@/components/risk-map-loader";
import { DistrictDrilldown } from "@/components/dashboard/district-drilldown";
import { RISK_META } from "@/lib/risk";
import type { DashboardDistrict } from "@/lib/insight";
import type { District, RiskLevel } from "@/lib/types";
import { cn, nf } from "@/lib/utils";

const URGENCY: Record<string, { label: string; color: string }> = {
  now: { label: "Act now", color: "var(--risk-high)" },
  soon: { label: "Act soon", color: "var(--risk-watch)" },
  routine: { label: "Routine", color: "var(--risk-low)" },
};

function ScoreRing({ score, level }: { score: number; level: RiskLevel }) {
  const color = RISK_META[level].color;
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid h-28 w-28 shrink-0 place-items-center">
      <svg className="h-28 w-28 -rotate-90" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r={r} fill="none" stroke="#1e2a44" strokeWidth="9" />
        <circle
          cx="55"
          cy="55"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
          style={{ transition: "stroke-dashoffset 900ms ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-bold" style={{ color }}>
          {score}%
        </span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">risk</span>
      </div>
    </div>
  );
}

export function DistrictMonitor({
  districts,
  mapDistricts,
  mapCenter,
}: {
  districts: DashboardDistrict[];
  mapDistricts: District[];
  mapCenter: [number, number];
}) {
  const [selected, setSelected] = useState(districts[0]?.name ?? "");
  const [sector, setSector] = useState("all");
  const [channel, setChannel] = useState<"sms" | "email">("sms");

  const d = districts.find((x) => x.name === selected) ?? districts[0];
  if (!d) return null;

  const rise = d.deltaPct >= 0;
  const activeSector = sector === "all" ? null : d.sectors.find((s) => s.name === sector) ?? null;
  const ratio = activeSector ? activeSector.share : 1;
  const obsActual = ratio === 1 ? d.series.actual : d.series.actual.map((v) => Math.round(v * ratio));
  const fc = ratio === 1 ? d.series.forecast : d.series.forecast.map((v) => Math.round(v * ratio));
  const thr = Math.max(1, Math.round(d.threshold * ratio));

  return (
    <div className="space-y-5">
      {/* district switcher — instant, no button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-lg border border-border bg-card p-1">
          {districts.map((x) => {
            const active = x.name === selected;
            return (
              <button
                key={x.name}
                onClick={() => {
                  setSelected(x.name);
                  setSector("all");
                }}
                className={cn(
                  "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                  active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: RISK_META[x.risk].color }} />
                {x.name}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Live status · updates instantly · as of today
        </p>
      </div>

      {/* summary + map */}
      <div key={d.name} className="grid animate-rise gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1" style={{ borderColor: RISK_META[d.risk].color + "44" }}>
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <ScoreRing score={d.score} level={d.risk} />
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {d.province} Province
                </p>
                <h2 className="text-xl font-bold">{d.name}</h2>
                <RiskBadge level={d.risk} size="sm" className="mt-1.5" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-muted/60 p-2.5">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Latest week</p>
                <p className="mt-0.5 font-semibold">{nf(d.casesLatest)}</p>
              </div>
              <div className="rounded-lg bg-muted/60 p-2.5">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">3-wk forecast</p>
                <p className="mt-0.5 flex items-center gap-1 font-semibold">
                  {nf(d.forecast3)}
                  <span
                    className="flex items-center text-xs"
                    style={{ color: rise ? RISK_META[d.risk].color : "var(--risk-low)" }}
                  >
                    {rise ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                    {rise ? "+" : ""}
                    {d.deltaPct}%
                  </span>
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Outbreak threshold ≈ {nf(d.threshold)} cases/wk ·{" "}
              {d.crossesThreshold ? (
                <span className="text-[color:var(--risk-high)]">forecast reaches it</span>
              ) : (
                <span className="text-[color:var(--risk-low)]">forecast stays below</span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-0">
            <CardTitle className="text-base">Pilot districts — risk map</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <RiskMapLoader
              districts={mapDistricts}
              pilots={mapDistricts.map((m) => m.district)}
              center={mapCenter}
              zoom={8}
              height={260}
            />
          </CardContent>
        </Card>
      </div>

      {/* forecast chart with sector selector */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-0">
          <CardTitle className="text-base">
            {activeSector ? `${d.name} · ${activeSector.name} sector` : d.name} — observed vs AI forecast
          </CardTitle>
          <div className="w-full sm:w-52">
            <Select value={sector} onValueChange={setSector}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Whole district</SelectItem>
                {d.sectors.map((s) => (
                  <SelectItem key={s.name} value={s.name}>
                    {s.name} sector
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <ForecastChart
            weeks={d.series.weeks}
            actual={obsActual}
            forecastWeeks={d.series.forecast_weeks}
            forecast={fc}
            threshold={thr}
            height={260}
          />
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-5" style={{ background: "#38bdf8" }} /> Observed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-5" style={{ background: "#f5b301" }} /> AI forecast
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-5" style={{ background: "#ef4444" }} /> Epidemic risk threshold
            </span>
          </div>
        </CardContent>
      </Card>

      {/* recommendation + alert */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldQuestion className="h-4 w-4 text-primary" /> AI recommendation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className="rounded-lg p-3"
              style={{ background: RISK_META[d.risk].soft, color: RISK_META[d.risk].color }}
            >
              <p className="text-sm font-semibold">{d.consequence.headline}</p>
              <p className="mt-1 text-xs leading-relaxed text-foreground/80">{d.consequence.text}</p>
            </div>
            <ul className="space-y-3">
              {d.recommendations.slice(0, 3).map((r) => (
                <li key={r.action} className="flex items-start gap-3">
                  <span
                    className="mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ background: URGENCY[r.urgency].color + "22", color: URGENCY[r.urgency].color }}
                  >
                    {URGENCY[r.urgency].label}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{r.action}</p>
                    <p className="text-xs text-muted-foreground">{r.why}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Alert to {d.alert.recipient}</CardTitle>
            <div className="inline-flex rounded-md border border-border p-0.5">
              <button
                onClick={() => setChannel("sms")}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium",
                  channel === "sms" ? "bg-primary/15 text-primary" : "text-muted-foreground",
                )}
              >
                <MessageSquare className="h-3.5 w-3.5" /> SMS
              </button>
              <button
                onClick={() => setChannel("email")}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium",
                  channel === "email" ? "bg-primary/15 text-primary" : "text-muted-foreground",
                )}
              >
                <Mail className="h-3.5 w-3.5" /> Email
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {channel === "sms" ? (
              <div className="rounded-2xl rounded-tl-sm border border-border bg-muted/50 p-4 text-sm leading-relaxed">
                {d.alert.sms}
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
                <p className="font-semibold">{d.alert.emailSubject}</p>
                <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                  {d.alert.emailBody}
                </p>
              </div>
            )}
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Sample only — nothing is sent before a person approves.
              </p>
              <Button asChild variant="ghost" size="sm">
                <a href={`/report?district=${encodeURIComponent(d.name)}`} target="_blank" rel="noreferrer">
                  <FileDown className="h-4 w-4" /> Export PDF
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <DistrictDrilldown district={d.name} />
    </div>
  );
}
