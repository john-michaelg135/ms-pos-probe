"use client";

import { usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/use-auth-store";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated } = useAuthStore();

  // Login page — render without shell
  if (pathname === "/login" || !isAuthenticated) {
    return <>{children}</>;
  }

  // Authenticated — render with sidebar + header
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-950">{children}</main>
      </div>
    </div>
  );
}
