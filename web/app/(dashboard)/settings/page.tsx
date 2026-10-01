import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiStatus } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/auth";
import { listDatasets } from "@/lib/store";
import { fmt, fmtDate } from "@/lib/surveillance/display";
import { getScopedAnalytics } from "@/lib/surveillance/source";
import { getSession } from "@/lib/session.server";

const SERVICE: Record<string, string> = {
  online: "Analytics service online",
  offline: "Analytics service unreachable — calculations run on this server",
  not_configured: "Calculations run on this server",
};

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const [{ analytics: a, computedBy }, status] = await Promise.all([
    getScopedAnalytics(session, "national"),
    apiStatus(),
  ]);
  const own = session.role === "national" ? null : (session.district ?? "");
  const active = listDatasets().filter((d) => d.status === "active" && (!own || d.districts.includes(own)));

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings & Methods</h1>
        <p className="mt-1 text-sm text-muted-foreground">Account, data processing and the rules behind every signal.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" value={session.name} />
          <Field label="Email" value={session.email} />
          <Field label="Role" value={ROLE_LABELS[session.role]} />
          <Field
            label="Access"
            value={session.role === "national" ? "All 30 districts" : `${session.district ?? "—"} District only`}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data processing</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Data source" value="CSV uploads in the weekly district surveillance format" />
          <Field label="Datasets in use" value={`${active.length} (${fmt(active.reduce((s, d) => s + d.rows, 0))} records)`} />
          <Field label="Districts with data" value={`${a.coverage.districts_with_data} of ${a.coverage.districts_total}`} />
          <Field label="Reporting period" value={`${fmtDate(a.period.start)} – ${fmtDate(a.period.end)}`} />
          <Field label="Processing" value={computedBy === "api" ? SERVICE.online : SERVICE[status]} />
          <Field label="Patient data" value="None — weekly district aggregates only" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Methods and signal rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {a.method.map((m) => (
            <div key={m.key} className="grid gap-1 sm:grid-cols-[200px_1fr]">
              <span className="text-sm font-medium">{m.label}</span>
              <span className="text-sm text-muted-foreground">{m.rule}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Responsible use</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Signals flag unusual patterns in the reported data. They are not confirmed outbreaks. Every alert carries a
            verification checklist; decisions are recorded with the reviewer&apos;s name and time.
          </p>
          <p>
            Figures cover districts that have reported data. Districts without data are shown as not reporting and are
            never estimated.
          </p>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">Umuburo AI · team CodeNova</p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
