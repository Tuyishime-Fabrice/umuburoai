import "server-only";
import { NextResponse } from "next/server";

// Base URL of the Umuburo FastAPI service (e.g. https://umuburo-api-production.up.railway.app).
// When unset (or unreachable), the web app runs the same pipeline itself (lib/surveillance).
const API_URL = process.env.API_URL?.trim().replace(/\/+$/, "") || "";
const TIMEOUT_MS = 10_000;

export const SOURCE_HEADER = "x-umuburo-source";

/**
 * Forward a request to the FastAPI service. Returns a response to send to the
 * browser, or null when the API is not configured or unreachable (network
 * error, timeout, 5xx) so the caller can fall back to local logic.
 */
export async function callApi(path: string, init?: RequestInit): Promise<NextResponse | null> {
  if (!API_URL) return null;
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status >= 500) {
      console.error(`[api] ${path} -> ${res.status}; using local fallback`);
      return null;
    }
    const body = await res.json();
    // FastAPI reports errors as { detail }, the web client expects { error }.
    const payload = res.ok ? body : { error: typeof body?.detail === "string" ? body.detail : "Request failed" };
    return NextResponse.json(payload, { status: res.status, headers: { [SOURCE_HEADER]: "api" } });
  } catch (err) {
    console.error(`[api] ${path} unreachable (${err instanceof Error ? err.message : err}); using local fallback`);
    return null;
  }
}

/** POST JSON to the API for server-side rendering; null if not configured or failing. */
export async function postApiJson<T>(path: string, body: unknown): Promise<T | null> {
  if (!API_URL) return null;
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[api] ${path} -> ${res.status}; using local pipeline`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error(`[api] ${path} unreachable (${err instanceof Error ? err.message : err}); using local pipeline`);
    return null;
  }
}

/** Whether an analytics API is configured and answering. */
export async function apiStatus(): Promise<"not_configured" | "online" | "offline"> {
  if (!API_URL) return "not_configured";
  try {
    const res = await fetch(`${API_URL}/health`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    return res.ok ? "online" : "offline";
  } catch {
    return "offline";
  }
}

export function local(body: unknown, init?: ResponseInit): NextResponse {
  const res = NextResponse.json(body, init);
  res.headers.set(SOURCE_HEADER, "local");
  return res;
}
