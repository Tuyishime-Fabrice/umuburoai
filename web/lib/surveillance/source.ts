import "server-only";
import { postApiJson } from "@/lib/api";
import type { Session } from "@/lib/auth";
import { activeInputs, todayKigali } from "@/lib/store";
import { analyze, combine, type Combined } from "./pipeline";
import type { Analytics, DatasetInput, ScopeOption } from "./types";

export interface ScopedAnalytics {
  analytics: Analytics;
  /** Where the numbers were calculated: the analytics service or this server. */
  computedBy: "api" | "local";
  /** Scopes this user may pick from (district users are limited to their district). */
  allowedScopes: ScopeOption[];
}

let cache: { key: string; combined: Combined } | null = null;

function localCombined(inputs: DatasetInput[]): Combined {
  const key = inputs.map((d) => `${d.id}:${d.csv.length}`).join("|");
  if (!cache || cache.key !== key) cache = { key, combined: combine(inputs) };
  return cache.combined;
}

/** The scope a user is allowed to see for a requested scope id. */
export function permittedScope(session: Session, requested: string | string[] | undefined): string {
  const want = (Array.isArray(requested) ? requested[0] : requested) ?? "national";
  return session.role === "national" ? want : `district:${session.district ?? ""}`;
}

/**
 * Analytics over all active imported datasets for the requested scope, limited to
 * what the user's role allows. Uses the analytics API when API_URL is set and
 * reachable; otherwise runs the identical pipeline on this server.
 */
export async function getScopedAnalytics(
  session: Session,
  requested: string | string[] | undefined,
): Promise<ScopedAnalytics> {
  const scope = permittedScope(session, requested);
  const inputs = activeInputs();
  const today = todayKigali();

  let computedBy: ScopedAnalytics["computedBy"] = "api";
  let analytics = await postApiJson<Analytics>("/api/analyze", { datasets: inputs, scope, today });
  if (!analytics) {
    computedBy = "local";
    analytics = analyze(localCombined(inputs), scope, today);
  }

  const allowedScopes =
    session.role === "national"
      ? analytics.scopeOptions
      : analytics.scopeOptions.filter(
          (o) => o.level === "district" && o.label.toLowerCase() === (session.district ?? "").toLowerCase(),
        );

  // A district user must never receive another scope's figures.
  if (session.role !== "national" && analytics.scope.label.toLowerCase() !== (session.district ?? "").toLowerCase()) {
    throw new Error(`${session.district ?? "Your district"} is not a recognised district.`);
  }
  return { analytics, computedBy, allowedScopes };
}
