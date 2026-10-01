import { callApi, local } from "@/lib/api";
import { getSession } from "@/lib/session.server";
import { validateUpload } from "@/lib/upload";

export const runtime = "nodejs";

/** Validate a file before import (nothing is stored). */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return local({ error: "Sign in required" }, { status: 401 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return local({ error: "No file provided" }, { status: 400 });
    if (file.size > 25 * 1024 * 1024) return local({ error: "File exceeds 25 MB" }, { status: 413 });
    const restrict = session.role === "national" ? null : (session.district ?? "");
    const fd = new FormData();
    fd.append("file", file, file.name);
    if (restrict !== null) fd.append("restrict_district", restrict);
    const remote = await callApi("/api/validate", { method: "POST", body: fd });
    if (remote) return remote;
    return local(await validateUpload(file, restrict));
  } catch (err) {
    return local({ error: err instanceof Error ? err.message : "Validation failed" }, { status: 400 });
  }
}
