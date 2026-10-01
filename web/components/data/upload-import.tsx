"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, CheckCircle2, FileSpreadsheet, Loader2, UploadCloud, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/surveillance/display";
import type { UploadReport } from "@/lib/upload";
import { cn } from "@/lib/utils";

type Stage = "select" | "validating" | "review" | "importing" | "imported";

function IssueIcon({ level }: { level: "ok" | "warn" | "error" }) {
  const Icon = level === "ok" ? CheckCircle2 : level === "warn" ? AlertTriangle : XCircle;
  const color = level === "ok" ? "var(--risk-low)" : level === "warn" ? "var(--risk-watch)" : "var(--risk-high)";
  return <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} />;
}

export function UploadImport({ restrictDistrict }: { restrictDistrict: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("select");
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<UploadReport | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [imported, setImported] = useState<{ rows: number; districts: string[] } | null>(null);

  async function validate(f: File) {
    setFile(f);
    setReport(null);
    setStage("validating");
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Validation failed");
      setReport(data as UploadReport);
      setStage("review");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Validation failed");
      setStage("select");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function doImport() {
    if (!file) return;
    setStage("importing");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/datasets", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setImported({ rows: data.rows, districts: data.districts });
      setStage("imported");
      toast.success(`${file.name} imported — analytics updated`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
      setStage("review");
    }
  }

  function reset() {
    setStage("select");
    setFile(null);
    setReport(null);
    setImported(null);
  }

  const dataset = report?.kind === "dataset" ? report : null;
  const errors = dataset ? dataset.summary.validation.filter((v) => v.level === "error").length : 0;
  const warnings = dataset ? dataset.summary.validation.filter((v) => v.level === "warn").length : 0;
  const canImport = !!dataset && dataset.summary.accepted;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Upload surveillance data</CardTitle>
        <p className="text-xs text-muted-foreground">
          Weekly district reports in CSV. Required columns: <code>week_start</code>, <code>district</code>,{" "}
          <code>confirmed_malaria_cases</code>; other surveillance columns are optional.{" "}
          <Link href="/api/datasets/template" prefetch={false} className="text-primary hover:underline">
            Download the template
          </Link>
          .{restrictDistrict ? ` Your account can submit ${restrictDistrict} data only.` : ""}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {(stage === "select" || stage === "validating") && (
          <>
            <button
              type="button"
              disabled={stage === "validating"}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) validate(f);
              }}
              className={cn(
                "group flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-7 text-center transition-all",
                dragOver ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 hover:bg-primary/[0.03]",
              )}
            >
              <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/15 text-primary">
                {stage === "validating" ? <Loader2 className="h-6 w-6 animate-spin" /> : <UploadCloud className="h-6 w-6" />}
              </div>
              <p className="font-semibold">{stage === "validating" ? `Validating ${file?.name}…` : "Drop a CSV file here, or click to browse"}</p>
              <p className="text-xs text-muted-foreground">CSV · up to 25 MB · validated before import</p>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) validate(f);
              }}
            />
          </>
        )}

        {report?.kind === "unsupported" && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg bg-[color:var(--risk-high-soft)] p-3 text-sm">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--risk-high)]" />
              <span>
                <span className="font-medium">{report.fileName}</span> — {report.note}
              </span>
            </div>
            <Button variant="outline" onClick={reset}>
              Choose another file
            </Button>
          </div>
        )}

        {dataset && (stage === "review" || stage === "importing") && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg bg-muted/40 p-3 text-sm">
              <span className="flex items-center gap-2 font-medium">
                <FileSpreadsheet className="h-4 w-4 text-primary" /> {dataset.fileName}
              </span>
              <span className="text-muted-foreground">
                {dataset.summary.cleaning.rowsKept} of {dataset.summary.cleaning.rowsRead} rows usable
              </span>
              <span className="text-muted-foreground">Districts: {dataset.summary.districts.join(", ") || "—"}</span>
              <span className="text-muted-foreground">
                {fmtDate(dataset.summary.period.start)} – {fmtDate(dataset.summary.period.end)}
              </span>
              <span className="text-muted-foreground">
                {errors} error(s), {warnings} warning(s)
              </span>
            </div>
            <ul className="space-y-2">
              {dataset.summary.validation.map((v) => (
                <li key={v.check} className="flex items-start gap-2.5 text-sm">
                  <IssueIcon level={v.level} />
                  <span>
                    <span className="font-medium">{v.check}</span>
                    <span className="text-muted-foreground"> — {v.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            {dataset.preview.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {dataset.summary.columns.slice(0, 8).map((c) => (
                        <TableHead key={c} className="whitespace-nowrap">
                          {c}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dataset.preview.map((row, i) => (
                      <TableRow key={i}>
                        {dataset.summary.columns.slice(0, 8).map((c) => (
                          <TableCell key={c} className="whitespace-nowrap text-xs text-muted-foreground">
                            {row[c]}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" onClick={reset} disabled={stage === "importing"}>
                Cancel
              </Button>
              <Button onClick={doImport} disabled={!canImport || stage === "importing"}>
                {stage === "importing" && <Loader2 className="h-4 w-4 animate-spin" />}
                {canImport ? "Import dataset" : "Cannot import — fix the errors above"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Imported rows replace earlier data for the same district and week. Missing values are left missing.
            </p>
          </div>
        )}

        {stage === "imported" && imported && (
          <div className="flex flex-col gap-3 rounded-lg border border-[color:var(--risk-low)]/40 bg-[color:var(--risk-low-soft)] p-4 sm:flex-row sm:items-center">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-[color:var(--risk-low)]" />
            <div className="text-sm">
              <p className="font-semibold">Imported {imported.rows} records for {imported.districts.join(", ")}.</p>
              <p className="text-muted-foreground">Signals, alerts and analytics have been recalculated.</p>
            </div>
            <div className="flex gap-2 sm:ml-auto">
              <Button asChild size="sm">
                <Link href="/overview">
                  View situation <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="sm" variant="outline" onClick={reset}>
                Upload another
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
