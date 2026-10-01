import {
  Bell,
  BarChart3,
  Database,
  LayoutDashboard,
  MapPinned,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Surveillance",
    items: [
      { href: "/overview", label: "Situation Overview", icon: LayoutDashboard },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/alerts", label: "Alerts & Verification", icon: Bell },
      { href: "/districts", label: "Districts", icon: MapPinned },
    ],
  },
  { label: "Data", items: [{ href: "/data", label: "Data Management", icon: Database }] },
  { label: "Administration", items: [{ href: "/settings", label: "Settings & Methods", icon: Settings }] },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
export const PROTECTED_PREFIXES = NAV_ITEMS.map((n) => n.href);
