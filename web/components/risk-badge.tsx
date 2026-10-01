import { RISK_META } from "@/lib/risk";
import type { RiskLevel } from "@/lib/types";
import { cn } from "@/lib/utils";

export function RiskDot({ level, className }: { level: RiskLevel; className?: string }) {
  return (
    <span
      className={cn("inline-block h-2.5 w-2.5 rounded-full", className)}
      style={{ background: RISK_META[level].color }}
    />
  );
}

export function RiskBadge({
  level,
  className,
  size = "md",
}: {
  level: RiskLevel;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const m = RISK_META[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full font-semibold",
        size === "sm" && "px-2.5 py-0.5 text-xs",
        size === "md" && "px-3 py-1 text-sm",
        size === "lg" && "px-4 py-1.5 text-base",
        className,
      )}
      style={{ background: m.soft, color: m.color }}
    >
      <span className="inline-block h-2 w-2 rounded-full animate-pulse-dot" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}
