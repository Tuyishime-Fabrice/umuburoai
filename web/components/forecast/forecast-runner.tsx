"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Play, ShieldQuestion } from "lucide-react";
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
import { RISK_META } from "@/lib/risk";
import type { RiskLevel } from "@/lib/types";
import type { ForecastResult } from "@/lib/forecast";
import { cn, nf } from "@/lib/utils";

const STEPS = [
  "Loading district surveillance data",
  "Seasonal baseline & anomaly (z-score)",
  "Climate lag: rainfall → cases (~8 wks)",
  "Ridge-regression 1–3 week forecast",
  "Explainable risk fusion",
];

function ScoreRing({ score, level }: { score: number; level: RiskLevel }) {
  const color = RISK_META[level].color;
  const r = 52;
  const c = 2 * Math.PI * r;
  const off = c * (1 - score / 100);
  return (
    <div className="relative grid h-32 w-32 place-items-center">
      <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#1e2a44" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset 900ms ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold" style={{ color }}>
          {score}%
        </span>
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">risk score</span>
      </div>
    </div>
  );
}

export function ForecastRunner({
  districts,
  defaultDistrict = "Nyamasheke",
}: {
  districts: { district: string; risk: RiskLevel }[];
  defaultDistrict?: string;
}) {
  const [district, setDistrict] = useState(defaultDistrict);
  const [weeks, setWeeks] = useState("3");
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [stepIdx, setStepIdx] = useState(0);
  const [result, setResult] = useState<ForecastResult | null>(null);

  async function run() {
    setPhase("running");
    setResult(null);
    setStepIdx(0);
    const started = Date.now();
    const iv = setInterval(
      () => setStepIdx((i) => Math.min(i + 1, STEPS.length - 1)),
      330,
    );
    try {
      const res = await fetch("/api/forecast", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ district, weeks: Number(weeks) }),
      });
      const data = await res.json();
      const elapsed = Date.now() - started;
      if (elapsed < 1700) await new Promise((r) => setTimeout(r, 1700 - elapsed));
      clearInterval(iv);
      if (!res.ok) throw new Error(data.error || "Forecast failed");
      setStepIdx(STEPS.length - 1);
      setResult(data as ForecastResult);
      setPhase("done");
    } catch (e) {
      clearInterval(iv);
      toast.error(e instanceof Error ? e.message : "Forecast failed");
      setPhase("idle");
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="p-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                District
              </label>
              <Select value={district} onValueChange={setDistrict}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {districts.map((d) => (
                    <SelectItem key={d.district} value={d.district}>
                      {d.district}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Forecast period
              </label>
              <Select value={weeks} onValueChange={setWeeks}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 week ahead</SelectItem>
                  <SelectItem value="2">2 weeks ahead</SelectItem>
                  <SelectItem value="3">3 weeks ahead</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="lg" onClick={run} disabled={phase === "running"} className="w-full sm:w-auto">
              {phase === "running" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Forecast Outbreak Risk
            </Button>
          </div>
        </CardContent>
      </Card>

      {phase === "running" && (
        <Card className="overflow-hidden">
          <div className="relative h-1 w-full bg-muted">
            <div className="absolute inset-y-0 left-0 w-1/3 bg-primary animate-scan" style={{ height: "100%" }} />
          </div>
          <CardContent className="p-5">
            <p className="text-sm font-medium">Running the model…</p>
            <ul className="mt-4 space-y-2.5">
              {STEPS.map((s, i) => (
                <li key={s} className="flex items-center gap-3 text-sm">
                  {i < stepIdx ? (
                    <CheckCircle2 className="h-4 w-4 text-[color:var(--risk-low)]" />
                  ) : i === stepIdx ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <span className="h-4 w-4 rounded-full border border-border" />
                  )}
                  <span className={cn(i <= stepIdx ? "text-foreground" : "text-muted-foreground")}>
                    {s}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {phase === "done" && result && (
        <div className="animate-rise space-y-5">
          <Card style={{ borderColor: RISK_META[result.level].color + "55" }}>
            <CardContent className="p-5">
              <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-8">
                <ScoreRing score={result.score} level={result.level} />
                <div className="flex-1 space-y-3 text-center sm:text-left">
                  <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                    <h3 className="text-2xl font-bold">{result.district}</h3>
                    <RiskBadge level={result.level} size="md" />
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{result.narrative}</p>
                  <div className="grid grid-cols-3 gap-3 pt-1">
                    <Metric label="Latest week" value={nf(result.current)} />
                    <Metric
                      label={`In ${result.weeks} wk`}
                      value={nf(result.predicted)}
                      accent={RISK_META[result.level].color}
                    />
                    <Metric
                      label="Change"
                      value={`${result.deltaPct > 0 ? "+" : ""}${result.deltaPct}%`}
                      accent={result.deltaPct > 0 ? "var(--risk-high)" : "var(--risk-low)"}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-5 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="text-base">Observed cases vs AI forecast</CardTitle>
              </CardHeader>
              <CardContent>
                <ForecastChart
                  weeks={result.series.weeks}
                  actual={result.series.actual}
                  baseline={result.series.baseline}
                  forecastWeeks={result.series.forecast_weeks}
                  forecast={result.series.forecast}
                  height={260}
                />
                <Legend />
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Why — main contributing factors</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {result.factors.map((f) => (
                  <div key={f.label}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{f.label}</span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.round(f.weight * 100)}%`,
                          background: RISK_META[f.tone].color,
                        }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{f.detail}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldQuestion className="h-4 w-4 text-primary" />
                Verify before you act
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {result.verifyFirst.map((v) => (
                  <li key={v} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    {v}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                Umuburo AI never confirms an outbreak on its own — it surfaces the signal so a person
                can verify and decide. Data as of {result.asOf}.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg bg-muted/60 p-2.5 text-center sm:text-left">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-bold" style={accent ? { color: accent } : undefined}>
        {value}
      </p>
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-5 bg-white" /> Observed
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-5" style={{ background: "#5b6b8a" }} /> Seasonal baseline
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-5" style={{ background: "#f5b301" }} /> AI forecast
      </span>
    </div>
  );
}
