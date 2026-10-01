import type { ComponentType } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideProps } from "lucide-react";

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  className,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: ComponentType<LucideProps>;
  accent?: string;
  className?: string;
}) {
  return (
    <Card className={cn("p-4 sm:p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold leading-none sm:text-3xl" style={accent ? { color: accent } : undefined}>
            {value}
          </p>
          {sub && <p className="mt-2 text-xs text-muted-foreground">{sub}</p>}
        </div>
        {Icon && (
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </Card>
  );
}
