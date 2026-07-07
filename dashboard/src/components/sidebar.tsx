"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  BarChart3,
  ShieldAlert,
  FlaskConical,
  X,
} from "lucide-react";
import { useSidebarStore } from "@/stores/use-sidebar-store";

const navItems = [
  { href: "/", label: "Dashboard Home", icon: LayoutDashboard },
  { href: "/forecast", label: "Demand Forecast", icon: TrendingUp },
  { href: "/analytics", label: "Sales Analytics", icon: BarChart3 },
  { href: "/alerts", label: "Anomaly Alerts", icon: ShieldAlert },
  { href: "/accuracy", label: "Model Accuracy", icon: FlaskConical },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isOpen, close } = useSidebarStore();

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={close}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-[260px]
          bg-white dark:bg-gray-900
          border-r border-gray-200 dark:border-gray-800
          transform transition-transform duration-200 ease-in-out
          lg:translate-x-0 lg:static lg:z-auto
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-5 border-b border-gray-200 dark:border-gray-800">
          <span className="text-[15px] font-semibold text-brand-500 tracking-wide">
            POS-PROBE
          </span>
          <button
            onClick={close}
            className="lg:hidden text-gray-400 hover:text-gray-900 dark:hover:text-white"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="mt-5 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium
                  transition-colors duration-150
                  ${
                    isActive
                      ? "bg-brand-500 text-white"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
                  }
                `}
              >
                <item.icon size={18} strokeWidth={1.8} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
