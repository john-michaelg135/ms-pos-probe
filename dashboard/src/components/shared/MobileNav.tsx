"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth/session";
import { canAccessRoute } from "@/stores/use-auth-store";
import { mainNavItems } from "./SidebarNav";

export function MobileNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.role;

  // Show up to 5 role-allowed tabs in the bottom bar.
  const items = mainNavItems
    .filter((item) => canAccessRoute(role as never, item.href))
    .slice(0, 5);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around h-16 bg-background border-t border-border md:hidden">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10px] font-medium transition-colors ${
              isActive
                ? "text-primary font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="truncate max-w-[64px]">{item.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
