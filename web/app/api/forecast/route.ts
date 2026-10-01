import { callApi, local } from "@/lib/api";
import { runForecast } from "@/lib/forecast";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const district = String(body.district ?? "");
    const weeks = Number(body.weeks ?? 3);
    if (!district) {
      return local({ error: "district is required" }, { status: 400 });
    }
    const remote = await callApi("/api/forecast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ district, weeks: Number.isFinite(weeks) ? weeks : 3 }),
    });
    if (remote) return remote;
    const result = runForecast(district, weeks);
    return local(result);
  } catch (err) {
    return local(
      { error: err instanceof Error ? err.message : "forecast failed" },
      { status: 400 },
    );
  }
}
