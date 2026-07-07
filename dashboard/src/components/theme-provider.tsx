"use client";

import { useEffect } from "react";
import { useThemeStore } from "@/stores/use-theme-store";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, mounted, setMounted } = useThemeStore();

  // Read localStorage only after mount to avoid hydration mismatch
  useEffect(() => {
    setMounted();
  }, [setMounted]);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme, mounted]);

  return <>{children}</>;
}
