"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip } from "react-leaflet";
import type { District, RiskLevel } from "@/lib/types";
import { nf } from "@/lib/utils";

const RISK_HEX: Record<RiskLevel, string> = {
  HIGH: "#ef4444",
  WATCH: "#f59e0b",
  LOW: "#22c55e",
};

export interface RiskMapProps {
  districts: Pick<
    District,
    "district" | "lat" | "lng" | "risk" | "cases_latest" | "incidence_per_1000" | "forecast"
  >[];
  pilots?: string[];
  center?: [number, number];
  zoom?: number;
  height?: number;
}

export function RiskMap({
  districts,
  pilots = [],
  center = [-1.98, 29.88],
  zoom = 8,
  height = 460,
}: RiskMapProps) {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      scrollWheelZoom={false}
      style={{ height, width: "100%", borderRadius: 12 }}
      attributionControl
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors'
        maxZoom={19}
      />
      {districts.map((d) => {
        const isPilot = pilots.includes(d.district);
        const base = 6 + Math.sqrt(Math.max(d.cases_latest, 1)) / 4;
        const radius = Math.min(26, Math.max(6, isPilot ? base + 3 : base));
        return (
          <CircleMarker
            key={d.district}
            center={[d.lat, d.lng]}
            radius={radius}
            pathOptions={{
              color: RISK_HEX[d.risk],
              weight: isPilot ? 3 : 1.4,
              fillColor: RISK_HEX[d.risk],
              fillOpacity: d.risk === "LOW" ? 0.25 : 0.5,
            }}
          >
            <Tooltip direction="top" offset={[0, -4]} opacity={1}>
              <span style={{ fontWeight: 600 }}>{d.district}</span>
              {isPilot ? " · pilot" : ""}
            </Tooltip>
            <Popup>
              <div style={{ minWidth: 180 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  {d.district}
                  {isPilot ? " (pilot)" : ""}
                </div>
                <div style={{ color: RISK_HEX[d.risk], fontWeight: 600, marginBottom: 6 }}>
                  {d.risk === "HIGH" ? "High risk" : d.risk === "WATCH" ? "Watch" : "Normal"}
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                  Latest week: <b>{nf(d.cases_latest)}</b> cases
                  <br />
                  Incidence: {nf(d.incidence_per_1000, 1)} / 1,000
                  <br />
                  3-wk forecast: <b>{nf(d.forecast[2] ?? d.forecast[d.forecast.length - 1])}</b> cases
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
