import {
  FileText,
  LayoutDashboard,
  ListChecks,
  ShieldAlert,
  Target,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

export type NavDestination = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export type SidebarSection = {
  /** Heading shown above the section; unlabelled sections have none. */
  label?: string;
  destinations: readonly NavDestination[];
};

/** The sidebar, in order, grouped the way the Enterprise Portal groups its own. */
export const SIDEBAR_SECTIONS: readonly SidebarSection[] = [
  { destinations: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "FORECASTING",
    destinations: [
      { href: "/forecast", label: "Demand Forecast", icon: TrendingUp },
      { href: "/forecast/quota", label: "Restocking Quota", icon: ListChecks },
    ],
  },
  {
    label: "INSIGHTS",
    destinations: [
      { href: "/alerts", label: "Anomaly Alerts", icon: ShieldAlert },
      { href: "/reports", label: "Reports", icon: FileText },
    ],
  },
  {
    label: "MODEL",
    destinations: [{ href: "/accuracy", label: "Model Accuracy", icon: Target }],
  },
];
