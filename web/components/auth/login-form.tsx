"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEMO_ACCOUNTS, SESSION_COOKIE, encodeSession, type Session } from "@/lib/auth";

// A default account is pre-filled so the workspace opens in one click.
const DEFAULT_EMAIL = "national@umuburo.rw";
const DEFAULT_PASSWORD = "demo";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/monitor";
  const [email, setEmail] = useState(DEFAULT_EMAIL);
  const [password, setPassword] = useState(DEFAULT_PASSWORD);
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);

  function signIn(session: Session) {
    setLoading(true);
    const maxAge = remember ? 60 * 60 * 24 * 30 : 60 * 60 * 8;
    document.cookie = `${SESSION_COOKIE}=${encodeSession(session)}; path=/; max-age=${maxAge}; samesite=lax`;
    toast.success(`Welcome, ${session.name}`);
    router.push(next);
    router.refresh();
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const acc = DEMO_ACCOUNTS.find(
      (a) => a.email === email.trim().toLowerCase() && a.password === password,
    );
    if (acc) {
      const { password: _pw, ...s } = acc;
      void _pw;
      signIn(s);
      return;
    }
    if (email && password) {
      signIn({ name: email.split("@")[0] || "User", email, role: "national" });
      return;
    }
    toast.error("Enter your email and password.");
  }

  return (
    <div className="w-full">
      <h2 className="text-2xl font-bold tracking-tight">Sign in</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Access your surveillance workspace.
      </p>

      <form onSubmit={onSubmit} className="mt-7 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="you@umuburo.rw"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? "Hide password" : "Show password"}
              className="absolute right-1 top-1/2 -translate-y-1/2 grid h-8 w-9 place-items-center rounded-md text-muted-foreground hover:text-foreground"
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-border bg-background"
              style={{ accentColor: "#f5b301" }}
            />
            Keep me signed in
          </label>
          <span className="text-sm text-muted-foreground/70">Authorised access</span>
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          ← Back to home
        </Link>
      </p>
    </div>
  );
}
