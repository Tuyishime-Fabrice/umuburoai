import "server-only";
import fs from "node:fs";
import path from "node:path";
import { analyze, validateAndClean, type CleanResult } from "./pipeline";
import type { Analytics } from "./types";

export const DATASET_FILE = "rwanda_malaria_surveillance_testing_data.csv";

// The CSV lives once, in backend/data/, so the API and the web app read the same file.
// The web Docker image copies it to ./data/. SURVEILLANCE_CSV overrides both.
function candidates(): string[] {
  const env = process.env.SURVEILLANCE_CSV?.trim();
  return [
    ...(env ? [path.resolve(env)] : []),
    path.join(process.cwd(), "..", "backend", "data", DATASET_FILE),
    path.join(process.cwd(), "data", DATASET_FILE),
  ];
}

export function datasetPath(): string {
  const found = candidates().find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(
      `Surveillance dataset not found. Looked in: ${candidates().join(", ")}. Set SURVEILLANCE_CSV to its path.`,
    );
  }
  return found;
}

let cache: { file: string; mtimeMs: number; size: number; clean: CleanResult } | null = null;

/** Validated + cleaned records, re-read whenever the file changes on disk. */
export function loadDataset(): { clean: CleanResult; file: string } {
  const file = datasetPath();
  const st = fs.statSync(file);
  if (!cache || cache.file !== file || cache.mtimeMs !== st.mtimeMs || cache.size !== st.size) {
    cache = { file, mtimeMs: st.mtimeMs, size: st.size, clean: validateAndClean(fs.readFileSync(file, "utf-8")) };
  }
  return { clean: cache.clean, file };
}

export function localAnalytics(scope: string): Analytics {
  const { clean, file } = loadDataset();
  return analyze(clean, scope, path.basename(file));
}
