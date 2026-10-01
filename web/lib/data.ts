import fs from "node:fs";
import path from "node:path";
import type {
  Alert,
  Cell,
  District,
  Meta,
  NationalSummary,
  PreventionDistrict,
  Sector,
  TimeSeries,
  Village,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const cache = new Map<string, unknown>();

function read<T>(file: string): T {
  if (cache.has(file)) return cache.get(file) as T;
  const raw = fs.readFileSync(path.join(DATA_DIR, file), "utf-8");
  const parsed = JSON.parse(raw) as T;
  cache.set(file, parsed);
  return parsed;
}

export function getNational(): NationalSummary {
  return read<NationalSummary>("national_summary.json");
}

export function getDistricts(): District[] {
  return read<District[]>("districts.json");
}

export function getDistrict(name: string): District | undefined {
  return getDistricts().find(
    (d) => d.district.toLowerCase() === name.toLowerCase(),
  );
}

export function getAlerts(): Alert[] {
  return read<Alert[]>("alerts.json");
}

export function getMeta(): Meta {
  return read<Meta>("meta.json");
}

export function getTimeseries(): Record<string, TimeSeries> {
  return read<Record<string, TimeSeries>>("timeseries.json");
}

export function getDistrictSeries(name: string): TimeSeries | undefined {
  return getTimeseries()[name];
}

export function getPrevention(): { districts: PreventionDistrict[] } {
  return read<{ districts: PreventionDistrict[] }>("prevention.json");
}

export function getPreventionFor(name: string): PreventionDistrict | undefined {
  return getPrevention().districts.find(
    (d) => d.district.toLowerCase() === name.toLowerCase(),
  );
}

export function getSectors(): Sector[] {
  return read<{ sectors: Sector[] }>("sectors.json").sectors;
}

export function getHierarchy(): { cells: Cell[]; villages: Village[] } {
  return read<{ cells: Cell[]; villages: Village[] }>("hierarchy.json");
}

export function getDistrictHierarchy(name: string): {
  sectors: Sector[];
  cells: Cell[];
  villages: Village[];
} {
  const lc = name.toLowerCase();
  const { cells, villages } = getHierarchy();
  return {
    sectors: getSectors().filter((s) => s.district.toLowerCase() === lc),
    cells: cells.filter((c) => c.district.toLowerCase() === lc),
    villages: villages.filter((v) => v.district.toLowerCase() === lc),
  };
}
