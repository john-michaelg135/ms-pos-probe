"use client";

import { useState, useRef, useEffect } from "react";
import { Menu, Moon, Sun, ChevronDown, LogOut, User } from "lucide-react";
import { useSidebarStore } from "@/stores/use-sidebar-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useAuthStore } from "@/stores/use-auth-store";

export function Header() {
  const { toggle } = useSidebarStore();
  const { theme, mounted, toggleTheme } = useThemeStore();
  const { user, logout } = useAuthStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const initials = user
    ? user.displayName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : "??";

  return (
    <header className="sticky top-0 z-30 h-16 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-6 animate-fade-in">
      {/* Mobile menu toggle */}
      <button
        onClick={toggle}
        className="lg:hidden text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white btn-press rounded-lg p-2"
        aria-label="Toggle sidebar"
      >
        <Menu size={22} />
      </button>

      {/* Spacer for desktop */}
      <div className="hidden lg:block" />

      {/* Right side: theme toggle + user dropdown */}
      <div className="flex items-center gap-4">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white btn-press"
          aria-label="Toggle theme"
        >
          <span className="icon-bounce inline-flex">
            {mounted ? (
              theme === "dark" ? <Sun size={18} /> : <Moon size={18} />
            ) : (
              <Moon size={18} />
            )}
          </span>
        </button>

        {/* User dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors btn-press"
          >
            <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center shadow-[0_2px_8px_rgba(70,95,255,0.3)]">
              <span className="text-[11px] font-bold text-white">{initials}</span>
            </div>
            <span className="text-[13px] text-gray-700 dark:text-gray-300 font-medium hidden sm:inline">
              {user?.displayName || "User"}
            </span>
            <ChevronDown size={14} className={`text-gray-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {/* Dropdown popup */}
          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-2 animate-scale-in z-50">
              {/* User info */}
              <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700">
                <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-50">{user?.displayName}</p>
                <p className="text-[11px] text-gray-500 capitalize">{user?.role}</p>
              </div>

              {/* Sign out */}
              <button
                onClick={() => { setDropdownOpen(false); logout(); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <LogOut size={16} className="text-gray-400" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
