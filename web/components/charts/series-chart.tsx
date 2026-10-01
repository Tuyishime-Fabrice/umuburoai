"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LEVEL_HEX, fmt, fmtDate } from "@/lib/surveillance/display";
import type { SignalLevel } from "@/lib/surveillance/types";

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  type?: "line" | "bar";
  axis?: "left" | "right";
  dashed?: boolean;
  decimals?: number;
  unit?: string;
  /** Colour each point by the signal level stored under this key in the row. */
  levelKey?: string;
}

export type ChartRow = Record<string, string | number | null>;

interface Props {
  data: ChartRow[];
  series: ChartSeries[];
  height?: number;
  refLines?: { y: number; label: string; color: string; axis?: "left" | "right" }[];
  leftUnit?: string;
  rightUnit?: string;
}

const GRID = "#1e2a44";
const TICK = { fill: "#8fa1c0", fontSize: 11 };

/** Weekly chart. Rows need `week_start` (YYYY-MM-DD) and optional `epi_week`. Missing values leave gaps. */
export function SeriesChart({ data, series, height = 280, refLines = [], leftUnit, rightUnit }: Props) {
  const hasRight = series.some((s) => s.axis === "right");
  const byKey = new Map(series.map((s) => [s.key, s]));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: hasRight ? 4 : 12, bottom: 4, left: -6 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="week_start"
          tick={TICK}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          tickFormatter={(v: string) => fmtDate(v, false)}
          interval="preserveStartEnd"
          minTickGap={28}
        />
        <YAxis
          yAxisId="left"
          tick={TICK}
          tickLine={false}
          axisLine={false}
          width={48}
          tickFormatter={(v: number) => `${fmt(v, Math.abs(v) < 10 && v % 1 ? 1 : 0)}${leftUnit ?? ""}`}
        />
        {hasRight && (
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={TICK}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v: number) => `${fmt(v, Math.abs(v) < 10 && v % 1 ? 1 : 0)}${rightUnit ?? ""}`}
          />
        )}
        <Tooltip
          contentStyle={{
            background: "#101a2e",
            border: `1px solid ${GRID}`,
            borderRadius: 10,
            fontSize: 12,
            color: "#e8eef9",
          }}
          labelStyle={{ color: "#8fa1c0" }}
          labelFormatter={(label, payload) => {
            const row = payload?.[0]?.payload as ChartRow | undefined;
            const wk = row?.epi_week != null ? ` · epi week ${row.epi_week}` : "";
            return `Week of ${fmtDate(String(label))}${wk}`;
          }}
          formatter={(value, name) => {
            const s = byKey.get(String(name));
            const v = typeof value === "number" ? fmt(value, s?.decimals ?? 0) : "—";
            return [`${v}${s?.unit ?? ""}`, s?.label ?? String(name)];
          }}
        />
        {refLines.map((r) => (
          <ReferenceLine
            key={r.label}
            yAxisId={r.axis ?? "left"}
            y={r.y}
            stroke={r.color}
            strokeDasharray="6 4"
            label={{ value: r.label, fill: r.color, fontSize: 11, position: "insideTopRight" }}
          />
        ))}
        {series.map((s) =>
          s.type === "bar" ? (
            <Bar
              key={s.key}
              yAxisId={s.axis ?? "left"}
              dataKey={s.key}
              name={s.key}
              fill={s.color}
              fillOpacity={0.55}
              isAnimationActive={false}
            />
          ) : (
            <Line
              key={s.key}
              yAxisId={s.axis ?? "left"}
              type="monotone"
              dataKey={s.key}
              name={s.key}
              stroke={s.color}
              strokeWidth={s.dashed ? 1.8 : 2.4}
              strokeDasharray={s.dashed ? "6 4" : undefined}
              connectNulls={false}
              isAnimationActive={false}
              dot={
                s.levelKey
                  ? (props: { cx?: number; cy?: number; payload?: ChartRow; index?: number }) => {
                      const lvl = props.payload?.[s.levelKey as string] as SignalLevel | undefined;
                      const flagged = lvl === "ELEVATED" || lvl === "WATCH";
                      if (!flagged || props.cx == null || props.cy == null)
                        return <g key={`d-${s.key}-${props.index}`} />;
                      return (
                        <circle
                          key={`d-${s.key}-${props.index}`}
                          cx={props.cx}
                          cy={props.cy}
                          r={4.5}
                          fill={LEVEL_HEX[lvl]}
                          stroke="#0b1220"
                          strokeWidth={1.5}
                        />
                      );
                    }
                  : false
              }
            />
          ),
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean; dot?: boolean }[] }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          {i.dot ? (
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: i.color }} />
          ) : (
            <span
              className="h-0.5 w-5"
              style={{
                background: i.dashed
                  ? `repeating-linear-gradient(90deg, ${i.color} 0 5px, transparent 5px 8px)`
                  : i.color,
              }}
            />
          )}
          {i.label}
        </span>
      ))}
    </div>
  );
}
