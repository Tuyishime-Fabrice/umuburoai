"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ScopeOption } from "@/lib/surveillance/types";

const PROVINCE_ORDER = ["Kigali City", "Southern", "Western", "Northern", "Eastern"];

/** National → province → district selector. Every page recalculates for the chosen scope. */
export function ScopePicker({ options, current }: { options: ScopeOption[]; current: ScopeOption }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  if (options.length <= 1) {
    return (
      <span className="inline-flex h-10 items-center rounded-md border border-border bg-card px-4 text-sm font-medium text-primary">
        {current.label}
        {current.level === "district" ? " District" : ""}
      </span>
    );
  }

  function go(id: string) {
    const sp = new URLSearchParams(params.toString());
    if (id === "national") sp.delete("scope");
    else sp.set("scope", id);
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const provinces = options.filter((o) => o.level === "province");
  const label = (o: ScopeOption) => (
    <span className="flex w-full items-center justify-between gap-3">
      <span>{o.label}</span>
      {!o.hasData && <span className="text-[11px] text-muted-foreground">no data</span>}
    </span>
  );

  return (
    <Select value={current.id} onValueChange={go}>
      <SelectTrigger className="w-full sm:w-72" aria-label="Geographic scope">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-[420px]">
        <SelectItem value="national">National</SelectItem>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Provinces</SelectLabel>
          {provinces.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {label(o)}
            </SelectItem>
          ))}
        </SelectGroup>
        {PROVINCE_ORDER.map((p) => (
          <SelectGroup key={p}>
            <SelectSeparator />
            <SelectLabel>{p === "Kigali City" ? "Kigali City" : `${p} Province`} — districts</SelectLabel>
            {options
              .filter((o) => o.level === "district" && o.province === p)
              .map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {label(o)}
                </SelectItem>
              ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
