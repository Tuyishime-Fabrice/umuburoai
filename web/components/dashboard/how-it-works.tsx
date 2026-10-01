"use client";

import { Activity, HelpCircle, ListChecks, ShieldCheck, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const STEPS = [
  {
    icon: Activity,
    tag: "Statistical AI",
    title: "1 · Detect anomalies",
    body: "A z-score control chart compares this week's cases to a 2-year seasonal baseline and flags when they rise above the expected level.",
  },
  {
    icon: TrendingUp,
    tag: "Machine learning",
    title: "2 · Forecast cases",
    body: "A ridge-regression model projects cases 1–8 weeks ahead using case lags, the 8-week rainfall lag, temperature and seasonality.",
  },
  {
    icon: ListChecks,
    tag: "Explainable AI",
    title: "3 · Fuse the risk score",
    body: "Anomaly, short-term trend, climate pressure and the prevention gap are combined into a 0–100 risk score — with the reasons shown.",
  },
  {
    icon: ShieldCheck,
    tag: "Self-validation",
    title: "4 · Validate & recommend",
    body: "The model checks its own confidence (reporting completeness, history, climate, positivity), then turns the signal into prioritised actions and a projected consequence if nothing is done.",
  },
];

export function HowItWorks() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <HelpCircle className="h-4 w-4" /> How the AI works
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Where the AI acts</DialogTitle>
          <DialogDescription>
            Umuburo AI predicts abnormal malaria patterns before an outbreak. The AI works in four
            stages on top of the national data systems.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {STEPS.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.title} className="flex items-start gap-3 rounded-lg bg-muted/40 p-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{s.title}</p>
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      {s.tag}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Pipeline:</span> Data → Baseline → Anomaly →
          Forecast → Risk score → Early warning.
          <br />
          <span className="font-medium text-foreground">Human-in-the-loop:</span> the AI informs;
          people verify and decide (verify-before-act).
        </div>
      </DialogContent>
    </Dialog>
  );
}
