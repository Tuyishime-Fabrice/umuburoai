import { AlertTriangle, CheckCircle2, CloudRain, Eye, ShieldCheck, Info } from "lucide-react";
import { LevelBadge } from "@/components/surveillance/level-badge";
import type { SignalItem, WeekSignal } from "@/lib/surveillance/types";

function Group({
  title,
  items,
  icon: Icon,
  color,
}: {
  title: string;
  items: SignalItem[];
  icon: typeof Info;
  color: string;
}) {
  if (!items.length) return null;
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" style={{ color }} /> {title}
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((s) => (
          <li key={s.key} className="text-sm">
            <span className="font-medium">{s.label}.</span>{" "}
            <span className="text-muted-foreground">{s.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The explanation for one week's signal: only what the data supports is listed. */
export function SignalPanel({ signal, compact = false }: { signal: WeekSignal; compact?: boolean }) {
  return (
    <div className="space-y-3">
      {!compact && <LevelBadge level={signal.level} />}
      {signal.level === "INSUFFICIENT" && (
        <p className="text-sm text-muted-foreground">
          Fewer than 4 earlier weeks — there is no baseline to compare this week against.
        </p>
      )}
      {signal.level === "NONE" && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-[color:var(--risk-low)]" /> No case-based rule fired
          this week.
        </p>
      )}
      <Group title="Contributing signals" items={signal.signals} icon={AlertTriangle} color="var(--risk-high)" />
      <Group title="Observations to verify" items={signal.observations} icon={Eye} color="var(--risk-watch)" />
      <Group title="Environmental context" items={signal.context} icon={CloudRain} color="var(--primary)" />
      <Group title="Data confidence" items={signal.quality} icon={ShieldCheck} color="var(--risk-low)" />
    </div>
  );
}
