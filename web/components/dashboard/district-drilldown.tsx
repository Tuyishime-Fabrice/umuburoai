"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RISK_META } from "@/lib/risk";
import type { Cell, RiskLevel, Sector, Village } from "@/lib/types";
import { cn, nf } from "@/lib/utils";

const RANK: Record<RiskLevel, number> = { HIGH: 0, WATCH: 1, LOW: 2 };
const bySeverity = (a: { risk: RiskLevel; cases_latest: number }, b: { risk: RiskLevel; cases_latest: number }) =>
  RANK[a.risk] - RANK[b.risk] || b.cases_latest - a.cases_latest;

function Dot({ r }: { r: RiskLevel }) {
  return <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: RISK_META[r].color }} />;
}

interface Hier {
  sectors: Sector[];
  cells: Cell[];
  villages: Village[];
}

export function DistrictDrilldown({ district }: { district: string }) {
  const [data, setData] = useState<Hier | null>(null);
  const [loading, setLoading] = useState(true);
  const [openSector, setOpenSector] = useState<string | null>(null);
  const [openCell, setOpenCell] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setData(null);
    setOpenSector(null);
    setOpenCell(null);
    fetch(`/api/hierarchy?district=${encodeURIComponent(district)}`)
      .then((r) => r.json())
      .then((d: Hier) => {
        if (active) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [district]);

  const sectors = (data?.sectors ?? []).slice().sort(bySeverity);
  const counts = {
    sectors: data?.sectors.length ?? 0,
    cells: data?.cells.length ?? 0,
    villages: data?.villages.length ?? 0,
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Where the risk is — sector → cell → village</CardTitle>
        {!loading && (
          <span className="text-xs text-muted-foreground">
            {counts.sectors} sectors · {counts.cells} cells · {counts.villages} villages
          </span>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {sectors.map((s) => {
              const sOpen = openSector === s.sector;
              const cells = (data?.cells ?? [])
                .filter((c) => c.sector === s.sector)
                .sort(bySeverity);
              return (
                <div key={s.sector}>
                  <button
                    onClick={() => {
                      setOpenSector(sOpen ? null : s.sector);
                      setOpenCell(null);
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-muted/40"
                  >
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        sOpen && "rotate-90",
                      )}
                    />
                    <Dot r={s.risk} />
                    <span className="font-medium">{s.sector}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {nf(s.cases_latest)} cases · {s.trend_pct > 0 ? "+" : ""}
                      {s.trend_pct}%
                    </span>
                  </button>

                  {sOpen && (
                    <div className="bg-muted/20 pl-5">
                      {cells.map((c) => {
                        const cOpen = openCell === c.cell;
                        const villages = (data?.villages ?? [])
                          .filter((v) => v.cell === c.cell)
                          .sort(bySeverity);
                        return (
                          <div key={c.cell} className="border-t border-border/60">
                            <button
                              onClick={() => setOpenCell(cOpen ? null : c.cell)}
                              className="flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-muted/40"
                            >
                              <ChevronRight
                                className={cn(
                                  "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                                  cOpen && "rotate-90",
                                )}
                              />
                              <Dot r={c.risk} />
                              <span>{c.cell}</span>
                              <span className="ml-auto text-xs text-muted-foreground">
                                {nf(c.cases_latest)} cases
                              </span>
                            </button>
                            {cOpen && (
                              <ul className="space-y-1 px-3 pb-2 pl-10">
                                {villages.map((v) => (
                                  <li
                                    key={v.village}
                                    className="flex flex-wrap items-center gap-2 py-1 text-xs"
                                  >
                                    <Dot r={v.risk} />
                                    <span className="text-foreground">{v.village}</span>
                                    <span className="ml-auto text-muted-foreground">
                                      {nf(v.cases_latest)} cases · nets {v.itn_use}% used · IRS{" "}
                                      {v.irs}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Expand a sector to see its cells, and a cell to see village-level cases and net/IRS
          coverage — the granular view routine reports often miss.
        </p>
      </CardContent>
    </Card>
  );
}
