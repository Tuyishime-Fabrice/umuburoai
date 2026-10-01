import { NextResponse } from "next/server";
import { runForecast } from "@/lib/forecast";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const district = String(body.district ?? "");
    const weeks = Number(body.weeks ?? 3);
    if (!district) {
      return NextResponse.json({ error: "district is required" }, { status: 400 });
    }
    const result = runForecast(district, weeks);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "forecast failed" },
      { status: 400 },
    );
  }
}
