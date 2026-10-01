import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { PhotoBackdrop } from "@/components/brand/photo-backdrop";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="relative flex h-screen flex-col items-center justify-center overflow-hidden px-5 text-center">
      {/* rotating mosquito photo background (CDC/PHIL, public domain) */}
      <PhotoBackdrop />

      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center [text-shadow:0_1px_18px_rgba(0,0,0,0.55)]">
        {/* logo with glow */}
        <div className="relative inline-flex items-center justify-center">
          <div aria-hidden="true" className="absolute -inset-6 rounded-full bg-primary/15 blur-3xl" />
          <Logo className="relative h-14 w-auto drop-shadow-[0_2px_24px_rgba(0,0,0,0.7)] sm:h-16" />
        </div>

        <span className="mt-5 inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot" />
          Malaria early-warning intelligence · Rwanda
        </span>

        <h1 className="mt-4 text-balance text-3xl font-bold leading-[1.1] tracking-tight text-white sm:text-5xl">
          Spot unusual malaria signals <span className="text-primary">early</span> — and verify them.
        </h1>

        <p className="mt-4 max-w-xl text-pretty text-sm leading-relaxed text-slate-200/90 sm:text-base">
          Umuburo AI compares each week&apos;s malaria surveillance data with its recent baseline, flags
          unusual increases with the reasons behind them, and leaves the decision to district health teams.
        </p>

        <div className="mt-6 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
          <Button asChild size="lg" className="h-11 w-full px-8 text-base sm:w-auto">
            <Link href="/login">
              Request Access <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-11 w-full px-8 text-base sm:w-auto">
            <Link href="/login">Login</Link>
          </Button>
        </div>

        <p className="mt-6 text-xs text-slate-300/80">
          Weekly district surveillance · early-warning signals · verification workflow
        </p>
      </div>
    </div>
  );
}
