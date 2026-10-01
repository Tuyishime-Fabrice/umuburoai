"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { NavLinks } from "./nav-links";
import { LogoutButton, UserIdentity } from "./user-panel";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { type Session } from "@/lib/auth";

export function Topbar({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur sm:px-6">
      {/* mobile menu */}
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

      <div className="relative inline-flex items-center">
        <div
          aria-hidden="true"
          className="absolute -inset-3 rounded-full bg-primary/10 blur-xl"
        />
        <Logo className="relative h-9 w-auto drop-shadow-[0_1px_10px_rgba(0,0,0,0.55)] sm:h-10" />
      </div>
    </header>
  );
}
