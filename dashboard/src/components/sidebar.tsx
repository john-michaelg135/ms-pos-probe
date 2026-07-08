"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  TrendingUp,
  BarChart3,
  ShieldAlert,
  FlaskConical,
  X,
  ChevronUp,
  ChevronDown,
  ListTree,
} from "lucide-react";
import { useSidebarStore } from "@/stores/use-sidebar-store";
import { useThemeStore } from "@/stores/use-theme-store";

const probeSubItems = [
  { href: "/forecast", label: "Demand Forecast" },
  { href: "/forecast/quota", label: "Manufacturing Quota" },
  { href: "/analytics", label: "Sales Analytics" },
  { href: "/alerts", label: "Anomaly Alerts" },
  { href: "/accuracy", label: "Model Accuracy" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isOpen, close } = useSidebarStore();
  const { theme, mounted } = useThemeStore();
  const [probeExpanded, setProbeExpanded] = useState(true);

  const isProbeActive =
    probeSubItems.some((item) => pathname === item.href) || pathname === "/";

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={close}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-[260px]
          bg-white dark:bg-gray-900
          border-r border-gray-200 dark:border-gray-800
          transform transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]
          lg:translate-x-0 lg:static lg:z-auto
          overflow-y-auto
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Logo Section */}
        <div className="px-5 pt-6 pb-4">
          <div className="animate-fade-in">
            <Image
              src={mounted && theme === "dark" ? "/images/logo/logo-dark.svg" : "/images/logo/logo.svg"}
              alt="Enterprise Resource Planning"
              width={180}
              height={50}
              className="icon-bounce h-auto"
              priority
            />
          </div>

          {/* Close button (mobile) */}
          <button
            onClick={close}
            className="lg:hidden absolute top-5 right-4 text-gray-400 hover:text-gray-900 dark:hover:text-white btn-press rounded-lg p-1"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        {/* PLATFORMS Section */}
        <div className="px-5 mt-4">
          <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Platforms
          </span>
        </div>

        {/* Navigation */}
        <nav className="mt-3 px-3 space-y-1">
          {/* Dashboard link */}
          <Link
            href="/"
            onClick={close}
            className={`
              nav-fluid flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium
              animate-slide-up stagger-1
              ${
                pathname === "/"
                  ? "text-brand-500 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              }
            `}
          >
            <LayoutDashboard size={18} strokeWidth={1.8} />
            <span>Dashboard</span>
          </Link>

          {/* POS-PROBE Dropdown */}
          <div className="animate-slide-up stagger-2">
            <button
              onClick={() => setProbeExpanded(!probeExpanded)}
              className={`
                nav-fluid w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium
                transition-all duration-200
                ${
                  isProbeActive && pathname !== "/"
                    ? "text-brand-500 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                }
              `}
            >
              <ListTree
                size={18}
                strokeWidth={1.8}
                className={isProbeActive && pathname !== "/" ? "text-brand-500" : ""}
              />
              <span className="flex-1 text-left">POS-PROBE</span>
              {probeExpanded ? (
                <ChevronUp size={16} className="text-gray-400" />
              ) : (
                <ChevronDown size={16} className="text-gray-400" />
              )}
            </button>

            {/* Sub-items */}
            <div
              className={`
                overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                ${probeExpanded ? "max-h-[300px] opacity-100 mt-1" : "max-h-0 opacity-0"}
              `}
            >
              <div className="ml-4 pl-4 border-l border-gray-200 dark:border-gray-700 space-y-0.5">
                {probeSubItems.map((item, index) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={close}
                      className={`
                        nav-fluid block px-3 py-2 rounded-xl text-[13px] font-medium
                        transition-all duration-200
                        animate-scale-in
                        ${
                          isActive
                            ? "text-brand-500 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10"
                            : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
                        }
                      `}
                      style={{ animationDelay: `${(index + 1) * 50}ms` }}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </nav>
      </aside>
    </>
  );
}
