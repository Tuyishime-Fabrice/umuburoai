import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Session } from "./auth";
import { datasetPath } from "./surveillance/load";
import { validateDataset } from "./surveillance/pipeline";
import type { DatasetInput, DatasetSummary } from "./surveillance/types";

// Persistent store for imported datasets and the verification audit log.
// Location: DATA_DIR (default ./storage). On Railway, mount a volume there so data
// survives redeploys.
const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR?.trim() || path.join(process.cwd(), "storage"));
const DATASET_DIR = path.join(DATA_DIR, "datasets");
const INDEX_FILE = path.join(DATASET_DIR, "index.json");
const REVIEWS_FILE = path.join(DATA_DIR, "reviews.json");

export interface Actor {
  name: string;
  email: string;
  role: string;
  district?: string | null;
}

export interface DatasetRecord {
  id: string;
  name: string;
  uploadedAt: string;
  uploadedBy: Actor;
  sizeBytes: number;
  rows: number;
  districts: string[];
  period: { start: string | null; end: string | null };
  restrictDistrict: string | null;
  status: "active" | "removed";
  removedAt?: string;
  removedBy?: Actor;
}

export type ReviewDecision = "verified" | "under_investigation" | "not_confirmed";

export interface ReviewRecord {
  id: string;
  alertId: string;
  district: string;
  week_start: string;
  decision: ReviewDecision;
  note: string;
  at: string;
  by: Actor;
}

function actor(s: Session): Actor {
  return { name: s.name, email: s.email, role: s.role, district: s.district ?? null };
}

function writeJsonAtomic(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

// Serialise writes within this server process.
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => T): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

/** First run: register the bundled surveillance file as the initial import. */
function ensureSeeded() {
  if (fs.existsSync(INDEX_FILE)) return;
  fs.mkdirSync(DATASET_DIR, { recursive: true });
  const src = datasetPath();
  const csv = fs.readFileSync(src, "utf-8");
  const id = "ds-initial";
  const name = path.basename(src);
  const v = validateDataset({ id, name, csv });
  fs.writeFileSync(path.join(DATASET_DIR, `${id}.csv`), csv);
  const rec: DatasetRecord = {
    id,
    name,
    uploadedAt: new Date(fs.statSync(src).mtimeMs).toISOString(),
    uploadedBy: { name: "Initial data load", email: "", role: "system" },
    sizeBytes: Buffer.byteLength(csv),
    rows: v.summary.cleaning.rowsKept,
    districts: v.summary.districts,
    period: v.summary.period,
    restrictDistrict: null,
    status: "active",
  };
  writeJsonAtomic(INDEX_FILE, [rec]);
}

export function listDatasets(): DatasetRecord[] {
  ensureSeeded();
  return readJson<DatasetRecord[]>(INDEX_FILE, []);
}

export function readDatasetCsv(id: string): string | null {
  if (!/^[a-z0-9-]+$/.test(id)) return null;
  const file = path.join(DATASET_DIR, `${id}.csv`);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : null;
}

/** Active datasets in upload order, ready for the pipeline. */
export function activeInputs(): DatasetInput[] {
  return listDatasets()
    .filter((d) => d.status === "active")
    .sort((a, b) => (a.uploadedAt < b.uploadedAt ? -1 : a.uploadedAt > b.uploadedAt ? 1 : 0))
    .flatMap((d) => {
      const csv = readDatasetCsv(d.id);
      return csv === null ? [] : [{ id: d.id, name: d.name, csv, restrictDistrict: d.restrictDistrict }];
    });
}

export class ImportError extends Error {
  constructor(
    message: string,
    public summary?: Omit<DatasetSummary, "superseded">,
  ) {
    super(message);
  }
}

export async function importDataset(name: string, csv: string, session: Session): Promise<DatasetRecord> {
  return exclusive(() => {
    ensureSeeded();
    const restrict = session.role === "national" ? null : (session.district ?? "");
    const id = `ds-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(4).toString("hex")}`;
    const v = validateDataset({ id, name, csv, restrictDistrict: restrict });
    if (!v.summary.accepted) {
      const errors = v.summary.validation.filter((c) => c.level === "error").map((c) => c.detail);
      throw new ImportError(errors.join(" ") || "The file has no usable rows.", v.summary);
    }
    fs.writeFileSync(path.join(DATASET_DIR, `${id}.csv`), csv);
    const rec: DatasetRecord = {
      id,
      name: path.basename(name).slice(0, 200),
      uploadedAt: new Date().toISOString(),
      uploadedBy: actor(session),
      sizeBytes: Buffer.byteLength(csv),
      rows: v.summary.cleaning.rowsKept,
      districts: v.summary.districts,
      period: v.summary.period,
      restrictDistrict: restrict,
      status: "active",
    };
    writeJsonAtomic(INDEX_FILE, [...readJson<DatasetRecord[]>(INDEX_FILE, []), rec]);
    return rec;
  });
}

export async function removeDataset(id: string, session: Session): Promise<DatasetRecord> {
  return exclusive(() => {
    const all = listDatasets();
    const rec = all.find((d) => d.id === id);
    if (!rec) throw new ImportError("Dataset not found.");
    if (rec.status === "removed") return rec;
    rec.status = "removed";
    rec.removedAt = new Date().toISOString();
    rec.removedBy = actor(session);
    writeJsonAtomic(INDEX_FILE, all);
    return rec;
  });
}

export function listReviews(): ReviewRecord[] {
  return readJson<ReviewRecord[]>(REVIEWS_FILE, []);
}

export async function addReview(
  input: Pick<ReviewRecord, "alertId" | "district" | "week_start" | "decision" | "note">,
  session: Session,
): Promise<ReviewRecord> {
  return exclusive(() => {
    const rec: ReviewRecord = {
      id: crypto.randomUUID(),
      ...input,
      note: input.note.slice(0, 1000),
      at: new Date().toISOString(),
      by: actor(session),
    };
    writeJsonAtomic(REVIEWS_FILE, [...listReviews(), rec]);
    return rec;
  });
}

/** Today's date in Rwanda (UTC+2), used for data freshness. */
export function todayKigali(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kigali" }).format(new Date());
}
