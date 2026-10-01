"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/**
 * A deliberately slow, detailed scan animation with a live progress bar and
 * percentage. Mounts when work starts; calls onComplete after `durationMs`.
 * Reused by the forecast run and by data-upload validation.
 */
export function ScanProgress({
  title,
  steps,
  durationMs = 4800,
  onComplete,
}: {
  title: string;
  steps: string[];
  durationMs?: number;
  onComplete?: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const done = useRef(false);
  const cb = useRef(onComplete);
  cb.current = onComplete;

  useEffect(() => {
    done.current = false;
    const start = Date.now();
    const id = setInterval(() => {
      const p = Math.min(100, ((Date.now() - start) / durationMs) * 100);
      setProgress(p);
      if (p >= 100 && !done.current) {
        done.current = true;
        clearInterval(id);
        cb.current?.();
      }
    }, 40);
    return () => clearInterval(id);
  }, [durationMs]);

  const active = Math.min(steps.length - 1, Math.floor((progress / 100) * steps.length));

  return (
    <Card className="overflow-hidden">
      <div className="relative h-1 w-full bg-muted">
        <div className="absolute inset-y-0 left-0 w-1/4 bg-primary animate-scan" />
      </div>
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            {title}
          </p>
          <span className="text-3xl font-bold tabular-nums text-primary">
            {Math.round(progress)}%
          </span>
        </div>

        <Progress value={progress} className="mt-3 h-2.5" />

        <p className="mt-3 text-sm text-muted-foreground">{steps[active]}…</p>

        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-2.5 text-sm">
              {i < active ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[color:var(--risk-low)]" />
              ) : i === active ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
              ) : (
                <span className="h-4 w-4 shrink-0 rounded-full border border-border" />
              )}
              <span className={cn(i <= active ? "text-foreground" : "text-muted-foreground")}>
                {s}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
