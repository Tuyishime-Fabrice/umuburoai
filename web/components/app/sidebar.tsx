import { NavLinks } from "./nav-links";
import { LogoutButton, UserIdentity } from "./user-panel";
import type { Session } from "@/lib/auth";

export function Sidebar({ session }: { session: Session }) {
  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:border-r md:border-border md:bg-card/40">
      <div className="flex h-16 items-center border-b border-border px-4">
        <UserIdentity session={session} />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <NavLinks />
      </div>
      <div className="border-t border-border p-4">
        <LogoutButton />
      </div>
    </aside>
  );
}
