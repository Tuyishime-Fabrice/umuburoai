"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { scopeName } from "@/lib/surveillance/display";
import { cn } from "@/lib/utils";

/** District selector: every page recalculates its analytics for the chosen scope. */
export function ScopeTabs({ scopes, current }: { scopes: string[]; current: string }) {
  const pathname = usePathname();
  if (scopes.length <= 1) {
    return (
      <span className="inline-flex rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-primary">
        {scopeName(current)}
      </span>
    );
  }
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-border bg-card p-1" role="tablist" aria-label="District">
      {scopes.map((s) => {
        const active = s === current;
        return (
          <Link
            key={s}
            href={s === "All" ? pathname : `${pathname}?district=${encodeURIComponent(s)}`}
            role="tab"
            aria-selected={active}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-colors",
              active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {scopeName(s)}
          </Link>
        );
      })}
    </div>
  );
}
