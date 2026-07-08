"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DollarSign,
  ShoppingCart,
  ShieldAlert,
  Clock,
  CircleCheck,
  CircleX,
  RefreshCw,
} from "lucide-react";
import { fetchGatewayHealth, fetchAiServiceHealth, fetchSyncStatus, fetchRevenue, triggerForceSync } from "@/lib/api";

export default function HomePage() {
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const gatewayHealth = useQuery({
    queryKey: ["health", "gateway"],
    queryFn: fetchGatewayHealth,
    refetchInterval: 30000,
  });

  const aiHealth = useQuery({
    queryKey: ["health", "ai-service"],
    queryFn: fetchAiServiceHealth,
    refetchInterval: 30000,
  });

  const syncStatus = useQuery({
    queryKey: ["sync", "status"],
    queryFn: fetchSyncStatus,
    refetchInterval: 60000,
  });

  // Today's sales data
  const today = new Date().toISOString().split("T")[0];
  const todayRevenue = useQuery({
    queryKey: ["analytics", "today", today],
    queryFn: () => fetchRevenue("day", today, today),
    refetchInterval: 60000,
  });

  const totalSalesToday = todayRevenue.data?.[0]?.total_revenue ?? null;
  const totalOrdersToday = todayRevenue.data?.[0]?.total_orders ?? null;

  // Sync Now handler
  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await triggerForceSync();
      if (result.error) {
        setSyncResult(`⚠️ ${result.error}`);
      } else {
        setSyncResult(`✅ Synced ${result.total_rows_synced} rows in ${result.sync_duration_seconds}s`);
      }
      // Refresh sync status and analytics
      queryClient.invalidateQueries({ queryKey: ["sync"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    } catch (err: unknown) {
      const error = err as { message?: string; status?: number };
      if (error.status === 429) {
        setSyncResult("⏳ Rate limited — try again in a few minutes");
      } else {
        setSyncResult(`❌ ${error.message || "Sync failed"}`);
      }
    } finally {
      setSyncing(false);
      // Clear notification after 5 seconds
      setTimeout(() => setSyncResult(null), 5000);
    }
  };

  return (
    <div className="space-y-6 page-enter">
      {/* Page title */}
      <div className="animate-fade-in">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Dashboard</h1>
        <p className="text-[13px] text-gray-500 mt-1">
          System overview and key metrics at a glance
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard
          icon={<DollarSign size={18} />}
          label="Total Sales Today"
          value={totalSalesToday !== null ? `₱${totalSalesToday.toLocaleString()}` : "₱0.00"}
          sublabel={todayRevenue.isLoading ? "Loading..." : "Today's revenue"}
          iconColor="bg-brand-500/15 text-brand-400"
          delay={1}
        />
        <SummaryCard
          icon={<ShoppingCart size={18} />}
          label="Total Orders Today"
          value={totalOrdersToday !== null ? `${totalOrdersToday}` : "0"}
          sublabel={todayRevenue.isLoading ? "Loading..." : "Orders processed"}
          iconColor="bg-purple-500/15 text-purple-500"
          delay={2}
        />
        <SummaryCard
          icon={<ShieldAlert size={18} />}
          label="Active Alerts"
          value="—"
          sublabel="Available in Sprint 3"
          iconColor="bg-warning-500/15 text-warning-400"
          delay={3}
        />
        <SummaryCard
          icon={<Clock size={18} />}
          label="Last Data Sync"
          value={formatSyncTime(syncStatus.data?.last_sync_timestamp)}
          sublabel={
            syncStatus.data?.last_sync_timestamp
              ? `Every ${syncStatus.data.sync_interval_minutes} min`
              : "Awaiting first sync"
          }
          iconColor="bg-success-500/15 text-success-400"
          delay={4}
        />
      </div>

      {/* Data Sync Section */}
      <div className="bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-[#2d3748] rounded-2xl p-6 card-hover animate-bounce-in stagger-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900 dark:text-gray-50">
              Data Synchronization
            </h2>
            <p className="text-[12px] text-gray-500 mt-1">
              {syncStatus.data?.last_sync_timestamp
                ? `Last synced: ${new Date(syncStatus.data.last_sync_timestamp).toLocaleString()}`
                : "No sync performed yet"
              }
              {" • "}Auto-sync every {syncStatus.data?.sync_interval_minutes ?? 10} minutes
            </p>
          </div>
          <button
            onClick={handleSyncNow}
            disabled={syncing}
            className={`
              flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-semibold
              btn-press transition-all
              ${syncing
                ? "bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
                : "bg-brand-500 text-white hover:bg-brand-600 shadow-[0_2px_8px_rgba(70,95,255,0.25)]"
              }
            `}
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing..." : "Sync Now"}
          </button>
        </div>

        {/* Sync result notification */}
        {syncResult && (
          <div className="mt-3 px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-900 text-[12px] text-gray-700 dark:text-gray-300 animate-slide-up">
            {syncResult}
          </div>
        )}
      </div>

      {/* System Status */}
      <div className="bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-[#2d3748] rounded-2xl p-6 card-hover animate-bounce-in stagger-4">
        <h2 className="text-[15px] font-semibold text-gray-900 dark:text-gray-50 mb-4" id="system-status">
          System Status
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StatusItem
            label="Gateway"
            isOnline={gatewayHealth.isSuccess && gatewayHealth.data?.status === "healthy"}
            isLoading={gatewayHealth.isLoading}
          />
          <StatusItem
            label="AI Service"
            isOnline={aiHealth.isSuccess && aiHealth.data?.status === "healthy"}
            isLoading={aiHealth.isLoading}
          />
          <StatusItem
            label="Redis"
            isOnline={
              aiHealth.isSuccess &&
              aiHealth.data?.dependencies?.redis === "connected"
            }
            isLoading={aiHealth.isLoading}
          />
        </div>
      </div>
    </div>
  );
}

// ── Components ──

function SummaryCard({
  icon,
  label,
  value,
  sublabel,
  iconColor,
  delay,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel: string;
  iconColor: string;
  delay: number;
}) {
  return (
    <div className={`bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-[#2d3748] rounded-2xl p-5 card-hover animate-bounce-in stagger-${delay}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center icon-bounce ${iconColor}`}>
          {icon}
        </div>
        <span className="text-[13px] text-gray-500 dark:text-gray-400 font-medium">{label}</span>
      </div>
      <p className="text-xl font-semibold text-gray-900 dark:text-gray-50">{value}</p>
      <p className="text-[12px] text-gray-400 dark:text-gray-500 mt-1">{sublabel}</p>
    </div>
  );
}

function StatusItem({
  label,
  isOnline,
  isLoading,
}: {
  label: string;
  isOnline: boolean;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-950 rounded-xl shimmer">
        <div className="w-2.5 h-2.5 rounded-full bg-gray-300 dark:bg-gray-600 animate-pulse" />
        <span className="text-[13px] text-gray-500 dark:text-gray-400">{label}</span>
        <span className="ml-auto text-[12px] text-gray-400 dark:text-gray-600">Checking...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-950 rounded-xl transition-all duration-200 hover:bg-gray-100 dark:hover:bg-gray-900 hover:scale-[1.02] cursor-default">
      <div className="relative">
        {isOnline ? (
          <>
            <CircleCheck size={15} className="text-success-500 relative z-10" />
            <span className="absolute inset-0 rounded-full bg-success-500/20 animate-ping" />
          </>
        ) : (
          <CircleX size={15} className="text-error-500" />
        )}
      </div>
      <span className="text-[13px] text-gray-700 dark:text-gray-300">{label}</span>
      <span
        className={`ml-auto text-[12px] font-medium ${
          isOnline ? "text-success-500" : "text-error-500"
        }`}
      >
        {isOnline ? "Online" : "Offline"}
      </span>
    </div>
  );
}

function formatSyncTime(timestamp: string | null | undefined): string {
  if (!timestamp) return "—";
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return date.toLocaleDateString();
  } catch {
    return "—";
  }
}
