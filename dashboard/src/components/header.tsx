"use client";

import { Menu, Moon, Sun } from "lucide-react";
import { useSidebarStore } from "@/stores/use-sidebar-store";
import { useThemeStore } from "@/stores/use-theme-store";

export function Header() {
  const { toggle } = useSidebarStore();
  const { theme, mounted, toggleTheme } = useThemeStore();

  return (
    <header className="sticky top-0 z-30 h-16 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-6">
      {/* Mobile menu toggle */}
      <button
        onClick={toggle}
        className="lg:hidden text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        aria-label="Toggle sidebar"
      >
        <Menu size={22} />
      </button>

      {/* Spacer for desktop */}
      <div className="hidden lg:block" />

      {/* Right side: theme toggle + user role */}
      <div className="flex items-center gap-4">
        {/* Theme toggle — only render icon after mount to prevent hydration mismatch */}
        <button
          onClick={toggleTheme}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
          aria-label="Toggle theme"
        >
          {mounted ? (
            theme === "dark" ? <Sun size={18} /> : <Moon size={18} />
          ) : (
            <Moon size={18} />
          )}
        </button>

        {/* User role */}
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-gray-600 dark:text-gray-400 font-medium">
            Commissary Manager
          </span>
          <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center">
            <span className="text-[11px] font-bold text-white">CM</span>
          </div>
        </div>
      </div>
    </header>
  );
}
