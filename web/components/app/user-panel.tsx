"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS, SESSION_COOKIE, type Session } from "@/lib/auth";
import { cn } from "@/lib/utils";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function UserIdentity({ session }: { session: Session }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar>
        <AvatarFallback>{initials(session.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{session.name}</p>
        <p className="text-xs leading-tight text-muted-foreground">{ROLE_LABELS[session.role]}</p>
      </div>
    </div>
  );
}

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  function signOut() {
    document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`;
    router.push("/login");
    router.refresh();
  }
  return (
    <Button variant="outline" className={cn("w-full justify-start", className)} onClick={signOut}>
      <LogOut className="h-4 w-4" /> Log out
    </Button>
  );
}
