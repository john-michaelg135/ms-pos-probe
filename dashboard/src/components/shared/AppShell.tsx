"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { useAuthStore } from "@/stores/use-auth-store";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { MobileNav } from "./MobileNav";

const NO_SHELL_ROUTES = ["/login", "/signin"];

function MainContent({ children }: { children: React.ReactNode }) {
  const { open } = useSidebar();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR-safe mount flag for stable hydration
    setMounted(true);
  }, []);

  // Stable class during SSR/hydration (ml-64, matching defaultOpen=true),
  // then switch to the dynamic value based on sidebar state.
  const marginClass = !mounted || open ? "md:ml-64" : "md:ml-0";

  return (
    <div
      className={`flex-1 flex flex-col min-w-0 pb-16 md:pb-0 transition-[margin] duration-300 ${marginClass}`}
    >
      <Header />
      <main
        key={pathname}
        className="flex-1 w-full bg-background relative overflow-y-auto overflow-x-hidden p-4 sm:p-6 animate-page-in"
      >
        {children}
      </main>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated } = useAuthStore();

  // Auth pages and unauthenticated state render bare (no sidebar/header chrome).
  if (NO_SHELL_ROUTES.includes(pathname) || !isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-screen w-full bg-background text-foreground relative">
        <Sidebar />
        <MainContent>{children}</MainContent>
        <MobileNav />
      </div>
    </SidebarProvider>
  );
}
