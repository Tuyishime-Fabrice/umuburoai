// Presentation helpers for surveillance analytics (safe for client components).
import type { SignalLevel, WeekPoint } from "./types";

export const LEVEL_META: Record<
  SignalLevel,
  { label: string; short: string; color: string; soft: string; description: string }
> = {
  ELEVATED: {
    label: "Elevated signal",
    short: "Elevated",
    color: "var(--risk-high)",
    soft: "var(--risk-high-soft)",
    description: "A case-based rule fired together with at least one other rule. Requires verification.",
  },
  WATCH: {
    label: "Watch",
    short: "Watch",
    color: "var(--risk-watch)",
    soft: "var(--risk-watch-soft)",
    description: "One case-based rule fired. Increased surveillance attention; requires verification.",
  },
  NONE: {
    label: "No signal",
    short: "No signal",
    color: "var(--risk-low)",
    soft: "var(--risk-low-soft)",
    description: "No case-based rule fired this week.",
  },
  INSUFFICIENT: {
    label: "Insufficient history",
    short: "Insufficient",
    color: "var(--muted-foreground)",
    soft: "var(--muted)",
    description: "Fewer than 4 earlier weeks, so there is no baseline to compare against.",
  },
};

/** Hex versions for charts (CSS variables don't work inside SVG attributes everywhere). */
export const LEVEL_HEX: Record<SignalLevel, string> = {
  ELEVATED: "#ef4444",
  WATCH: "#f59e0b",
  NONE: "#22c55e",
  INSUFFICIENT: "#64748b",
};

/** Number formatting that shows missing values as an em dash instead of hiding them. */
export function fmt(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(n);
}

export function signed(n: number | null | undefined, digits = 0, suffix = ""): string {
  if (n === null || n === undefined) return "—";
  return `${n > 0 ? "+" : ""}${fmt(n, digits)}${suffix}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-28" → "28 Sep 2026" (no time-zone shifts). */
export function fmtDate(iso: string | null | undefined, withYear = true): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ""}`;
}

export function scopeName(scope: string): string {
  return scope === "All" ? "All districts" : scope;
}

/** Plain rows for charts: week, epi week, signal level and the requested fields. */
export function chartRows<K extends keyof WeekPoint>(
  points: WeekPoint[],
  keys: K[],
): Record<string, string | number | null>[] {
  return points.map((p) => {
    const row: Record<string, string | number | null> = {
      week_start: p.week_start,
      epi_week: p.epi_week,
      level: p.signal.level,
    };
    for (const k of keys) row[k as string] = p[k] as number | null;
    return row;
  });
}
