"use client";

import { useState } from "react";
import { CalendarDays, Clock, Menu, Radio } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { NavLinks } from "./nav-links";
import { LogoutButton, UserIdentity } from "./user-panel";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { type Session } from "@/lib/auth";
import { fmtDate } from "@/lib/surveillance/display";

export interface SurveillanceStatus {
  scopeLabel: string;
  epiWeek: number | null;
  latestWeek: string | null;
  daysSinceLatest: number | null;
  stale: boolean;
  districtsWithData: number;
  districtsTotal: number;
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: "ok" | "warn" }) {
  const style =
    tone === "warn"
      ? "border-[color:var(--risk-watch)]/40 bg-[color:var(--risk-watch-soft)] text-[color:var(--risk-watch)]"
      : tone === "ok"
        ? "border-[color:var(--risk-low)]/40 bg-[color:var(--risk-low-soft)] text-[color:var(--risk-low)]"
        : "border-border bg-card/60 text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs ${style}`}>
      {children}
    </span>
  );
}

export function Topbar({ session, status }: { session: Session; status: SurveillanceStatus | null }) {
  const [open, setOpen] = useState(false);
  const year = status?.latestWeek ? status.latestWeek.slice(0, 4) : "";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur sm:px-6">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="flex w-72 flex-col p-0">
          <div className="flex h-16 items-center border-b border-border px-4">
            <UserIdentity session={session} />
          </div>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <NavLinks onNavigate={() => setOpen(false)} />
          </div>
          <div className="border-t border-border p-4">
            <LogoutButton />
          </div>
        </SheetContent>
      </Sheet>

      <div className="relative inline-flex shrink-0 items-center">
        <div aria-hidden="true" className="absolute -inset-3 rounded-full bg-primary/10 blur-xl" />
        <Logo className="relative h-9 w-auto drop-shadow-[0_1px_10px_rgba(0,0,0,0.55)] sm:h-10" />
      </div>
      <div className="hidden min-w-0 border-l border-border pl-3 lg:block">
        <p className="truncate text-sm font-semibold leading-tight">Malaria Surveillance</p>
        <p className="truncate text-xs text-muted-foreground">{status?.scopeLabel ?? "—"} · weekly district reporting</p>
      </div>

      {status?.latestWeek && (
        <div className="ml-auto hidden items-center gap-2 md:flex">
          <Chip>
            <CalendarDays className="h-3.5 w-3.5" /> Epi week {status.epiWeek ?? "—"} · {year}
          </Chip>
          <Chip>
            <Radio className="h-3.5 w-3.5" /> {status.districtsWithData}/{status.districtsTotal} districts reporting
          </Chip>
          <Chip tone={status.stale ? "warn" : "ok"}>
            <Clock className="h-3.5 w-3.5" />
            {status.stale
              ? `Data ${status.daysSinceLatest} days old`
              : `Data through ${fmtDate(status.latestWeek)}`}
          </Chip>
        </div>
      )}
    </header>
  );
}
