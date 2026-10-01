import { NextResponse } from "next/server";
import { getDistrictHierarchy } from "@/lib/data";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const district = searchParams.get("district") ?? "";
  if (!district) {
    return NextResponse.json({ error: "district is required" }, { status: 400 });
  }
  return NextResponse.json(getDistrictHierarchy(district));
}
