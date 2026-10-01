import "server-only";
import { fetchApiJson } from "@/lib/api";
import type { Session } from "@/lib/auth";
import { localAnalytics } from "./load";
import type { Analytics } from "./types";

export interface ScopedAnalytics {
  analytics: Analytics;
  /** Where the numbers were calculated: the FastAPI service or this server. */
  computedBy: "api" | "local";
  /** Scopes this user may pick from (district users are limited to their district). */
  allowedScopes: string[];
}

/**
 * Analytics for the scope the user asked for, limited to what their role allows.
 * Uses the API when API_URL is set, otherwise (or if it fails) runs the same pipeline here.
 */
export async function getScopedAnalytics(
  session: Session,
  requested: string | string[] | undefined,
): Promise<ScopedAnalytics> {
  const want = (Array.isArray(requested) ? requested[0] : requested) ?? "All";
  const scope = session.role === "national" ? want : (session.district ?? "");

  let computedBy: ScopedAnalytics["computedBy"] = "api";
  let analytics = await fetchApiJson<Analytics>(`/api/analytics?district=${encodeURIComponent(scope)}`);
  if (!analytics) {
    computedBy = "local";
    analytics = localAnalytics(scope);
  }

  const allowedScopes =
    session.role === "national"
      ? analytics.scopes
      : analytics.scopes.filter((s) => s.toLowerCase() === (session.district ?? "").toLowerCase());

  // A district user whose district is not in the dataset must not see other districts.
  if (session.role !== "national" && allowedScopes.length === 0) {
    throw new Error(`No surveillance records for ${session.district ?? "your district"} in the dataset.`);
  }
  return { analytics, computedBy, allowedScopes };
}
