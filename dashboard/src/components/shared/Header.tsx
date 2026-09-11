"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HelpCircle, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { useThemeStore } from "@/stores/use-theme-store";

const ROUTE_LABELS: Record<string, string> = {
  "": "Dashboard",
  forecast: "Demand Forecast",
  quota: "Restocking Quota",
  analytics: "Sales Analytics",
  alerts: "Anomaly Alerts",
  reports: "Reports",
  accuracy: "Model Accuracy",
};

function labelFor(segment: string) {
  return (
    ROUTE_LABELS[segment] ??
    segment.charAt(0).toUpperCase() + segment.slice(1)
  );
}

function getBreadcrumbItems(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);

  const items: Array<{ label: string; href?: string; isCurrent?: boolean }> = [
    { label: "POS-PROBE", href: "/" },
  ];

  if (segments.length === 0) {
    items.push({ label: "Dashboard", isCurrent: true });
    return items;
  }

  // Special case: /forecast/quota -> Demand Forecast > Restocking Quota
  if (segments[0] === "forecast" && segments[1] === "quota") {
    items.push({ label: "Demand Forecast", href: "/forecast" });
    items.push({ label: "Restocking Quota", isCurrent: true });
    return items;
  }

  items.push({ label: labelFor(segments[0]), isCurrent: true });
  return items;
}

export function Header() {
  const rawPathname = usePathname();
  const pathname = rawPathname || "/";
  const breadcrumbItems = getBreadcrumbItems(pathname);
  const { theme, mounted, toggleTheme } = useThemeStore();

  return (
    <header className="sticky top-0 z-50 flex justify-between items-center w-full px-4 sm:px-6 h-16 bg-background border-b border-border">
      {/* Left: Sidebar Toggle & Breadcrumb */}
      <div className="flex items-center gap-2 sm:gap-4 flex-1 overflow-hidden">
        <SidebarTrigger className="h-9 w-9 shrink-0 hover:bg-accent text-foreground transition-all cursor-pointer" />
        <Separator orientation="vertical" className="h-5" />
        <Breadcrumb className="overflow-hidden">
          <BreadcrumbList className="flex-nowrap whitespace-nowrap text-sm sm:text-base font-semibold">
            {breadcrumbItems.map((item, index) => (
              <React.Fragment key={index}>
                {index > 0 && (
                  <BreadcrumbSeparator className="text-muted-foreground [&>svg]:w-4 [&>svg]:h-4" />
                )}
                <BreadcrumbItem>
                  {item.isCurrent ? (
                    <BreadcrumbPage className="font-bold text-foreground">
                      {item.label}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink
                      asChild
                      className="text-muted-foreground hover:text-foreground font-semibold"
                    >
                      <Link href={item.href || "#"}>{item.label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </React.Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* Right: Theme toggle & Help */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="text-muted-foreground hover:text-foreground w-8 h-8"
        >
          {mounted && theme === "dark" ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground w-8 h-8"
          aria-label="Help"
        >
          <HelpCircle className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
}
