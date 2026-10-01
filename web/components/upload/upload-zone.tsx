"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileCheck2, Info, Loader2, UploadCloud, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/surveillance/display";
import type { DatasetReport, Issue, UploadReport } from "@/lib/upload";
import { cn } from "@/lib/utils";

function IssueRow({ issue }: { issue: Issue }) {
  const Icon = issue.level === "ok" ? CheckCircle2 : issue.level === "warn" ? AlertTriangle : XCircle;
  const color =
    issue.level === "ok" ? "var(--risk-low)" : issue.level === "warn" ? "var(--risk-watch)" : "var(--risk-high)";
  return (
    <li className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} />
      <div className="text-sm">
        <span className="font-medium">{issue.label}</span>
        <span className="text-muted-foreground"> — {issue.detail}</span>
      </div>
    </li>
  );
}

export function UploadZone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [report, setReport] = useState<UploadReport | null>(null);

  async function handleFile(file: File) {
    setReport(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Validation failed");
      setReport(data as UploadReport);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Validation failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="p-0">
          <button
            type="button"
            disabled={busy}
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
              if (f) handleFile(f);
            }}
            className={cn(
              "group flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-7 text-center transition-all",
              dragOver ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 hover:bg-primary/[0.03]",
            )}
          >
            <div className="grid h-14 w-14 place-items-center rounded-full bg-primary/15 text-primary ring-4 ring-primary/5">
              {busy ? <Loader2 className="h-7 w-7 animate-spin" /> : <UploadCloud className="h-7 w-7" />}
            </div>
            <p className="text-base font-semibold">
              {busy ? "Validating…" : "Drop a surveillance CSV here, or click to browse"}
            </p>
            <p className="text-xs text-muted-foreground">CSV only · up to 25 MB · nothing is stored</p>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </CardContent>
      </Card>

      {report && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileCheck2 className="h-4 w-4 text-primary" />
              {report.fileName} · {report.format}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {report.kind === "dataset" ? (
              <DatasetView r={report} />
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{report.note}</p>
                <ul className="space-y-2">
                  {report.issues.map((i) => (
                    <IssueRow key={i.label} issue={i} />
                  ))}
                </ul>
              </>
            )}
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              Validation only. The file was not stored and does not change the dashboard. To use a new dataset,
              replace the surveillance CSV on the server; every figure is recalculated from it.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DatasetView({ r }: { r: DatasetReport }) {
  const cols = r.columns.slice(0, 8);
  const errors = r.issues.filter((i) => i.level === "error").length;
  const warnings = r.issues.filter((i) => i.level === "warn").length;
  return (
    <>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
        <span>
          Rows: <span className="font-semibold text-foreground">{r.rowCount}</span> ({r.cleaning.rowsKept} usable)
        </span>
        <span>
          Columns: <span className="font-semibold text-foreground">{r.columns.length}</span>
        </span>
        <span>
          Districts: <span className="font-semibold text-foreground">{r.districts.join(", ") || "—"}</span>
        </span>
        <span>
          Period:{" "}
          <span className="font-semibold text-foreground">
            {fmtDate(r.period.start)} – {fmtDate(r.period.end)}
          </span>
        </span>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Surveillance-format validation · {errors} error(s), {warnings} warning(s)
        </p>
        <ul className="space-y-2">
          {r.issues.map((i) => (
            <IssueRow key={i.label} issue={i} />
          ))}
        </ul>
      </div>

      {r.preview.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            First rows (first {cols.length} columns)
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {cols.map((c) => (
                    <TableHead key={c}>{c}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.preview.map((row, i) => (
                  <TableRow key={i}>
                    {cols.map((c) => (
                      <TableCell key={c} className="whitespace-nowrap text-muted-foreground">
                        {row[c]}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </>
  );
}
