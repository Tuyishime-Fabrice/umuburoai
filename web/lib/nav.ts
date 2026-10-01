import {
  Activity,
  Bell,
  ClipboardList,
  CloudRain,
  Gauge,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/monitor", label: "District Monitor", icon: Gauge },
  { href: "/overview", label: "Outbreak Forecast Engine", icon: Activity },
  { href: "/alerts", label: "Surveillance Alerts", icon: Bell },
  { href: "/reports", label: "Intervention Matrix", icon: ClipboardList },
  { href: "/data", label: "Epidemiological & Climate Data", icon: CloudRain },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const PROTECTED_PREFIXES = NAV_ITEMS.map((n) => n.href);
