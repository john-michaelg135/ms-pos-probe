"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore, canAccessRoute } from "@/stores/use-auth-store";

const AUTH_ROUTES = ["/signin"];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, user, hydrate } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);

  // Read the session the POS "Open Probe" button started (the proxy has already required one).
  useEffect(() => {
    hydrate().finally(() => setHydrated(true));
  }, [hydrate]);

  // Redirect logic
  useEffect(() => {
    if (!hydrated) return;

    const isAuthRoute = AUTH_ROUTES.includes(pathname);

    // Not authenticated and not on an auth page → explain how to sign in
    if (!isAuthenticated && !isAuthRoute) {
      router.replace("/signin");
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
