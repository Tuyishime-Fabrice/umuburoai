import fs from "node:fs";
import { DATASET_FILE, datasetPath } from "@/lib/surveillance/load";
import { parseCsv } from "@/lib/surveillance/pipeline";
import { getSession } from "@/lib/session.server";

export const runtime = "nodejs";

/**
 * The source CSV, unchanged, so every figure can be traced back to it. District
 * users get only their own district's lines (copied verbatim from the file).
 */
export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Sign in required", { status: 401 });

  let body = fs.readFileSync(datasetPath(), "utf-8");
  let name = DATASET_FILE;
  if (session.role !== "national") {
    const district = (session.district ?? "").toLowerCase();
    const lines = body.split(/\r?\n/);
    const col = (parseCsv(lines[0] ?? "")[0] ?? []).map((h) => h.trim()).indexOf("district");
    const kept = lines
      .slice(1)
      .filter((line) => line.trim() && (parseCsv(line)[0]?.[col] ?? "").trim().toLowerCase() === district);
    body = [lines[0], ...kept].join("\n") + "\n";
    name = DATASET_FILE.replace(/\.csv$/, `_${district || "none"}.csv`);
  }
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
    },
  });
}
