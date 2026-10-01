import { Dashboard } from "@/components/dashboard/dashboard";
import { getDistrict } from "@/lib/data";
import { buildDashboardDistrict, type DashboardDistrict } from "@/lib/insight";
import { PILOTS } from "@/lib/risk";
import type { District } from "@/lib/types";

export default function OverviewPage() {
  const districts = PILOTS.map((p) => buildDashboardDistrict(p)).filter(
    Boolean,
  ) as DashboardDistrict[];
  const mapDistricts = PILOTS.map((p) => getDistrict(p)).filter(Boolean) as District[];

  const center: [number, number] = mapDistricts.length
    ? [
        mapDistricts.reduce((s, m) => s + m.lat, 0) / mapDistricts.length,
        mapDistricts.reduce((s, m) => s + m.lng, 0) / mapDistricts.length,
      ]
    : [-2.0, 29.9];

  return <Dashboard districts={districts} mapDistricts={mapDistricts} mapCenter={center} />;
}
