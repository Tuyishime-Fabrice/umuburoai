"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Props {
  weeks: string[];
  actual: number[];
  baseline?: number[];
  forecastWeeks: string[];
  forecast: number[];
  historyWindow?: number;
  height?: number;
  threshold?: number;
}

interface Row {
  label: string;
  actual?: number | null;
  forecast?: number | null;
}

function weekNum(w: string) {
  const m = w.match(/W(\d+)/i);
  return m ? Number(m[1]) : 0;
}

export function ForecastChart({
  weeks,
  actual,
  forecast,
  historyWindow = 26,
  height = 300,
  threshold,
}: Props) {
  const start = Math.max(0, weeks.length - historyWindow);
  const histWeeks = weeks.slice(start);
  const histActual = actual.slice(start);
  const lastNum = histWeeks.length ? weekNum(histWeeks[histWeeks.length - 1]) : 0;

  const data: Row[] = histWeeks.map((w, i) => ({
    label: `Epi W${weekNum(w)}`,
    actual: histActual[i],
    forecast: null,
  }));

  // bridge the two series so the yellow forecast starts exactly where cyan ends
  if (data.length && forecast.length) data[data.length - 1].forecast = histActual[histActual.length - 1];

  forecast.forEach((v, i) => {
    const n = ((lastNum + i) % 52) + 1;
    data.push({ label: `Epi W${n} (+${i + 1}W)`, actual: null, forecast: v });
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: -8 }}>
        <defs>
          <linearGradient id="obsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="fcFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f5b301" stopOpacity={0.42} />
            <stop offset="100%" stopColor="#f5b301" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#1e2a44" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: "#8fa1c0", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "#1e2a44" }}
          interval="preserveStartEnd"
          minTickGap={26}
        />
        <YAxis tick={{ fill: "#8fa1c0", fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
        <Tooltip
          contentStyle={{
            background: "#101a2e",
            border: "1px solid #1e2a44",
            borderRadius: 10,
            fontSize: 12,
            color: "#e8eef9",
          }}
          labelStyle={{ color: "#8fa1c0" }}
          formatter={(value, name) => {
            const labels: Record<string, string> = {
              actual: "Observed cases",
              forecast: "AI forecast",
            };
            const key = String(name);
            const display = typeof value === "number" ? Math.round(value) : (value as number | string);
            return [display, labels[key] ?? key];
          }}
        />
        {typeof threshold === "number" && (
          <ReferenceLine
            y={threshold}
            stroke="#ef4444"
            strokeDasharray="6 4"
            label={{
              value: "Epidemic Risk Threshold",
              fill: "#ef4444",
              fontSize: 11,
              position: "insideTopRight",
            }}
          />
        )}
        <Area
          type="monotone"
          dataKey="actual"
          stroke="#38bdf8"
          strokeWidth={2.6}
          fill="url(#obsFill)"
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="forecast"
          stroke="#f5b301"
          strokeWidth={2.8}
          strokeDasharray="6 5"
          fill="url(#fcFill)"
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
