import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function KpiTile({
  label,
  value,
  sub,
  tone,
  className,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  tone?: string;
  className?: string;
}) {
  return (
    <Card className={cn("p-4", className)}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-bold" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}
