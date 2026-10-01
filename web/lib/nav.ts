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
  { href: "/overview", label: "Signal Analysis", icon: Activity },
  { href: "/alerts", label: "Surveillance Alerts", icon: Bell },
  { href: "/reports", label: "Health-System Context", icon: ClipboardList },
  { href: "/data", label: "Environment & Data Quality", icon: CloudRain },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const PROTECTED_PREFIXES = NAV_ITEMS.map((n) => n.href);
