import { create } from "zustand";

type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  mounted: boolean;
  setMounted: () => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: "light", // default to light
  mounted: false,
  setMounted: () =>
    set(() => {
      const stored =
        typeof window !== "undefined"
          ? (localStorage.getItem("pos-probe-theme") as Theme | null)
          : null;
      return { mounted: true, theme: stored || "light" };
    }),
  toggleTheme: () =>
    set((state) => {
      const next = state.theme === "dark" ? "light" : "dark";
      if (typeof window !== "undefined") {
        localStorage.setItem("pos-probe-theme", next);
      }
      return { theme: next };
    }),
}));
