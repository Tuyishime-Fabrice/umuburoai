import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { PhotoBackdrop } from "@/components/brand/photo-backdrop";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12">
      <PhotoBackdrop />

      <div className="relative z-10 w-full max-w-sm animate-rise">
        {/* logo with glow — always clearly visible */}
        <div className="mb-8 flex justify-center">
          <div className="relative inline-flex items-center justify-center">
            <div aria-hidden="true" className="absolute -inset-6 rounded-full bg-primary/15 blur-3xl" />
            <Logo className="relative h-14 w-auto drop-shadow-[0_2px_20px_rgba(0,0,0,0.6)] sm:h-16" />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card/85 p-6 shadow-2xl backdrop-blur-md sm:p-8">
          <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Umuburo AI · malaria early-warning intelligence
        </p>
      </div>
    </div>
  );
}
