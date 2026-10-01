import { cn } from "@/lib/utils";

/**
 * Clean, professional hero backdrop: a soft radial glow, a barely-there grid,
 * and one faint radar sweep in the corner. Deliberately subtle so it never
 * competes with the headline. (The mosquito identity lives in the logo.)
 */
export function MosquitoBackdrop({ className }: { className?: string }) {
  return (
    <div
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      aria-hidden="true"
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(1100px 620px at 82% -12%, rgba(245,179,1,0.12), transparent 62%)," +
            "radial-gradient(900px 600px at 8% 108%, rgba(56,189,248,0.05), transparent 55%)," +
            "linear-gradient(180deg,#070b14 0%,#0a1120 55%,#070b14 100%)",
        }}
      />
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <pattern id="hgrid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M48 0H0V48" fill="none" stroke="#7f93b8" strokeOpacity="0.045" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hgrid)" />
        <g stroke="#f5b301" fill="none" opacity="0.12">
          <circle cx="88%" cy="-2%" r="160" strokeWidth="1" />
          <circle cx="88%" cy="-2%" r="300" strokeWidth="1" />
          <circle cx="88%" cy="-2%" r="460" strokeWidth="1" />
        </g>
      </svg>
      <div className="absolute inset-0 bg-linear-to-t from-background via-background/20 to-transparent" />
    </div>
  );
}
