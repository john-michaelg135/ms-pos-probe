"use client";

import { useQuery } from "@tanstack/react-query";
import {
  DollarSign,
  ShoppingCart,
  ShieldAlert,
  Clock,
  CircleCheck,
  CircleX,
} from "lucide-react";
import { fetchGatewayHealth, fetchAiServiceHealth, fetchSyncStatus } from "@/lib/api";

export default function HomePage() {
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

  return (
    <div className="space-y-6">
      {/* Page title */}
      <div>
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
          value="—"
          sublabel="Available in Sprint 2"
          iconColor="bg-brand-500/15 text-brand-400"
        />
        <SummaryCard
          icon={<ShoppingCart size={18} />}
          label="Total Orders Today"
          value="—"
          sublabel="Available in Sprint 2"
          iconColor="bg-purple-500/15 text-purple-500"
        />
        <SummaryCard
          icon={<ShieldAlert size={18} />}
          label="Active Alerts"
          value="—"
          sublabel="Available in Sprint 3"
          iconColor="bg-warning-500/15 text-warning-400"
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
        />
      </div>

      {/* System Status */}
      <div className="bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-[#2d3748] rounded-2xl p-6">
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
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel: string;
  iconColor: string;
}) {
  return (
    <div className="bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-[#2d3748] rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconColor}`}>
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
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-950 rounded-xl">
        <div className="w-2.5 h-2.5 rounded-full bg-gray-300 dark:bg-gray-600 animate-pulse" />
        <span className="text-[13px] text-gray-500 dark:text-gray-400">{label}</span>
        <span className="ml-auto text-[12px] text-gray-400 dark:text-gray-600">Checking...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-950 rounded-xl">
      {isOnline ? (
        <CircleCheck size={15} className="text-success-500" />
      ) : (
        <CircleX size={15} className="text-error-500" />
      )}
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
