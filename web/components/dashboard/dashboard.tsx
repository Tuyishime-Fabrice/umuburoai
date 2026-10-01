"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  FileDown,
  Mail,
  MessageSquare,
  Play,
  ShieldCheck,
  ShieldQuestion,
  SlidersHorizontal,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { ScanProgress } from "@/components/scan-progress";
import { DistrictDrilldown } from "@/components/dashboard/district-drilldown";
import { HowItWorks } from "@/components/dashboard/how-it-works";
import { RISK_META } from "@/lib/risk";
import type { DashboardDistrict } from "@/lib/insight";
import type { District, RiskLevel } from "@/lib/types";
import { cn, nf } from "@/lib/utils";

const FORECAST_STEPS = [
  "Reading district surveillance data",
  "Computing the seasonal baseline",
  "Detecting anomalies (z-score control chart)",
  "Modelling rainfall → cases lag (~8 weeks)",
  "Running the ridge-regression forecast",
  "Fusing the explainable risk score",
  "Preparing recommendation & alert",
];

const UPLOAD_STEPS = [
  "Reading the file",
  "Detecting format & columns",
  "Parsing rows",
  "Checking missing values & duplicates",
  "Validating dates & locations",
  "Finalising validation report",
];

const SOURCES = [
  { v: "all", label: "All sources" },
  { v: "dhis2", label: "DHIS2" },
  { v: "elmis", label: "eLMIS" },
  { v: "surveillance", label: "Malaria surveillance" },
  { v: "facility", label: "Facility reports" },
];
const WEEK_OPTIONS = [
  { v: "0", label: "None — observed only" },
  { v: "2", label: "2 weeks ahead" },
  { v: "3", label: "3 weeks ahead" },
  { v: "4", label: "4 weeks ahead" },
  { v: "6", label: "6 weeks ahead" },
  { v: "8", label: "8 weeks ahead" },
];

const CONF_COLOR: Record<string, string> = {
  High: "var(--risk-low)",
  Medium: "var(--risk-watch)",
  Low: "var(--risk-high)",
};

const PIPELINES = [
  { name: "DHIS2", status: "Active", color: "#22c55e" },
  { name: "eLMIS", status: "Synced", color: "#f5b301" },
  { name: "CHIRPS Climate", status: "Live", color: "#38bdf8" },
  { name: "Surveillance", status: "OK", color: "#a78bfa" },
  { name: "Facility Reports", status: "24/24", color: "#94a3b8" },
];

const URGENCY: Record<string, { label: string; color: string }> = {
  now: { label: "Act now", color: "var(--risk-high)" },
  soon: { label: "Act soon", color: "var(--risk-watch)" },
  routine: { label: "Routine", color: "var(--risk-low)" },
};

function isoWeekToDate(s: string): Date | null {
  const m = s.match(/(\d{4})-W(\d{1,2})/i);
  if (!m) return null;
  const year = +m[1];
  const week = +m[2];
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay();
  if (dow <= 4) simple.setUTCDate(simple.getUTCDate() - dow + 1);
  else simple.setUTCDate(simple.getUTCDate() + 8 - dow);
  return simple;
}
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

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

export function Dashboard({
  districts,
  mapDistricts,
  mapCenter,
}: {
  districts: DashboardDistrict[];
  mapDistricts: District[];
  mapCenter: [number, number];
}) {
  const weeksAll = districts[0]?.series.weeks ?? [];
  const lastD = weeksAll.length ? isoWeekToDate(weeksAll[weeksAll.length - 1]) : new Date();
  const defaultTo = fmtDate(lastD ?? new Date());
  const defaultFrom = fmtDate(new Date((lastD ?? new Date()).getTime() - 26 * 7 * 86400000));

  const [selected, setSelected] = useState(districts[0]?.name ?? "");
  const [source, setSource] = useState("all");
  const [sector, setSector] = useState("all");
  const [weeks, setWeeks] = useState("4");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [channel, setChannel] = useState<"sms" | "email">("sms");

  const [uploadPhase, setUploadPhase] = useState<"none" | "scanning" | "done">("none");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSummary, setFileSummary] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadResult = useRef<Promise<Response> | null>(null);

  const d = districts.find((x) => x.name === selected) ?? districts[0];
  if (!d) return null;

  const noForecast = weeks === "0";
  const horizon = noForecast ? 0 : Math.min(Number(weeks), d.series.forecast.length) || Number(weeks);
  const fcSlice = noForecast ? [] : d.series.forecast.slice(0, horizon);
  const fcWeeksSlice = noForecast ? [] : d.series.forecast_weeks.slice(0, horizon);
  const near = fcSlice.length ? fcSlice[fcSlice.length - 1] : d.casesLatest;
  const delta = noForecast || !d.casesLatest ? 0 : Math.round(((near - d.casesLatest) / d.casesLatest) * 100);
  const rise = delta >= 0;
  const crosses = noForecast
    ? d.casesLatest >= d.threshold
    : Math.max(...fcSlice, d.casesLatest) >= d.threshold;

  // observed series filtered by the chosen date range
  const fromT = new Date(fromDate).getTime();
  const toT = new Date(toDate).getTime() + 86_400_000;
  const obs = { weeks: [] as string[], actual: [] as number[], baseline: [] as number[] };
  d.series.weeks.forEach((w, i) => {
    const dt = isoWeekToDate(w);
    if (dt && dt.getTime() >= fromT && dt.getTime() <= toT) {
      obs.weeks.push(w);
      obs.actual.push(d.series.actual[i]);
      obs.baseline.push(d.series.baseline[i]);
    }
  });
  const useFiltered = obs.weeks.length >= 3;
  const chartWeeks = useFiltered ? obs.weeks : d.series.weeks;
  const chartActual = useFiltered ? obs.actual : d.series.actual;

  // sector view: scale the district series by the sector's share of current cases
  const activeSector = sector === "all" ? null : d.sectors.find((s) => s.name === sector) ?? null;
  const ratio = activeSector ? activeSector.share : 1;
  const dispActual = ratio === 1 ? chartActual : chartActual.map((v) => Math.round(v * ratio));
  const dispForecast = ratio === 1 ? fcSlice : fcSlice.map((v) => Math.round(v * ratio));
  const dispThreshold = Math.max(1, Math.round(d.threshold * ratio));

  function chooseFile() {
    fileRef.current?.click();
  }

  function handleUpload(file: File) {
    setFileName(file.name);
    setFileSummary(null);
    const fd = new FormData();
    fd.append("file", file);
    uploadResult.current = fetch("/api/upload", { method: "POST", body: fd });
    setUploadPhase("scanning");
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleUpload(f);
  }

  async function finishUpload() {
    try {
      const res = await uploadResult.current!;
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      const summary =
        data.kind === "dataset"
          ? `${data.rowCount} rows validated`
          : data.kind === "document"
            ? "document read for review"
            : "file staged for import";
      setFileSummary(summary);
      toast.success(`${fileName} — ${summary}`);
    } catch (err) {
      setFileSummary("validation failed");
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
    setUploadPhase("done");
  }

  return (
    <div className="space-y-4">
      {/* AI engine header */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/50 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold">AI early-warning engine</p>
            <p className="text-xs text-muted-foreground">
              Predicts malaria outbreak risk weeks ahead — in plain language.
            </p>
          </div>
        </div>
        <HowItWorks />
      </div>

      {/* active data pipelines */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/40 px-3 py-2.5 text-xs">
        <span className="font-semibold text-muted-foreground">Active Pipelines:</span>
        {PIPELINES.map((p) => (
          <span
            key={p.name}
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1"
            style={{ borderColor: p.color + "55", background: p.color + "14" }}
          >
            <span className="h-1.5 w-1.5 rounded-full animate-pulse-dot" style={{ background: p.color }} />
            <span className="font-semibold" style={{ color: p.color }}>
              {p.name}
            </span>
            <span className="text-muted-foreground">({p.status})</span>
          </span>
        ))}
      </div>

      {/* control bar */}
      <Card>
        <CardContent className="space-y-4 p-4">
          {/* primary: district + advanced toggle */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                District
              </label>
              <Select
                value={selected}
                onValueChange={(v) => {
                  setSelected(v);
                  setSector("all");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {districts.map((x) => (
                    <SelectItem key={x.name} value={x.name}>
                      {x.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAdvanced((v) => !v)}
              className="sm:w-auto"
            >
              <SlidersHorizontal className="h-4 w-4" />
              {showAdvanced ? "Hide options" : "Advanced options"}
            </Button>
          </div>

          {showAdvanced && (
            <div className="grid animate-rise gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Data source
                </label>
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCES.map((s) => (
                      <SelectItem key={s.v} value={s.v}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  From date
                </label>
                <Input type="date" value={fromDate} max={toDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  To date
                </label>
                <Input type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Predict ahead (optional)
                </label>
                <Select value={weeks} onValueChange={setWeeks}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEK_OPTIONS.map((w) => (
                      <SelectItem key={w.v} value={w.v}>
                        {w.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* big button */}
          <Button
            onClick={() => setPhase("running")}
            disabled={phase === "running"}
            className="h-12 w-full text-base font-bold"
          >
            <Play className="h-5 w-5" /> Forecast Outbreak Risk
          </Button>
        </CardContent>
      </Card>

      {/* forecast scan */}
      {phase === "running" && (
        <ScanProgress
          title={`Analysing ${d.name} — running the AI model`}
          steps={FORECAST_STEPS}
          durationMs={5200}
          onComplete={() => setPhase("done")}
        />
      )}

      {/* upload scan before first forecast */}
      {phase === "idle" && uploadPhase === "scanning" && (
        <ScanProgress
          title={`Scanning uploaded data — ${fileName ?? "file"}`}
          steps={UPLOAD_STEPS}
          durationMs={4600}
          onComplete={finishUpload}
        />
      )}

      {/* empty state + upload (compact) */}
      {phase === "idle" && uploadPhase !== "scanning" && (
        <Card className="border-dashed">
          <CardContent className="p-4 sm:p-5">
            <input ref={fileRef} type="file" className="hidden" onChange={onInputChange} />

            <button
              type="button"
              onClick={chooseFile}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleUpload(f);
              }}
              className={cn(
                "group flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 text-center transition-all",
                dragOver
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/50 hover:bg-primary/[0.03]",
              )}
            >
              <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-primary ring-4 ring-primary/5 transition-transform group-hover:scale-105">
                <UploadCloud className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold">
                Upload the latest malaria data — drop a file or click to browse
              </p>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {["CSV", "Excel", "JSON", "GeoJSON", "Parquet", "ZIP", "PDF", "JPG/PNG"].map((f) => (
                  <span
                    key={f}
                    className="rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {f}
                  </span>
                ))}
                <span className="text-[11px] text-muted-foreground/70">· up to 25 MB</span>
              </div>
            </button>

            {uploadPhase === "done" && fileSummary && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-[color:var(--risk-low)]/40 bg-[color:var(--risk-low-soft)] p-2.5 text-sm">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[color:var(--risk-low)]" />
                <span>
                  <span className="font-medium">{fileName}</span> — {fileSummary}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* results */}
      {phase === "done" && (
        <div key={`${d.name}-${source}-${weeks}-${fromDate}-${toDate}`} className="animate-rise space-y-5">
          <div className="grid gap-5 lg:grid-cols-3">
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
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Latest week
                    </p>
                    <p className="mt-0.5 font-semibold">{nf(d.casesLatest)}</p>
                  </div>
                  <div className="rounded-lg bg-muted/60 p-2.5">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {noForecast ? "Forecast" : `${weeks}-wk forecast`}
                    </p>
                    {noForecast ? (
                      <p className="mt-0.5 font-semibold text-muted-foreground">Observed only</p>
                    ) : (
                      <p className="mt-0.5 flex items-center gap-1 font-semibold">
                        {nf(near)}
                        <span
                          className="flex items-center text-xs"
                          style={{ color: rise ? RISK_META[d.risk].color : "var(--risk-low)" }}
                        >
                          {rise ? (
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowDownRight className="h-3.5 w-3.5" />
                          )}
                          {rise ? "+" : ""}
                          {delta}%
                        </span>
                      </p>
                    )}
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Outbreak threshold ≈ {nf(d.threshold)} cases/wk ·{" "}
                  {crosses ? (
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
                  height={280}
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-0">
              <CardTitle className="text-base">
                {activeSector ? `${d.name} · ${activeSector.name} sector` : d.name}
                {noForecast ? " — recorded weekly cases" : ` — observed vs AI forecast (${horizon} wks)`}
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
                weeks={chartWeeks}
                actual={dispActual}
                forecastWeeks={fcWeeksSlice}
                forecast={dispForecast}
                threshold={dispThreshold}
                historyWindow={520}
                height={280}
              />
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-5" style={{ background: "#38bdf8" }} /> Observed
                </span>
                {!noForecast && (
                  <span className="flex items-center gap-1.5">
                    <span className="h-0.5 w-5" style={{ background: "#f5b301" }} /> AI forecast
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-5" style={{ background: "#ef4444" }} /> Epidemic risk
                  threshold
                </span>
                {activeSector && (
                  <span className="text-muted-foreground/70">· sector view (scaled from district)</span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* AI validation */}
          {!noForecast && (
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-primary" /> AI forecast validation
              </CardTitle>
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                style={{
                  background: CONF_COLOR[d.validation.confidence] + "22",
                  color: CONF_COLOR[d.validation.confidence],
                }}
              >
                {d.validation.confidence} confidence
              </span>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {d.validation.checks.map((c) => (
                  <div key={c.label} className="flex items-start gap-2.5">
                    {c.ok ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--risk-low)]" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--risk-watch)]" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{c.label}</p>
                      <p className="text-xs text-muted-foreground">{c.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                The model validates its own {weeks}-week forecast against reporting completeness,
                history depth, climate corroboration and test positivity before you act.
              </p>
            </CardContent>
          </Card>
          )}

          <DistrictDrilldown district={d.name} />

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldQuestion className="h-4 w-4 text-primary" />
                  AI recommendation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  className="rounded-lg p-3"
                  style={{ background: RISK_META[d.risk].soft, color: RISK_META[d.risk].color }}
                >
                  <p className="text-sm font-semibold">{d.consequence.headline}</p>
                  <p className="mt-1 text-xs leading-relaxed text-foreground/80">
                    {d.consequence.text}
                  </p>
                </div>
                <ul className="space-y-3">
                  {d.recommendations.map((r) => (
                    <li key={r.action} className="flex items-start gap-3">
                      <span
                        className="mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          background: URGENCY[r.urgency].color + "22",
                          color: URGENCY[r.urgency].color,
                        }}
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
                    <a
                      href={`/report?district=${encodeURIComponent(d.name)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <FileDown className="h-4 w-4" /> Export PDF
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
