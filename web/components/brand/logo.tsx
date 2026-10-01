import { cn } from "@/lib/utils";

/**
 * Brand lockup — the official Umuburo AI logo (mosquito-in-target mark + gold
 * "Umubu" / white "ro AI" wordmark + tagline). Transparent PNG, so it sits on
 * the dark theme. Size it with a height class (default h-9).
 */
export function Logo({ className, alt = "Umuburo AI — AI for a Malaria-Free Tomorrow" }: { className?: string; alt?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo_full.png" alt={alt} className={cn("h-9 w-auto select-none", className)} />
  );
}

/** Square mark only (mosquito-in-target). For tight spots / favicons. */
export function BrandMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo.png" alt="Umuburo AI" className={cn("h-8 w-8 select-none", className)} />
  );
}
