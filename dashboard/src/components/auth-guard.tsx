"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore, canAccessRoute } from "@/stores/use-auth-store";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, user, hydrate } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);

  // Hydrate auth state from localStorage on mount
  useEffect(() => {
    hydrate();
    setHydrated(true);
  }, [hydrate]);

  // Redirect logic
  useEffect(() => {
    if (!hydrated) return;

    // Not authenticated and not on login page → redirect to login
    if (!isAuthenticated && pathname !== "/login") {
      router.replace("/login");
      return;
    }

    // Authenticated but on login page → redirect to home
    if (isAuthenticated && pathname === "/login") {
      router.replace("/");
      return;
    }

    // Authenticated but no access to this route → redirect to home
    if (isAuthenticated && user && !canAccessRoute(user.role, pathname) && pathname !== "/login") {
      router.replace("/");
    }
  }, [hydrated, isAuthenticated, user, pathname, router]);

  // Show nothing while hydrating to avoid flash
  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-[13px] text-gray-500">Loading...</div>
      </div>
    );
  }

  // Login page — render without layout
  if (pathname === "/login") {
    return <>{children}</>;
  }

  // Not authenticated — don't render anything (redirect is happening)
  if (!isAuthenticated) {
    return null;
  }

  // Authenticated — render children
  return <>{children}</>;
}
