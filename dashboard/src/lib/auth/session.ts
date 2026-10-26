"use client";

/**
 * Auth session compatibility layer: a NextAuth-shaped `useSession()` / `signOut()` over
 * `useAuthStore`, which holds the session the POS "Open Probe" button started.
 */

import { useAuthStore, canAccessRoute, type UserRole } from "@/stores/use-auth-store";

export interface AppSession {
  user: {
    name: string;
    email: string;
    id: string;
  };
  role: string;
  /** Their POS role, e.g. "Super Admin" or "POS Manager". */
  posRole: string;
  isSuperUser: boolean;
  permissions: Record<string, unknown>;
}

export interface UseSessionResult {
  data: AppSession | null;
  status: "authenticated" | "unauthenticated" | "loading";
}

export function useSession(): UseSessionResult {
  const { user, isAuthenticated } = useAuthStore();

  if (!isAuthenticated || !user) {
    return { data: null, status: "unauthenticated" };
  }

  return {
    data: {
      user: {
        name: user.displayName,
        email: user.email,
        id: user.username,
      },
      role: user.role,
      posRole: user.posRole,
      // Owners get full visibility (treated like a super user for nav filtering).
      isSuperUser: user.role === "owner",
      permissions: {},
    },
    status: "authenticated",
  };
}

export function signOut() {
  return useAuthStore.getState().logout();
}

export { canAccessRoute };
export type { UserRole };
