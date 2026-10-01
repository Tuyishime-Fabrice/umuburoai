import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RiskMapLoader } from "@/components/risk-map-loader";
import { RiskBadge, RiskDot } from "@/components/risk-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDistricts } from "@/lib/data";
import { PILOTS } from "@/lib/risk";
import type { RiskLevel } from "@/lib/types";
import { nf } from "@/lib/utils";

const RANK: Record<RiskLevel, number> = { HIGH: 0, WATCH: 1, LOW: 2 };

export default function MapPage() {
  const districts = getDistricts();
  const isPilot = (name: string) => (PILOTS as readonly string[]).includes(name);
  const rows = [...districts].sort((a, b) => {
    if (RANK[a.risk] !== RANK[b.risk]) return RANK[a.risk] - RANK[b.risk];
    return b.cases_latest - a.cases_latest;
  });

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">District risk map</CardTitle>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <RiskDot level="LOW" /> Normal
            </span>
            <span className="flex items-center gap-1.5">
              <RiskDot level="WATCH" /> Watch
            </span>
            <span className="flex items-center gap-1.5">
              <RiskDot level="HIGH" /> High
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <RiskMapLoader districts={districts} pilots={[...PILOTS]} height={480} zoom={8} />
          <p className="mt-3 text-xs text-muted-foreground">
            Circle size reflects the latest weekly case count; the two ringed circles are the pilot
            districts. Click a circle for detail.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All monitored districts</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>District</TableHead>
                <TableHead>Province</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead className="text-right">Latest cases</TableHead>
                <TableHead className="text-right">Incidence /1k</TableHead>
                <TableHead className="text-right">3-wk forecast</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d) => (
                <TableRow key={d.district}>
                  <TableCell className="font-medium">
                    {d.district}
                    {isPilot(d.district) && (
                      <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        PILOT
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{d.province}</TableCell>
                  <TableCell>
                    <RiskBadge level={d.risk} size="sm" />
                  </TableCell>
                  <TableCell className="text-right">{nf(d.cases_latest)}</TableCell>
                  <TableCell className="text-right">{nf(d.incidence_per_1000, 1)}</TableCell>
                  <TableCell className="text-right">
                    {nf(d.forecast[2] ?? d.forecast[d.forecast.length - 1])}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
