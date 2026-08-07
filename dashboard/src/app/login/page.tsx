"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";
import { useAuthStore } from "@/stores/use-auth-store";
import { useThemeStore } from "@/stores/use-theme-store";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const { theme, mounted } = useThemeStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Simulate brief loading
    await new Promise((r) => setTimeout(r, 500));

    const success = login(username, password);
    if (success) {
      router.push("/");
    } else {
      setError("Invalid username or password");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side — form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white dark:bg-gray-950">
        <div className="w-full max-w-sm space-y-8">
          <div>
            <Image
              src={mounted && theme === "dark" ? "/images/logo/logo-dark.svg" : "/images/logo/logo.svg"}
              alt="POS-PROBE"
              width={160}
              height={45}
              className="mb-8"
              priority
            />
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">Sign In</h1>
            <p className="text-[13px] text-gray-500 mt-1">Enter your credentials to access POS-PROBE Analytics</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="username" className="block text-[12px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Username <span className="text-red-500">*</span>
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
                className="w-full px-4 py-3 text-[13px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-[12px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full px-4 py-3 pr-10 text-[13px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-[12px] text-red-500 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 rounded-xl text-[13px] font-semibold text-white transition-all btn-press ${
                loading
                  ? "bg-brand-400 cursor-not-allowed"
                  : "bg-brand-500 hover:bg-brand-600 shadow-[0_2px_8px_rgba(70,95,255,0.25)]"
              }`}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p className="text-[11px] text-gray-400 text-center">
            POS-PROBE Analytics Dashboard • Demo Access
          </p>
        </div>
      </div>

      {/* Right side — branding */}
      <div className="hidden lg:flex flex-1 items-center justify-center bg-gradient-to-br from-brand-500 via-purple-600 to-brand-700 p-12">
        <div className="text-center text-white space-y-4">
          <div className="text-5xl font-bold">POS-PROBE</div>
          <p className="text-lg text-white/80 max-w-sm">
            Predictive Restocking & Outlier Behavior Engine
          </p>
          <p className="text-sm text-white/60 mt-4">
            AI-powered demand forecasting and fraud detection
          </p>
        </div>
      </div>
    </div>
  );
}
