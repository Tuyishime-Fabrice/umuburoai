"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DISTRICT_SHAPES, RWANDA_VIEWBOX } from "@/lib/geo/rwanda-districts";
import { LEVEL_HEX, fmt, fmtDate } from "@/lib/surveillance/display";
import type { DistrictStatus } from "@/lib/surveillance/types";

const NO_DATA = "#1a2338";
const OUT_OF_SCOPE = "#0f1626";

function fill(d: DistrictStatus | undefined): string {
  if (!d || !d.hasData || !d.latest_level) return NO_DATA;
  return LEVEL_HEX[d.latest_level];
}

/** Rwanda district map coloured by each district's latest signal. */
export function DistrictMap({
  districts,
  height = 420,
  linkTo = "district",
}: {
  districts: DistrictStatus[];
  height?: number;
  linkTo?: "district" | "none";
}) {
  const router = useRouter();
  const [hover, setHover] = useState<string | null>(null);
  const byName = new Map(districts.map((d) => [d.district, d]));
  const h = hover ? byName.get(hover) : undefined;

  return (
    <div className="relative">
      <svg viewBox={RWANDA_VIEWBOX} style={{ height, width: "100%" }} role="img" aria-label="Map of Rwanda's districts">
        {Object.entries(DISTRICT_SHAPES).map(([name, shape]) => {
          const d = byName.get(name);
          const inScope = !!d;
          const color = inScope ? fill(d) : OUT_OF_SCOPE;
          const withData = d?.hasData;
          return (
            <path
              key={name}
              d={shape.d}
              fill={color}
              fillOpacity={withData ? 0.55 : 1}
              stroke={hover === name ? "#f5b301" : withData ? color : "#2c3a57"}
              strokeWidth={hover === name ? 3 : withData ? 2 : 1}
              strokeDasharray={d?.stale ? "6 4" : undefined}
              style={{ cursor: inScope && linkTo === "district" ? "pointer" : "default", transition: "fill-opacity 150ms" }}
              onMouseEnter={() => setHover(name)}
              onMouseLeave={() => setHover((v) => (v === name ? null : v))}
              onClick={() => inScope && linkTo === "district" && router.push(`/districts/${encodeURIComponent(name)}`)}
            >
              <title>{name}</title>
            </path>
          );
        })}
        {Object.entries(DISTRICT_SHAPES).map(([name, shape]) => {
          const d = byName.get(name);
          if (!d?.hasData && hover !== name) return null;
          return (
            <text
              key={`l-${name}`}
              x={shape.cx}
              y={shape.cy}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={18}
              fontWeight={600}
              fill="#e8eef9"
              style={{ pointerEvents: "none", paintOrder: "stroke" }}
              stroke="#0b1220"
              strokeWidth={4}
            >
              {name}
            </text>
          );
        })}
      </svg>

      {h && (
        <div className="pointer-events-none absolute left-3 top-3 max-w-[240px] rounded-lg border border-border bg-[#101a2e]/95 p-3 text-xs shadow-xl">
          <p className="text-sm font-semibold text-foreground">{h.district}</p>
          <p className="text-muted-foreground">{h.province === "Kigali City" ? "Kigali City" : `${h.province} Province`}</p>
          {h.hasData ? (
            <div className="mt-1.5 space-y-0.5 text-muted-foreground">
              <p>
                Latest week: <span className="text-foreground">{fmtDate(h.latest_week)}</span>
              </p>
              <p>
                Confirmed cases: <span className="text-foreground">{fmt(h.latest_confirmed)}</span>
              </p>
              <p>
                Signal:{" "}
                <span style={{ color: h.latest_level ? LEVEL_HEX[h.latest_level] : undefined }}>
                  {h.latest_level === "ELEVATED"
                    ? "Elevated"
                    : h.latest_level === "WATCH"
                      ? "Watch"
                      : h.latest_level === "NONE"
                        ? "No signal"
                        : "Not evaluated"}
                </span>
              </p>
              {h.stale && <p className="text-[color:var(--risk-watch)]">No new data for {h.days_since_latest} days</p>}
            </div>
          ) : (
            <p className="mt-1.5 text-muted-foreground">No surveillance data reported</p>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {[
          ["Elevated signal", LEVEL_HEX.ELEVATED],
          ["Watch", LEVEL_HEX.WATCH],
          ["No signal", LEVEL_HEX.NONE],
          ["Not evaluated", LEVEL_HEX.INSUFFICIENT],
          ["No data reported", NO_DATA],
        ].map(([label, color]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border border-border" style={{ background: color }} />
            {label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-4 rounded-sm border border-dashed border-muted-foreground" /> Stale data
        </span>
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground/60">Boundaries: geoBoundaries (CC BY 4.0)</p>
    </div>
  );
}
