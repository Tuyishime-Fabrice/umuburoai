import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getMeta } from "@/lib/data";
import { getSession } from "@/lib/session.server";
import { ROLE_LABELS } from "@/lib/auth";

const MODEL_LABELS: Record<string, string> = {
  baseline: "Baseline",
  anomaly: "Anomaly detection",
  forecast: "Forecast",
  risk: "Risk fusion",
  allocation: "Resource allocation",
};

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const meta = getMeta();

  const scope =
    session.role === "national"
      ? "All districts (national)"
      : `${session.district ?? "—"} (${session.role})`;

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
          <CardTitle className="text-base">Model</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.entries(meta.model).map(([k, v]) => (
            <div key={k} className="grid gap-1 sm:grid-cols-[160px_1fr]">
              <span className="text-sm font-medium">{MODEL_LABELS[k] ?? k}</span>
              <span className="text-sm text-muted-foreground">{v}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            ["Alert emails for High-risk flags", true],
            ["Weekly forecast digest", true],
            ["Watch-level notifications", false],
          ].map(([label, on]) => (
            <div key={label as string} className="flex items-center justify-between">
              <span className="text-sm">{label}</span>
              <Badge variant={on ? "default" : "muted"}>{on ? "On" : "Off"}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data &amp; responsibility</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>{meta.data_status}</p>
          <p className="text-foreground">{meta.human_in_the_loop}</p>
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
