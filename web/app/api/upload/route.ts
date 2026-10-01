import { callApi, local } from "@/lib/api";
import { validateUpload } from "@/lib/upload";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return local({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > 25 * 1024 * 1024) {
      return local({ error: "File exceeds 25 MB demo limit" }, { status: 413 });
    }
    const fd = new FormData();
    fd.append("file", file, file.name);
    const remote = await callApi("/api/upload", { method: "POST", body: fd });
    if (remote) return remote;
    const report = await validateUpload(file);
    return local(report);
  } catch (err) {
    return local(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 400 },
    );
  }
}
