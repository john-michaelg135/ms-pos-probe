import { create } from "zustand";

export type UserRole = "owner" | "manager";

interface AuthUser {
  username: string;
  role: UserRole;
  displayName: string;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => boolean;
  logout: () => void;
  hydrate: () => void;
}

// Demo credentials
const DEMO_USERS: Record<string, { password: string; role: UserRole; displayName: string }> = {
  owner: { password: "12345", role: "owner", displayName: "Business Owner" },
  manager: { password: "12345", role: "manager", displayName: "Commissary Manager" },
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,

  login: (username: string, password: string) => {
    const userConfig = DEMO_USERS[username.toLowerCase()];
    if (!userConfig || userConfig.password !== password) {
      return false;
    }

    const user: AuthUser = {
      username: username.toLowerCase(),
      role: userConfig.role,
      displayName: userConfig.displayName,
    };

    if (typeof window !== "undefined") {
      localStorage.setItem("pos-probe-auth", JSON.stringify(user));
      // Activate the api.ts request interceptor which reads localStorage["access_token"].
      // Demo flow: use a namespaced pseudo-token until real gateway auth is wired.
      localStorage.setItem("access_token", `demo.${user.username}.${user.role}`);
    }

    set({ user, isAuthenticated: true });
    return true;
  },

  logout: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("pos-probe-auth");
      localStorage.removeItem("access_token");
    }
    set({ user: null, isAuthenticated: false });
  },

  hydrate: () => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("pos-probe-auth");
      if (stored) {
        try {
          const user = JSON.parse(stored) as AuthUser;
          localStorage.setItem("access_token", `demo.${user.username}.${user.role}`);
          set({ user, isAuthenticated: true });
        } catch {
          localStorage.removeItem("pos-probe-auth");
          localStorage.removeItem("access_token");
        }
      }
    }
  },
}));

// Role-based route access
export const ROLE_ACCESS: Record<UserRole, string[]> = {
  owner: ["/", "/analytics", "/reports"],
  manager: ["/", "/forecast", "/forecast/quota", "/analytics", "/alerts", "/reports", "/accuracy"],
};

export function canAccessRoute(role: UserRole | undefined, path: string): boolean {
  if (!role) return false;
  const allowed = ROLE_ACCESS[role];
  return allowed.some((route) => path === route || (route !== "/" && path.startsWith(route)));
}
