import { LEVEL_META } from "@/lib/surveillance/display";
import type { SignalLevel } from "@/lib/surveillance/types";
import { cn } from "@/lib/utils";

export function LevelDot({ level, className }: { level: SignalLevel; className?: string }) {
  return (
    <span
      className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", className)}
      style={{ background: LEVEL_META[level].color }}
    />
  );
}

export function LevelBadge({
  level,
  size = "md",
  className,
}: {
  level: SignalLevel;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const m = LEVEL_META[level];
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
      title={m.description}
    >
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}
