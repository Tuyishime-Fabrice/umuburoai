import { NextResponse } from "next/server";
import { getSession } from "@/lib/session.server";
import { ImportError, importDataset, listDatasets } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const own = session.role === "national" ? null : (session.district ?? "");
  return NextResponse.json(
    listDatasets()
      .filter((d) => !own || d.districts.includes(own))
      .map((d) => (own ? { ...d, districts: [own] } : d)),
  );
}

/** Import a validated CSV into the dataset store; analytics update immediately. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (!file.name.toLowerCase().endsWith(".csv"))
      return NextResponse.json({ error: "Only CSV files can be imported." }, { status: 400 });
    if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "File exceeds 25 MB" }, { status: 413 });
    const csv = new TextDecoder("utf-8").decode(await file.arrayBuffer());
    const rec = await importDataset(file.name, csv, session);
    return NextResponse.json(rec, { status: 201 });
  } catch (err) {
    if (err instanceof ImportError) return NextResponse.json({ error: err.message }, { status: 422 });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Import failed" }, { status: 500 });
  }
}
