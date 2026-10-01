import { NextResponse } from "next/server";
import { getSession } from "@/lib/session.server";
import { addReview, type ReviewDecision } from "@/lib/store";
import { canonicalDistrict, isValidDate } from "@/lib/surveillance/pipeline";

const DECISIONS: ReviewDecision[] = ["verified", "under_investigation", "not_confirmed"];

/** Record a verification decision on an alert (append-only audit log). */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const district = canonicalDistrict(String(body?.district ?? ""));
  const week = String(body?.week_start ?? "");
  const decision = body?.decision as ReviewDecision;
  if (!district || !isValidDate(week) || !DECISIONS.includes(decision))
    return NextResponse.json({ error: "district, week_start and a valid decision are required" }, { status: 400 });
  if (session.role !== "national" && canonicalDistrict(session.district ?? "") !== district)
    return NextResponse.json({ error: "You can only review alerts for your district." }, { status: 403 });
  const rec = await addReview(
    { alertId: `${district}-${week}`, district, week_start: week, decision, note: String(body?.note ?? "").trim() },
    session,
  );
  return NextResponse.json(rec, { status: 201 });
}
