import { ForecastRunner } from "@/components/forecast/forecast-runner";
import { getDistricts } from "@/lib/data";
import { PILOTS } from "@/lib/risk";

export default function ForecastPage() {
  const all = getDistricts();
  const isPilot = (name: string) => (PILOTS as readonly string[]).includes(name);
  const ordered = [...all].sort((a, b) => {
    const p = Number(isPilot(b.district)) - Number(isPilot(a.district));
    if (p !== 0) return p;
    return a.district.localeCompare(b.district);
  });
  const list = ordered.map((d) => ({ district: d.district, risk: d.risk }));

  return (
    <div className="space-y-6">
      <div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Pick a district and horizon, then run the model. It combines the seasonal baseline, a
          case-anomaly control chart, the rainfall-to-cases lag and a ridge-regression forecast into
          an explainable risk score — with the reasons and what to verify first.
        </p>
      </div>
      <ForecastRunner districts={list} defaultDistrict="Nyamasheke" />
    </div>
  );
}
