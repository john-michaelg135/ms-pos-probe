"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  Package,
  MapPin,
  ShieldAlert,
  Clock,
  CircleCheck,
  CircleX,
  RefreshCw,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { fetchRevenue, fetchSalesByLocation, fetchSalesByProduct, fetchAlerts, fetchForecast, fetchGatewayHealth, fetchAiServiceHealth, fetchSyncStatus, triggerForceSync } from "@/lib/api";
import { useAuthStore } from "@/stores/use-auth-store";

const COLORS = ["#465fff", "#7a5af8", "#0ba5ec", "#f79009", "#12b76a", "#f04438"];

export default function HomePage() {
  const { user } = useAuthStore();

  if (user?.role === "manager") {
    return <ManagerDashboard />;
  }

  return <OwnerDashboard />;
}

// ═══════════════════════════════════════════════════════
// OWNER DASHBOARD — Business overview
// ═══════════════════════════════════════════════════════

function OwnerDashboard() {
  const { user } = useAuthStore();

  // Last 30 days revenue
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dateFrom = `${thirtyDaysAgo.getFullYear()}-${String(thirtyDaysAgo.getMonth() + 1).padStart(2, "0")}-${String(thirtyDaysAgo.getDate()).padStart(2, "0")}`;
  const dateTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const revenue = useQuery({
    queryKey: ["dashboard", "revenue", dateFrom, dateTo],
    queryFn: () => fetchRevenue("day", dateFrom, dateTo),
    refetchInterval: 60000,
  });

  const weeklyRevenue = useQuery({
    queryKey: ["dashboard", "revenue-weekly", dateFrom, dateTo],
    queryFn: () => fetchRevenue("week", dateFrom, dateTo),
  });

  const salesByLocation = useQuery({
    queryKey: ["dashboard", "location", dateFrom, dateTo],
    queryFn: () => fetchSalesByLocation(dateFrom, dateTo),
  });

  const salesByProduct = useQuery({
    queryKey: ["dashboard", "product", dateFrom, dateTo],
    queryFn: () => fetchSalesByProduct(dateFrom, dateTo),
  });

  const alerts = useQuery({
    queryKey: ["dashboard", "alerts"],
    queryFn: () => fetchAlerts({ status: "New", page: 1 }),
    refetchInterval: 30000,
  });

  const forecast = useQuery({
    queryKey: ["dashboard", "forecast-7"],
    queryFn: () => fetchForecast(7),
  });

  // Computed metrics
  const totalRevenue = revenue.data?.reduce((sum, d) => sum + d.total_revenue, 0) ?? 0;
  const totalOrders = revenue.data?.reduce((sum, d) => sum + d.total_orders, 0) ?? 0;
  const totalQuantity = revenue.data?.reduce((sum, d) => sum + d.total_quantity, 0) ?? 0;
  const alertCount = alerts.data?.total ?? 0;

  // Top selling product
  const topProduct = salesByProduct.data?.length
    ? salesByProduct.data.reduce((top, p) => p.total_quantity > top.total_quantity ? p : top, salesByProduct.data[0])
    : null;

  // Forecast total for next 7 days
  const forecastTotal = forecast.data?.reduce((sum, d) => sum + d.predicted_quantity, 0) ?? 0;

  // Location pie data
  const locationPieData = salesByLocation.data?.map((loc) => ({
    name: loc.location_name,
    value: loc.total_revenue,
  })) ?? [];

  // Weekly bar chart
  const weeklyBarData = weeklyRevenue.data?.map((d) => ({
    week: d.period,
    revenue: d.total_revenue,
  })) ?? [];

  return (
    <div className="space-y-6 page-enter">
      {/* Greeting */}
      <div className="animate-fade-in">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">
          Welcome back{user ? `, ${user.displayName}` : ""}
        </h1>
        <p className="text-[13px] text-gray-500 mt-1">
          Here&apos;s your business overview for the last 30 days
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          icon={<DollarSign size={18} />}
          label="Total Revenue"
          value={`₱${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          sublabel="Last 30 days"
          iconColor="bg-brand-500/15 text-brand-500"
          delay={1}
        />
        <MetricCard
          icon={<ShoppingCart size={18} />}
          label="Total Orders"
          value={`${totalOrders.toLocaleString()}`}
          sublabel={`${totalQuantity} units sold`}
          iconColor="bg-purple-500/15 text-purple-500"
          delay={2}
        />
        <MetricCard
          icon={<TrendingUp size={18} />}
          label="Predicted Demand"
          value={`${forecastTotal} units`}
          sublabel="Next 7 days (all products)"
          iconColor="bg-blue-500/15 text-blue-500"
          delay={3}
        />
        <MetricCard
          icon={<Package size={18} />}
          label="Top Product"
          value={topProduct ? `${topProduct.product_name}` : "—"}
          sublabel={topProduct ? `${topProduct.variation_name} • ${topProduct.total_quantity} units` : "No data"}
          iconColor="bg-green-500/15 text-green-500"
          delay={4}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Weekly Revenue */}
        <div className="bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-[#2d3748] rounded-2xl p-6 card-hover animate-bounce-in stagger-2">
          <h2 className="text-[14px] font-semibold text-gray-900 dark:text-gray-50 mb-1">Weekly Revenue</h2>
          <p className="text-[11px] text-gray-500 mb-4">Revenue trend by week</p>
          {weeklyBarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weeklyBarData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(102,112,133,0.15)" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#98a2b3" }} tickFormatter={(v) => { try { const d = new Date(v + "T00:00:00"); return `${d.getMonth() + 1}/${d.getDate()}`; } catch { return v; }}} />
                <YAxis tick={{ fontSize: 10, fill: "#98a2b3" }} tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`} width={50} />
                <Tooltip contentStyle={{ background: "rgba(26,34,49,0.95)", border: "1px solid #2d3748", borderRadius: 12, fontSize: 11 }} formatter={(v) => [`₱${Number(v).toLocaleString()}`, "Revenue"]} />
                <Bar dataKey="revenue" fill="#465fff" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-[12px] text-gray-400">No revenue data</div>
          )}
        </div>

        {/* Revenue by Location */}
        <div className="bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-[#2d3748] rounded-2xl p-6 card-hover animate-bounce-in stagger-3">
          <h2 className="text-[14px] font-semibold text-gray-900 dark:text-gray-50 mb-1">Revenue by Branch</h2>
          <p className="text-[11px] text-gray-500 mb-4">Distribution across locations</p>
          {locationPieData.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={locationPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} dataKey="value" label={false}>
                    {locationPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "rgba(26,34,49,0.95)", border: "1px solid #2d3748", borderRadius: 12, fontSize: 11 }} formatter={(v) => [`₱${Number(v).toLocaleString()}`, "Revenue"]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 flex-1">
                {salesByLocation.data?.map((loc, i) => {
                  const total = salesByLocation.data!.reduce((s, l) => s + l.total_revenue, 0);
                  const pct = total > 0 ? ((loc.total_revenue / total) * 100).toFixed(0) : "0";
                  return (
                    <div key={loc.location_name} className="flex items-center gap-2 text-[11px]">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-gray-700 dark:text-gray-300 flex-1 truncate">{loc.location_name}</span>
                      <span className="text-gray-500 font-medium">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="h-[160px] flex items-center justify-center text-[12px] text-gray-400">No location data</div>
          )}
        </div>
      </div>

      {/* Bottom Row: Top Products + Alert Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Products */}
        <div className="bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-[#2d3748] rounded-2xl p-6 card-hover animate-bounce-in stagger-4">
          <h2 className="text-[14px] font-semibold text-gray-900 dark:text-gray-50 mb-1">Top Selling Products</h2>
          <p className="text-[11px] text-gray-500 mb-4">By quantity sold (last 30 days)</p>
          {salesByProduct.data && salesByProduct.data.length > 0 ? (
            <div className="space-y-3">
              {salesByProduct.data.slice(0, 5).map((p, i) => {
                const maxQty = salesByProduct.data![0].total_quantity;
                const pct = maxQty > 0 ? (p.total_quantity / maxQty) * 100 : 0;
                return (
                  <div key={`${p.product_name}-${p.variation_name}`}>
                    <div className="flex items-center justify-between text-[12px] mb-1">
                      <span className="text-gray-700 dark:text-gray-300">{p.product_name} {p.variation_name}</span>
                      <span className="text-gray-500 font-medium">{p.total_quantity} units</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-[150px] flex items-center justify-center text-[12px] text-gray-400">No product data</div>
          )}
        </div>

        {/* Fraud Alert Summary */}
        <div className="bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-[#2d3748] rounded-2xl p-6 card-hover animate-bounce-in stagger-4">
          <h2 className="text-[14px] font-semibold text-gray-900 dark:text-gray-50 mb-1">Security Overview</h2>
          <p className="text-[11px] text-gray-500 mb-4">Anomaly detection status</p>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
              <div>
                <p className="text-[11px] text-gray-500 uppercase">Unreviewed Alerts</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-50 mt-1">{alertCount}</p>
              </div>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                alertCount === 0 ? "bg-green-100 dark:bg-green-500/20" : "bg-warning-100 dark:bg-warning-500/20"
              }`}>
                <span className="text-lg">{alertCount === 0 ? "✓" : "⚠"}</span>
              </div>
            </div>
            <p className="text-[12px] text-gray-600 dark:text-gray-400 leading-relaxed">
              {alertCount === 0
                ? "All clear — no suspicious transactions pending review. The AI fraud detection system is actively monitoring all POS and ecommerce transactions."
                : `${alertCount} transaction${alertCount > 1 ? "s" : ""} flagged by the AI as potentially suspicious.`
              }
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Components ──

function MetricCard({
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

// ═══════════════════════════════════════════════════════
// MANAGER DASHBOARD — Operational overview with sync & system status
// ═══════════════════════════════════════════════════════

function ManagerDashboard() {
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

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const todayRevenue = useQuery({
    queryKey: ["analytics", "today", today],
    queryFn: () => fetchRevenue("day", today, today),
    refetchInterval: 60000,
  });

  const totalSalesToday = todayRevenue.data?.[0]?.total_revenue ?? null;
  const totalOrdersToday = todayRevenue.data?.[0]?.total_orders ?? null;

  const activeAlerts = useQuery({
    queryKey: ["alerts", "active-count"],
    queryFn: () => fetchAlerts({ status: "New", page: 1 }),
    refetchInterval: 30000,
  });
  const alertCount = activeAlerts.data?.total ?? 0;

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
      setTimeout(() => setSyncResult(null), 5000);
    }
  };

  return (
    <div className="space-y-6 page-enter">
      <div className="animate-fade-in">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Dashboard</h1>
        <p className="text-[13px] text-gray-500 mt-1">System overview and key metrics at a glance</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard icon={<DollarSign size={18} />} label="Total Sales Today" value={totalSalesToday !== null ? `₱${totalSalesToday.toLocaleString()}` : "₱0.00"} sublabel={todayRevenue.isLoading ? "Loading..." : "Today's revenue"} iconColor="bg-brand-500/15 text-brand-400" delay={1} />
        <MetricCard icon={<ShoppingCart size={18} />} label="Total Orders Today" value={totalOrdersToday !== null ? `${totalOrdersToday}` : "0"} sublabel={todayRevenue.isLoading ? "Loading..." : "Orders processed"} iconColor="bg-purple-500/15 text-purple-500" delay={2} />
        <MetricCard icon={<ShieldAlert size={18} />} label="Active Alerts" value={activeAlerts.isLoading ? "..." : `${alertCount}`} sublabel={alertCount > 0 ? "Unreviewed anomalies" : "No active alerts"} iconColor="bg-warning-500/15 text-warning-400" delay={3} />
        <MetricCard icon={<Clock size={18} />} label="Last Data Sync" value={formatSyncTime(syncStatus.data?.last_sync_timestamp)} sublabel={syncStatus.data?.last_sync_timestamp ? `Every ${syncStatus.data.sync_interval_minutes} min` : "Awaiting first sync"} iconColor="bg-success-500/15 text-success-400" delay={4} />
      </div>

      {/* Data Sync Section */}
      <div className="bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-[#2d3748] rounded-2xl p-6 card-hover animate-bounce-in stagger-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900 dark:text-gray-50">Data Synchronization</h2>
            <p className="text-[12px] text-gray-500 mt-1">
              {syncStatus.data?.last_sync_timestamp
                ? `Last synced: ${new Date(syncStatus.data.last_sync_timestamp).toLocaleString()}`
                : "No sync performed yet"
              }
              {" • "}Auto-sync every {syncStatus.data?.sync_interval_minutes ?? 10} minutes
            </p>
          </div>
          <button onClick={handleSyncNow} disabled={syncing} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-semibold btn-press transition-all ${syncing ? "bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed" : "bg-brand-500 text-white hover:bg-brand-600 shadow-[0_2px_8px_rgba(70,95,255,0.25)]"}`}>
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing..." : "Sync Now"}
          </button>
        </div>
        {syncResult && (
          <div className="mt-3 px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-900 text-[12px] text-gray-700 dark:text-gray-300 animate-slide-up">
            {syncResult}
          </div>
        )}
      </div>

      {/* System Status */}
      <div className="bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-[#2d3748] rounded-2xl p-6 card-hover animate-bounce-in stagger-4">
        <h2 className="text-[15px] font-semibold text-gray-900 dark:text-gray-50 mb-4">System Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StatusItem label="Gateway" isOnline={gatewayHealth.isSuccess && gatewayHealth.data?.status === "healthy"} isLoading={gatewayHealth.isLoading} />
          <StatusItem label="AI Service" isOnline={aiHealth.isSuccess && aiHealth.data?.status === "healthy"} isLoading={aiHealth.isLoading} />
          <StatusItem label="Redis" isOnline={aiHealth.isSuccess && aiHealth.data?.dependencies?.redis === "connected"} isLoading={aiHealth.isLoading} />
        </div>
      </div>
    </div>
  );
}

function StatusItem({ label, isOnline, isLoading }: { label: string; isOnline: boolean; isLoading: boolean }) {
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
    <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-950 rounded-xl">
      <div className="relative">
        {isOnline ? <CircleCheck size={15} className="text-success-500" /> : <CircleX size={15} className="text-error-500" />}
      </div>
      <span className="text-[13px] text-gray-700 dark:text-gray-300">{label}</span>
      <span className={`ml-auto text-[12px] font-medium ${isOnline ? "text-success-500" : "text-error-500"}`}>
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
