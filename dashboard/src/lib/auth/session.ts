"use client";

/**
 * Auth session compatibility layer.
 *
 * br-trellis (web-crms) consumes auth via NextAuth's `useSession()` / `signOut()`.
 * POS-PROBE uses a client-side zustand auth store (demo credentials + role access).
 *
 * This shim exposes a NextAuth-shaped `useSession()` and `signOut()` backed by the
 * existing `useAuthStore`, so the ported br-trellis Sidebar / Header / ProfileFooter
 * components work unchanged while the existing demo auth flow keeps functioning.
 */

import { useAuthStore, canAccessRoute, type UserRole } from "@/stores/use-auth-store";

export interface AppSession {
  user: {
    name: string;
    email: string;
    id: string;
  };
  role: string;
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
        email: `${user.username}@pos-probe.local`,
        id: user.username,
      },
      role: user.role,
      // Owners get full visibility (treated like a super user for nav filtering).
      isSuperUser: user.role === "owner",
      permissions: {},
    },
    status: "authenticated",
  };
}

export function signOut() {
  useAuthStore.getState().logout();
}

export { canAccessRoute };
export type { UserRole };
