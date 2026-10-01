import { NextResponse } from "next/server";
import { getSession } from "@/lib/session.server";
import { ImportError, removeDataset } from "@/lib/store";

export const runtime = "nodejs";

/** Remove a dataset from the analytics (kept on record for audit). National users only. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (session.role !== "national")
    return NextResponse.json({ error: "Only national users can remove datasets." }, { status: 403 });
  const { id } = await params;
  try {
    return NextResponse.json(await removeDataset(id, session));
  } catch (err) {
    const status = err instanceof ImportError ? 404 : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Removal failed" }, { status });
  }
}
