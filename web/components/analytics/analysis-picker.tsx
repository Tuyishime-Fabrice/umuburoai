"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, History, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ANALYSES, CATEGORIES, PRESETS } from "@/lib/surveillance/catalog";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "umuburo.analytics.selection";

/** Catalogue of analyses: the user chooses what to run; nothing is shown until they do. */
export function AnalysisPicker({
  selected,
  availability,
  compact = false,
}: {
  selected: string[];
  availability: Record<string, string | null>;
  compact?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [picked, setPicked] = useState<string[]>(selected);
  const [open, setOpen] = useState(!compact);
  const stored = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return window.localStorage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const remembered = useMemo(() => {
    try {
      return stored ? (JSON.parse(stored) as string[]).filter((id) => ANALYSES.some((a) => a.id === id)) : [];
    } catch {
      return [];
    }
  }, [stored]);

  function run(ids: string[]) {
    const keep = ids.filter((id) => !availability[id]);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keep));
    } catch {
      /* storage unavailable */
    }
    const sp = new URLSearchParams(params.toString());
    if (keep.length) sp.set("a", keep.join(","));
    else sp.delete("a");
    router.push(`${pathname}?${sp.toString()}`);
    setOpen(false);
  }

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const availableCount = ANALYSES.filter((a) => !availability[a.id]).length;

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">
          Showing {selected.length} of {availableCount} available analyses
        </span>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Change analyses
        </Button>
        <Button variant="ghost" size="sm" onClick={() => run([])}>
          <X className="h-4 w-4" /> Clear
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">Choose the analyses you need</p>
            <p className="text-xs text-muted-foreground">
              {availableCount} of {ANALYSES.length} analyses are available for the data imported for this scope.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {remembered.length > 0 && !selected.length && (
              <Button variant="outline" size="sm" onClick={() => run(remembered)}>
                <History className="h-4 w-4" /> Last selection ({remembered.length})
              </Button>
            )}
            {PRESETS.map((p) => (
              <Button key={p.id} variant="outline" size="sm" onClick={() => setPicked(p.analyses.filter((id) => !availability[id]))}>
                {p.label}
              </Button>
            ))}
            <Button variant="outline" size="sm" onClick={() => setPicked(ANALYSES.filter((a) => !availability[a.id]).map((a) => a.id))}>
              All available
            </Button>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {CATEGORIES.map((cat) => (
            <div key={cat}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-primary">{cat}</p>
              <div className="space-y-1.5">
                {ANALYSES.filter((a) => a.category === cat).map((a) => {
                  const reason = availability[a.id];
                  const on = picked.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      disabled={!!reason}
                      onClick={() => toggle(a.id)}
                      title={reason ?? a.description}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
                        on ? "border-primary/60 bg-primary/10" : "border-border hover:border-primary/40 hover:bg-muted/40",
                        reason && "cursor-not-allowed opacity-45 hover:border-border hover:bg-transparent",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border",
                          on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50",
                        )}
                      >
                        {on && <Check className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium leading-tight">{a.title}</span>
                        <span className="block text-[11px] leading-snug text-muted-foreground">{reason ?? a.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          {picked.length > 0 && (
            <Button variant="ghost" onClick={() => setPicked([])}>
              Clear selection
            </Button>
          )}
          {selected.length > 0 && (
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          )}
          <Button disabled={!picked.length} onClick={() => run(picked)}>
            <Play className="h-4 w-4" /> Run {picked.length || ""} {picked.length === 1 ? "analysis" : "analyses"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
