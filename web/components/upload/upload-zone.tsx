"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  FileUp,
  Loader2,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScanProgress } from "@/components/scan-progress";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type {
  BinaryReport,
  DatasetReport,
  DocumentField,
  DocumentReport,
  Issue,
  UploadReport,
} from "@/lib/upload";

const ACCEPT = ".csv,.tsv,.json,.geojson,.xlsx,.xls,.parquet,.zip,.pdf,.jpg,.jpeg,.png,.webp";
const STAGES = ["Upload", "Validate", "Preview", "Import", "Process"] as const;
type Stage = "select" | "validating" | "review" | "importing" | "done";

const SCAN_STEPS = [
  "Reading the file",
  "Detecting format & columns",
  "Parsing rows",
  "Checking missing values & duplicates",
  "Validating dates & locations",
  "Verifying data types",
  "Finalising validation report",
];

const stageIndex: Record<Stage, number> = {
  select: 0,
  validating: 1,
  review: 2,
  importing: 3,
  done: 4,
};

function IssueRow({ issue }: { issue: Issue }) {
  const Icon = issue.level === "ok" ? CheckCircle2 : issue.level === "warn" ? AlertTriangle : XCircle;
  const color =
    issue.level === "ok"
      ? "var(--risk-low)"
      : issue.level === "warn"
        ? "var(--risk-watch)"
        : "var(--risk-high)";
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
  const [stage, setStage] = useState<Stage>("select");
  const [dragOver, setDragOver] = useState(false);
  const [report, setReport] = useState<UploadReport | null>(null);
  const [fields, setFields] = useState<DocumentField[]>([]);
  const [fileName, setFileName] = useState("");
  const resultRef = useRef<Promise<Response> | null>(null);

  function handleFile(file: File) {
    setReport(null);
    setFileName(file.name);
    const fd = new FormData();
    fd.append("file", file);
    resultRef.current = fetch("/api/upload", { method: "POST", body: fd });
    setStage("validating");
  }

  async function finishScan() {
    try {
      const res = await resultRef.current!;
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Validation failed");
      setReport(data as UploadReport);
      if (data.kind === "document") setFields((data as DocumentReport).fields);
      setStage("review");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
      setStage("select");
    }
  }

  async function doImport() {
    setStage("importing");
    await new Promise((r) => setTimeout(r, 1200));
    setStage("done");
    toast.success(
      report?.kind === "document"
        ? "Confirmed and saved to the surveillance store."
        : "Imported and queued for processing.",
    );
  }

  function reset() {
    setStage("select");
    setReport(null);
    setFields([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  const currentStep = stageIndex[stage];

  return (
    <div className="space-y-5">
      {/* stepper */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {STAGES.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap",
                i < currentStep && "bg-[color:var(--risk-low-soft)] text-[color:var(--risk-low)]",
                i === currentStep && "bg-primary/15 text-primary",
                i > currentStep && "bg-muted text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "grid h-5 w-5 place-items-center rounded-full text-[11px]",
                  i <= currentStep ? "bg-current/20" : "bg-transparent",
                )}
              >
                {i < currentStep ? "✓" : i + 1}
              </span>
              {s}
            </div>
            {i < STAGES.length - 1 && <span className="h-px w-4 bg-border" />}
          </div>
        ))}
      </div>

      {/* dropzone */}
      {stage === "select" && (
        <Card>
          <CardContent className="p-0">
            <button
              type="button"
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
                dragOver
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/50 hover:bg-primary/[0.03]",
              )}
            >
              <div className="grid h-14 w-14 place-items-center rounded-full bg-primary/15 text-primary ring-4 ring-primary/5 transition-transform group-hover:scale-105">
                <UploadCloud className="h-7 w-7" />
              </div>
              <p className="text-base font-semibold">Drop a file here, or click to browse</p>
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
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </CardContent>
        </Card>
      )}

      {stage === "validating" && (
        <ScanProgress
          title={`Scanning ${fileName || "file"} — validating contents`}
          steps={SCAN_STEPS}
          durationMs={4800}
          onComplete={finishScan}
        />
      )}

      {(stage === "review" || stage === "importing" || stage === "done") && report && (
        <ReportView
          report={report}
          fields={fields}
          setFields={setFields}
          stage={stage}
          onImport={doImport}
          onReset={reset}
        />
      )}
    </div>
  );
}

function ReportView({
  report,
  fields,
  setFields,
  stage,
  onImport,
  onReset,
}: {
  report: UploadReport;
  fields: DocumentField[];
  setFields: (f: DocumentField[]) => void;
  stage: Stage;
  onImport: () => void;
  onReset: () => void;
}) {
  const done = stage === "done";
  const importing = stage === "importing";

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileCheck2 className="h-4 w-4 text-primary" />
            {report.fileName} · {report.format}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onReset}>
            <FileUp className="h-4 w-4" /> New file
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          {report.kind === "dataset" && <DatasetView r={report} />}
          {report.kind === "binary" && <BinaryView r={report} />}
          {report.kind === "document" && (
            <DocumentView r={report} fields={fields} setFields={setFields} disabled={done} />
          )}
        </CardContent>
      </Card>

      {done ? (
        <div className="flex items-center gap-3 rounded-xl border border-[color:var(--risk-low)]/40 bg-[color:var(--risk-low-soft)] p-4">
          <CheckCircle2 className="h-5 w-5 text-[color:var(--risk-low)]" />
          <div className="text-sm">
            <p className="font-semibold">
              {report.kind === "document" ? "Confirmed and saved." : "Imported successfully."}
            </p>
            <p className="text-muted-foreground">
              The record is staged for the next model run. This is a prototype store — no live data
              was written.
            </p>
          </div>
          <Button variant="outline" size="sm" className="ml-auto" onClick={onReset}>
            Upload another
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <ImportButton report={report} importing={importing} onImport={onImport} />
        </div>
      )}
    </div>
  );
}

function ImportButton({
  report,
  importing,
  onImport,
}: {
  report: UploadReport;
  importing: boolean;
  onImport: () => void;
}) {
  const blocked = report.kind === "dataset" && report.issues.some((i) => i.level === "error");
  if (blocked) {
    return (
      <div className="flex items-center gap-2 text-sm text-[color:var(--risk-high)]">
        <XCircle className="h-4 w-4" /> Resolve the errors above before importing.
      </div>
    );
  }
  return (
    <Button size="lg" onClick={onImport} disabled={importing}>
      {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
      {report.kind === "document" ? "Confirm & Import" : "Import & Process"}
    </Button>
  );
}

function DatasetView({ r }: { r: DatasetReport }) {
  const cols = r.columns.slice(0, 8);
  return (
    <>
      <div className="flex flex-wrap gap-4 text-sm">
        <span className="text-muted-foreground">
          Rows: <span className="font-semibold text-foreground">{r.rowCount}</span>
        </span>
        <span className="text-muted-foreground">
          Columns: <span className="font-semibold text-foreground">{r.columns.length}</span>
        </span>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Automatic validation
        </p>
        <ul className="space-y-2">
          {r.issues.map((i) => (
            <IssueRow key={i.label} issue={i} />
          ))}
        </ul>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Preview
        </p>
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
    </>
  );
}

function BinaryView({ r }: { r: BinaryReport }) {
  return (
    <>
      <p className="text-sm text-muted-foreground">{r.note}</p>
      <ul className="space-y-2">
        {r.issues.map((i) => (
          <IssueRow key={i.label} issue={i} />
        ))}
      </ul>
    </>
  );
}

function DocumentView({
  r,
  fields,
  setFields,
  disabled,
}: {
  r: DocumentReport;
  fields: DocumentField[];
  setFields: (f: DocumentField[]) => void;
  disabled: boolean;
}) {
  return (
    <>
      <div className="flex items-start gap-3 rounded-lg border border-[color:var(--risk-watch)]/40 bg-[color:var(--risk-watch-soft)] p-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--risk-watch)]" />
        <p className="text-xs text-muted-foreground">{r.note}</p>
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Extracted fields — review &amp; correct before saving
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f, idx) => (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={f.key} className="flex items-center justify-between">
              <span>{f.label}</span>
              <span
                className="text-[11px] font-normal"
                style={{
                  color: f.confidence >= 0.8 ? "var(--risk-low)" : "var(--risk-watch)",
                }}
              >
                {Math.round(f.confidence * 100)}% conf.
              </span>
            </Label>
            <Input
              id={f.key}
              value={f.value}
              disabled={disabled}
              onChange={(e) => {
                const next = [...fields];
                next[idx] = { ...f, value: e.target.value };
                setFields(next);
              }}
            />
          </div>
        ))}
      </div>
    </>
  );
}
