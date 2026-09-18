"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore, canAccessRoute } from "@/stores/use-auth-store";

const AUTH_ROUTES = ["/login", "/signin"];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, user, hydrate } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);

  // Hydrate auth state from localStorage on mount
  useEffect(() => {
    hydrate();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration gate to avoid SSR flash
    setHydrated(true);
  }, [hydrate]);

  // Redirect logic
  useEffect(() => {
    if (!hydrated) return;

    const isAuthRoute = AUTH_ROUTES.includes(pathname);

    // Not authenticated and not on an auth page → redirect to login
    if (!isAuthenticated && !isAuthRoute) {
      router.replace("/login");
      return;
    }

    // Authenticated but on an auth page → redirect to home
    if (isAuthenticated && isAuthRoute) {
      router.replace("/");
      return;
    }

    // Authenticated but no access to this route → redirect to home
    if (
      isAuthenticated &&
      user &&
      !canAccessRoute(user.role, pathname) &&
      !isAuthRoute
    ) {
      router.replace("/");
    }
  }, [hydrated, isAuthenticated, user, pathname, router]);

  // Show nothing while hydrating to avoid flash
  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-[13px] text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Auth pages — render without layout
  if (AUTH_ROUTES.includes(pathname)) {
    return <>{children}</>;
  }

  // Not authenticated — don't render anything (redirect is happening)
  if (!isAuthenticated) {
    return null;
  }

  // Authenticated — render children
  return <>{children}</>;
}
