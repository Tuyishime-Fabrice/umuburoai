import "server-only";
import fs from "node:fs";
import path from "node:path";

export const DATASET_FILE = "rwanda_malaria_surveillance_testing_data.csv";

// The initial dataset ships in backend/data/ (shared with the API); the web Docker image
// copies it to ./data/. SURVEILLANCE_CSV overrides both. It is registered as the first
// import in the dataset store (lib/store.ts).
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
      `Initial surveillance dataset not found. Looked in: ${candidates().join(", ")}. Set SURVEILLANCE_CSV to its path.`,
    );
  }
  return found;
}
