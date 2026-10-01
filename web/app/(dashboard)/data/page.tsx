import Link from "next/link";
import {
  Bug,
  CloudRain,
  Droplets,
  Landmark,
  MapPinned,
  Stethoscope,
  Thermometer,
  UploadCloud,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDistricts, getNational } from "@/lib/data";
import { PILOTS } from "@/lib/risk";
import { nf } from "@/lib/utils";

type Status = "Historical" | "Synthetic" | "Connectable";
const STATUS_STYLE: Record<Status, string> = {
  Historical: "bg-[color:var(--risk-low-soft)] text-[color:var(--risk-low)]",
  Synthetic: "bg-[color:var(--risk-watch-soft)] text-[color:var(--risk-watch)]",
  Connectable: "bg-muted text-muted-foreground",
};

const CATALOG: { icon: typeof Bug; name: string; source: string; status: Status }[] = [
  { icon: Bug, name: "Malaria cases", source: "Weekly confirmed cases per district", status: "Historical" },
  { icon: Stethoscope, name: "Surveillance reports", source: "CHW + facility reporting completeness", status: "Historical" },
  { icon: CloudRain, name: "Rainfall", source: "NASA POWER (retrievable) · 8-wk lead signal", status: "Connectable" },
  { icon: Thermometer, name: "Temperature", source: "NASA POWER daily mean", status: "Connectable" },
  { icon: Droplets, name: "Humidity", source: "Relative humidity, transmission band", status: "Connectable" },
  { icon: Users, name: "Population", source: "District denominators (census-based)", status: "Historical" },
  { icon: MapPinned, name: "Geographic boundaries", source: "NISR via geoBoundaries (CC BY 4.0)", status: "Historical" },
  { icon: Landmark, name: "Health facilities", source: "Facility catchment (prototype)", status: "Synthetic" },
];

export default function DataPage() {
  const national = getNational();
  const districts = getDistricts();
  const isPilot = (n: string) => (PILOTS as readonly string[]).includes(n);
  const rows = [...districts].sort(
    (a, b) => Number(isPilot(b.district)) - Number(isPilot(a.district)) || b.cases_latest - a.cases_latest,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          The sources feeding the model, and the climate signals behind the forecast.
        </p>
        <Button asChild variant="outline">
          <Link href="/upload">
            <UploadCloud className="h-4 w-4" /> Update data
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="flex items-start gap-3 p-5">
          <CloudRain className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium">Climate is a leading indicator</p>
            <p className="mt-1 text-sm text-muted-foreground">{national.climate.note}</p>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Data sources</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CATALOG.map((c) => {
            const Icon = c.icon;
            return (
              <Card key={c.name} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[c.status]}`}>
                    {c.status}
                  </span>
                </div>
                <h3 className="mt-3 font-semibold">{c.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{c.source}</p>
              </Card>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          The system is built so additional official APIs can be connected later. Data is not
          real-time unless a live connection is configured.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Climate &amp; transmission by district</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>District</TableHead>
                <TableHead className="text-right">Rain now (mm)</TableHead>
                <TableHead className="text-right">Rain 6–8 wk (mm)</TableHead>
                <TableHead className="text-right">Temp (°C)</TableHead>
                <TableHead className="text-right">Rain↔cases r</TableHead>
                <TableHead>Favourable</TableHead>
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
                  <TableCell className="text-right">{nf(d.climate.rain_now, 1)}</TableCell>
                  <TableCell className="text-right">{nf(d.climate.rain_lead_6_8w, 1)}</TableCell>
                  <TableCell className="text-right">{nf(d.climate.temp_c, 1)}</TableCell>
                  <TableCell className="text-right">{nf(d.climate.rain_case_corr, 2)}</TableCell>
                  <TableCell>
                    <Badge variant={d.climate.favourable ? "default" : "muted"}>
                      {d.climate.favourable ? "Yes" : "No"}
                    </Badge>
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
