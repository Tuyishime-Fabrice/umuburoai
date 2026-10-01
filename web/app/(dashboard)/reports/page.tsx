import Link from "next/link";
import {
  AlertTriangle,
  ClipboardList,
  Database,
  FileDown,
  Lightbulb,
  ListChecks,
  MapPin,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RiskBadge } from "@/components/risk-badge";
import { getNational } from "@/lib/data";
import { buildDashboardDistrict, type DashboardDistrict } from "@/lib/insight";
import { PILOTS, RISK_META } from "@/lib/risk";

const CAT_COLOR: Record<string, string> = {
  RESPOND: "var(--risk-high)",
  INVESTIGATE: "var(--risk-watch)",
  CLIMATE: "var(--primary)",
};

const URGENCY: Record<string, { label: string; color: string }> = {
  now: { label: "Act now", color: "var(--risk-high)" },
  soon: { label: "Act soon", color: "var(--risk-watch)" },
  routine: { label: "Routine", color: "var(--risk-low)" },
};

const FRAMING = [
  {
    icon: AlertTriangle,
    title: "Problem",
    body: "Malaria outbreaks are often identified only after cases rise, leaving limited time to respond.",
  },
  {
    icon: Lightbulb,
    title: "AI solution",
    body: "An AI-powered early-warning system that predicts abnormal disease patterns before outbreaks occur.",
  },
  {
    icon: Database,
    title: "Key data",
    body: "DHIS2, eLMIS, malaria surveillance & facility reports — with rainfall and climate signals.",
  },
  {
    icon: MapPin,
    title: "Pilot scope",
    body: "Two districts: Kirehe & Nyamasheke.",
  },
];

export default function ReportsPage() {
  const national = getNational();
  const pilots = PILOTS.map((p) => buildDashboardDistrict(p)).filter(Boolean) as DashboardDistrict[];

  return (
    <div className="space-y-7">
      <p className="max-w-2xl text-sm text-muted-foreground">
        What Umuburo AI suggests, based on the latest analysis: what the model sees, what to do about
        it, and what is likely to happen if nothing is done. Review and verify before acting.
      </p>

      {/* framing */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FRAMING.map((f) => {
          const Icon = f.icon;
          return (
            <Card key={f.title} className="p-4">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {f.title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed">{f.body}</p>
            </Card>
          );
        })}
      </div>

      {/* national recommended actions */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <Lightbulb className="h-5 w-5 text-primary" /> Recommended actions
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {national.suggestions.map((s) => (
            <Card key={s.action} className="p-5">
              <span
                className="text-[11px] font-bold uppercase tracking-wide"
                style={{ color: CAT_COLOR[s.category] ?? "var(--muted-foreground)" }}
              >
                {s.category}
              </span>
              <h3 className="mt-1 font-semibold">{s.action}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.why}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* per-pilot suggested solution */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <ClipboardList className="h-5 w-5 text-primary" /> District suggested solutions
        </h2>
        <div className="grid gap-5 lg:grid-cols-2">
          {pilots.map((d) => (
            <Card key={d.name} style={{ borderColor: RISK_META[d.risk].color + "44" }}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">{d.name}</CardTitle>
                <RiskBadge level={d.risk} size="sm" />
              </CardHeader>
              <CardContent className="space-y-4">
                {/* what the AI sees */}
                <div>
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <Search className="h-3.5 w-3.5" /> What the AI sees
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {d.factors.slice(0, 2).map((f) => (
                      <li key={f.label} className="text-sm text-muted-foreground">
                        <span className="text-foreground">{f.label}:</span> {f.detail}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* what to do */}
                <div>
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <ListChecks className="h-3.5 w-3.5" /> What to do
                  </p>
                  <ul className="mt-1.5 space-y-2">
                    {d.recommendations.slice(0, 3).map((r) => (
                      <li key={r.action} className="flex items-start gap-2.5">
                        <span
                          className="mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{
                            background: URGENCY[r.urgency].color + "22",
                            color: URGENCY[r.urgency].color,
                          }}
                        >
                          {URGENCY[r.urgency].label}
                        </span>
                        <span className="text-sm">{r.action}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* if no action */}
                <div
                  className="rounded-lg p-3"
                  style={{ background: RISK_META[d.risk].soft, color: RISK_META[d.risk].color }}
                >
                  <p className="text-xs font-bold uppercase tracking-wide">If no action is taken</p>
                  <p className="mt-1 text-xs leading-relaxed text-foreground/80">
                    {d.consequence.text}
                  </p>
                </div>

                <Button asChild variant="outline" size="sm">
                  <Link href={`/report?district=${encodeURIComponent(d.name)}`} target="_blank">
                    <FileDown className="h-4 w-4" /> Export district report (PDF)
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Generated from the current dataset ({national.as_of}). Prototype data · verify-before-act.
      </p>
    </div>
  );
}
