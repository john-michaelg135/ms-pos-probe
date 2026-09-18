import {
  LayoutDashboard,
  TrendingUp,
  ListChecks,
  BarChart3,
  ShieldAlert,
  FileText,
  Target,
  Settings,
  Building2,
  ShoppingCart,
  Users2,
  CreditCard,
  Truck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

export interface SystemItem {
  fullName: string;
  desc: string;
  icon: LucideIcon;
  active: boolean;
}

/**
 * POS-PROBE navigation tabs — same routes/content as the previous
 * collapsible "POS-PROBE" dropdown, now rendered as a flat sidebar menu
 * (strictly using the br-trellis sidebar structure).
 */
export const mainNavItems: NavItem[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Demand Forecast", href: "/forecast", icon: TrendingUp },
  { name: "Restocking Quota", href: "/forecast/quota", icon: ListChecks },
  { name: "Sales Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Anomaly Alerts", href: "/alerts", icon: ShieldAlert },
  { name: "Reports", href: "/reports", icon: FileText },
  { name: "Model Accuracy", href: "/accuracy", icon: Target },
];

export const settingsNavItem: NavItem = {
  name: "Settings",
  href: "/settings",
  icon: Settings,
};

export const navItems: NavItem[] = [...mainNavItems];

/** Enterprise module switcher (mirrors br-trellis) — POS-PROBE is the active one. */
export const systems: SystemItem[] = [
  {
    fullName: "POS-PROBE Analytics",
    desc: "Forecasting & anomaly detection",
    icon: BarChart3,
    active: true,
  },
  {
    fullName: "Point of Sale",
    desc: "Retail & register checkout",
    icon: CreditCard,
    active: false,
  },
  {
    fullName: "Customer Relationship Management",
    desc: "Contact profiles, tickets & marketing",
    icon: Building2,
    active: false,
  },
  {
    fullName: "E-Commerce Storefront",
    desc: "Online orders & products",
    icon: ShoppingCart,
    active: false,
  },
  {
    fullName: "Human Resource Management",
    desc: "Staff directory & payroll",
    icon: Users2,
    active: false,
  },
  {
    fullName: "Supply Chain Management",
    desc: "Inventory & logistics",
    icon: Truck,
    active: false,
  },
];
