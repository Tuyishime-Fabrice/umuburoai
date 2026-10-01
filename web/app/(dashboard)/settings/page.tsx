import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/auth";
import { fmtDate } from "@/lib/surveillance/display";
import { getScopedAnalytics } from "@/lib/surveillance/source";
import { getSession } from "@/lib/session.server";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const { analytics: a, computedBy, allowedScopes } = await getScopedAnalytics(session, "All");

  const scope =
    session.role === "national" ? "All districts in the dataset" : `${session.district ?? "—"} only`;

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" value={session.name} />
          <Field label="Email" value={session.email} />
          <Field label="Role" value={ROLE_LABELS[session.role]} />
          <Field label="Data scope" value={scope} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data source</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="File" value={a.source.file} />
          <Field label="Rows × columns" value={`${a.source.rows} × ${a.source.columns}`} />
          <Field label="Districts" value={allowedScopes.filter((s) => s !== "All").join(", ")} />
          <Field label="Period" value={`${fmtDate(a.period.start)} – ${fmtDate(a.period.end)}`} />
          <Field label="Calculated by" value={computedBy === "api" ? "Umuburo API (FastAPI)" : "This web server"} />
          <Field label="Live connections" value="None — no DHIS2, eLMIS or other live feed is connected" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Signal rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {a.method.map((m) => (
            <div key={m.key} className="grid gap-1 sm:grid-cols-[180px_1fr]">
              <span className="text-sm font-medium">{m.label}</span>
              <span className="text-sm text-muted-foreground">{m.rule}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Responsibility</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            The analytics use only the surveillance CSV listed above. It contains weekly district-level counts —
            no patient-level records. Replacing the file updates every figure.
          </p>
          <p className="text-foreground">
            Umuburo AI flags signals for review. The district health team verifies each signal and decides what,
            if anything, to do. A signal is not a confirmed outbreak.
          </p>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">Umuburo AI · prototype build · team CodeNova</p>
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
