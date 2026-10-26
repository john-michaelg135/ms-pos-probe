import { create } from "zustand";
import { canAccessRoute, ROLE_ACCESS, type UserRole } from "@/lib/auth/roles";

export type { UserRole };

interface AuthUser {
  username: string;
  role: UserRole;
  displayName: string;
  email: string;
  /** Their POS role, e.g. "Super Admin" or "POS Manager". */
  posRole: string;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** Reads the session the POS "Open Probe" button started. */
  hydrate: () => Promise<void>;
  logout: () => Promise<void>;
}

/** The POS, where people sign in and where they return after logging out. */
export const POS_URL = (process.env.NEXT_PUBLIC_POS_URL ?? "https://localhost:3002").replace(/\/$/, "");

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

      // Activates the api.ts request interceptor; the backend doesn't verify it yet.
      localStorage.setItem("access_token", `probe.${u.username}.${u.role}`);
      set({
        user: { username: u.username, role: u.role, displayName: u.name, email: u.email, posRole: u.posRole },
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
    window.location.href = `${POS_URL}/sales-processing`;
  },
}));

export { canAccessRoute, ROLE_ACCESS };
