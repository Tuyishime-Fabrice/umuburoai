import { redirect } from "next/navigation";
import { PrintButton } from "@/components/report/print-button";
import { LEVEL_HEX, LEVEL_META, fmt, fmtDate, scopeName, signed } from "@/lib/surveillance/display";
import { getScopedAnalytics } from "@/lib/surveillance/source";
import { getSession } from "@/lib/session.server";

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ district?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { analytics: a } = await getScopedAnalytics(session, (await searchParams).district);
  const l = a.latest;
  const t = a.totals;
  const q = a.quality;
  const level = l?.signal.level ?? "INSUFFICIENT";
  const color = LEVEL_HEX[level];

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <style>{`@media print { @page { margin: 14mm; } html, body { background: #fff !important; } }`}</style>

      <div className="mx-auto max-w-3xl p-6 sm:p-8">
        <div className="flex items-center justify-between rounded-xl bg-[#0b1220] px-5 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo_full.png" alt="Umuburo AI" className="h-9 w-auto" />
          <div className="text-right text-xs text-slate-300">
            <p className="font-medium text-white">Malaria Surveillance Signal Summary</p>
            <p>
              Data through {fmtDate(a.period.end)} · epi week {l?.epi_week ?? "—"}
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{scopeName(a.scope)}</h1>
            <p className="text-sm text-slate-500">
              {a.districts.join(", ")} · {fmtDate(a.period.start)} – {fmtDate(a.period.end)} ({a.period.weeks} weeks)
            </p>
          </div>
          <PrintButton />
        </div>

        <div className="mt-5 rounded-xl border-2 p-5" style={{ borderColor: color }}>
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Latest-week signal</p>
              <p className="text-2xl font-bold" style={{ color }}>
                {LEVEL_META[level].label}
              </p>
            </div>
            <Stat label="Confirmed cases" value={fmt(l?.confirmed)} />
            <Stat label="vs previous 4-week average" value={signed(l?.change_vs_baseline_pct, 1, "%")} />
            <Stat label="Test positivity" value={`${fmt(l?.positivity_pct, 2)}%`} />
            <Stat label="Reporting completeness" value={`${fmt(l?.reporting_completeness_pct, 1)}%`} />
          </div>
          {l && (
            <ul className="mt-4 space-y-1.5 text-sm text-slate-700">
              {[...l.signal.signals, ...l.signal.observations, ...l.signal.context, ...l.signal.quality].map((s) => (
                <li key={s.key}>
                  <span className="font-semibold">{s.label}.</span> {s.detail}
                </li>
              ))}
              {l.signal.level === "NONE" && <li>No case-based rule fired in the latest week.</li>}
            </ul>
          )}
        </div>

        <section className="mt-6">
          <h2 className="mb-2 text-base font-bold">Dataset period totals</h2>
          <table className="w-full border-collapse text-sm">
            <tbody>
              {[
                ["Confirmed malaria cases", fmt(t.confirmed)],
                ["Suspected cases", fmt(t.suspected)],
                ["Tested", `${fmt(t.tested)} (testing rate ${fmt(t.testing_rate_pct, 2)}%)`],
                ["Test positivity (Σ confirmed ÷ Σ tested)", `${fmt(t.positivity_pct, 2)}%`],
                ["Severe malaria cases", fmt(t.severe)],
                ["Malaria deaths", fmt(t.deaths)],
                ["Malaria admissions", fmt(t.admissions)],
                ["Cumulative incidence per 1,000", fmt(t.incidence_per_1000, 2)],
              ].map(([k, v]) => (
                <tr key={k} className="border-b border-slate-200">
                  <td className="py-1.5 text-slate-600">{k}</td>
                  <td className="py-1.5 text-right font-medium">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-base font-bold">Alerts in the dataset period ({a.alerts.length})</h2>
          {a.alerts.length ? (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-300 text-left uppercase text-slate-500">
                  <th className="py-1.5">Week of</th>
                  <th className="py-1.5">District</th>
                  <th className="py-1.5">Level</th>
                  <th className="py-1.5">Observation</th>
                </tr>
              </thead>
              <tbody>
                {a.alerts.map((al) => (
                  <tr key={al.id} className="border-b border-slate-100 align-top">
                    <td className="whitespace-nowrap py-1.5 pr-2">{al.week_start}</td>
                    <td className="py-1.5 pr-2">{al.district}</td>
                    <td className="whitespace-nowrap py-1.5 pr-2 font-semibold" style={{ color: LEVEL_HEX[al.level] }}>
                      {LEVEL_META[al.level].short}
                    </td>
                    <td className="py-1.5 text-slate-700">{al.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-slate-600">No case-based rule fired in the period.</p>
          )}
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-base font-bold">Data quality</h2>
          <p className="text-sm text-slate-700">
            {q.records} records · {q.missing_values_total} missing values · reporting completeness{" "}
            {fmt(q.reporting_completeness.mean, 1)}% on average (lowest {fmt(q.reporting_completeness.min, 1)}%) ·
            reporting delay {fmt(q.reporting_delay_days.mean, 2)} days on average.{" "}
            {q.validation.filter((v) => v.level !== "ok").length} validation check(s) raised a warning or error.
          </p>
        </section>

        <footer className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-500">
          Calculated from {a.source.file} ({a.source.rows} rows). Signals are rule-based flags for verification by
          the district health team — they do not confirm an outbreak. No forecast is included. Generated for{" "}
          {session.name}.
        </footer>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}
