import { redirect } from "next/navigation";
import { getNational } from "@/lib/data";
import { buildDashboardDistrict } from "@/lib/insight";
import { getSession } from "@/lib/session.server";
import { PILOTS } from "@/lib/risk";
import { PrintButton } from "@/components/report/print-button";
import { nf } from "@/lib/utils";

const LIGHT: Record<string, string> = { HIGH: "#dc2626", WATCH: "#d97706", LOW: "#16a34a" };

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ district?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { district } = await searchParams;
  const name = district && PILOTS.includes(district as (typeof PILOTS)[number]) ? district : PILOTS[1];
  const d = buildDashboardDistrict(name);
  const national = getNational();
  if (!d) redirect("/overview");

  const color = LIGHT[d.risk];

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <style>{`@media print { @page { margin: 14mm; } html, body { background: #fff !important; } }`}</style>

      <div className="mx-auto max-w-3xl p-6 sm:p-8">
        {/* header band */}
        <div className="flex items-center justify-between rounded-xl bg-[#0b1220] px-5 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo_full.png" alt="Umuburo AI" className="h-9 w-auto" />
          <div className="text-right text-xs text-slate-300">
            <p className="font-medium text-white">Malaria Early-Warning Report</p>
            <p>
              epi week {national.epi_week} · {national.as_of}
            </p>
          </div>
        </div>

        {/* title + action */}
        <div className="mt-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{d.name} District</h1>
            <p className="text-sm text-slate-500">{d.province} Province · Rwanda</p>
          </div>
          <PrintButton />
        </div>

        {/* risk banner */}
        <div
          className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border-2 p-5"
          style={{ borderColor: color }}
        >
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Risk level</p>
            <p className="text-2xl font-bold" style={{ color }}>
              {d.levelLabel}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Risk score</p>
            <p className="text-2xl font-bold" style={{ color }}>
              {d.score}%
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Latest week</p>
            <p className="text-2xl font-bold">{nf(d.casesLatest)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">3-week forecast</p>
            <p className="text-2xl font-bold">
              {nf(d.forecast3)}{" "}
              <span className="text-sm font-semibold" style={{ color }}>
                ({d.deltaPct >= 0 ? "+" : ""}
                {d.deltaPct}%)
              </span>
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Outbreak threshold</p>
            <p className="text-2xl font-bold">{nf(d.threshold)}/wk</p>
          </div>
        </div>

        {/* projected consequence */}
        <section className="mt-6">
          <h2 className="text-base font-bold">{d.consequence.headline}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{d.consequence.text}</p>
        </section>

        {/* forecast table */}
        <section className="mt-6">
          <h2 className="mb-2 text-base font-bold">AI forecast (next 8 weeks)</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-xs uppercase text-slate-500">
                <th className="py-2">Week ahead</th>
                {d.series.forecast_weeks.map((w) => (
                  <th key={w} className="py-2 text-right">
                    {w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-2 font-medium">Predicted cases</td>
                {d.series.forecast.map((v, i) => (
                  <td
                    key={i}
                    className="py-2 text-right"
                    style={{ color: v >= d.threshold ? color : undefined, fontWeight: v >= d.threshold ? 700 : 400 }}
                  >
                    {nf(v)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          <p className="mt-1 text-xs text-slate-500">
            Values at or above the outbreak threshold ({nf(d.threshold)}/wk) are shown in {" "}
            <span style={{ color }}>colour</span>.
          </p>
        </section>

        {/* recommendations */}
        <section className="mt-6">
          <h2 className="mb-2 text-base font-bold">Recommended actions</h2>
          <ul className="space-y-2">
            {d.recommendations.map((r) => (
              <li key={r.action} className="text-sm">
                <span className="font-semibold">{r.action}</span>
                <span className="block text-slate-600">{r.why}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* sample alert */}
        <section className="mt-6">
          <h2 className="mb-2 text-base font-bold">Sample alert — {d.alert.recipient}</h2>
          <div className="rounded-lg border border-slate-300 p-4">
            <p className="text-sm font-semibold">{d.alert.emailSubject}</p>
            <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-600">
              {d.alert.emailBody}
            </p>
          </div>
        </section>

        <footer className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-500">
          Umuburo AI · decision support (verify-before-act). Prototype data calibrated to the national
          Malaria &amp; NTD Annual Report (FY2023-24). Generated for {session.name}.
        </footer>
      </div>
    </div>
  );
}
