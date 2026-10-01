import { callApi, local } from "@/lib/api";
import { getDistrictHierarchy } from "@/lib/data";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const district = searchParams.get("district") ?? "";
  if (!district) {
    return local({ error: "district is required" }, { status: 400 });
  }
  const remote = await callApi(`/api/hierarchy?district=${encodeURIComponent(district)}`);
  if (remote) return remote;
  return local(getDistrictHierarchy(district));
}
