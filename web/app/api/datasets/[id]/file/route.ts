import { getSession } from "@/lib/session.server";
import { listDatasets, readDatasetCsv } from "@/lib/store";
import { canonicalDistrict, parseCsv } from "@/lib/surveillance/pipeline";

export const runtime = "nodejs";

/** Download an imported file unchanged. District users get only their district's lines. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Sign in required", { status: 401 });
  const { id } = await params;
  const rec = listDatasets().find((d) => d.id === id);
  const csv = rec ? readDatasetCsv(id) : null;
  if (!rec || csv === null) return new Response("Not found", { status: 404 });

  let body = csv;
  let name = rec.name;
  if (session.role !== "national") {
    const district = canonicalDistrict(session.district ?? "");
    const lines = csv.split(/\r?\n/);
    const col = (parseCsv(lines[0] ?? "")[0] ?? []).map((h) => h.trim()).indexOf("district");
    const kept = lines
      .slice(1)
      .filter((l) => l.trim() && col >= 0 && canonicalDistrict(parseCsv(l)[0]?.[col] ?? "") === district);
    body = [lines[0], ...kept].join("\n") + "\n";
    name = name.replace(/\.csv$/i, `_${(district ?? "none").toLowerCase()}.csv`);
  }
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name.replace(/"/g, "")}"`,
    },
  });
}
