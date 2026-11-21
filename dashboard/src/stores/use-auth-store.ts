import { create } from "zustand";
import { posSalesUrl } from "@/lib/pos-url";
import { canAccessRoute, ROLE_ACCESS, type UserRole } from "@/lib/auth/roles";

export type { UserRole };

interface AuthUser {
  username: string;
  role: UserRole;
  displayName: string;
  email: string;
  /** Their POS role, e.g. "Super Admin" or "POS Manager". */
  posRole: string;
  /** A manager's branch; null for the owner, who sees every location. */
  location: { id: number; name: string } | null;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** Reads the session the POS "Open Probe" button started. */
  hydrate: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,

  hydrate: async () => {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const body = response.ok ? await response.json() : null;
      const u = body?.user;

      if (!u) {
        localStorage.removeItem("access_token");
        set({ user: null, isAuthenticated: false });
        return;
      }

      set({
        user: {
          username: u.username,
          role: u.role,
          displayName: u.name,
          email: u.email,
          posRole: u.posRole,
          location: u.location ?? null,
        },
        isAuthenticated: true,
      });
    } catch {
      set({ user: null, isAuthenticated: false });
    }
  },

  logout: async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    localStorage.removeItem("access_token");
    set({ user: null, isAuthenticated: false });
    window.location.href = posSalesUrl;
  },
}));

export { canAccessRoute, ROLE_ACCESS };
