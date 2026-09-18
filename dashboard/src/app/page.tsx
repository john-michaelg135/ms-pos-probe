"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DollarSign, ShoppingCart, TrendingUp, Package,
  ShieldAlert, Clock, CircleCheck, CircleX, RefreshCw,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import {
  fetchRevenue, fetchSalesByLocation, fetchSalesByProduct, fetchAlerts, fetchForecast,
  fetchGatewayHealth, fetchAiServiceHealth, fetchSyncStatus, triggerForceSync,
} from "@/lib/api";
import { useAuthStore } from "@/stores/use-auth-store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CHART_COLORS, AXIS_TICK, GRID_STROKE, tooltipContentStyle,
} from "@/lib/chart-theme";

export default function HomePage() {
  const { user } = useAuthStore();
  if (user?.role === "manager") return <ManagerDashboard />;
  return <OwnerDashboard />;
}

// ── Owner Dashboard ──
function OwnerDashboard() {
  const { user } = useAuthStore();

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dateFrom = `${thirtyDaysAgo.getFullYear()}-${String(thirtyDaysAgo.getMonth() + 1).padStart(2, "0")}-${String(thirtyDaysAgo.getDate()).padStart(2, "0")}`;
  const dateTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const revenue = useQuery({ queryKey: ["dashboard", "revenue", dateFrom, dateTo], queryFn: () => fetchRevenue("day", dateFrom, dateTo), refetchInterval: 60000 });
  const weeklyRevenue = useQuery({ queryKey: ["dashboard", "revenue-weekly", dateFrom, dateTo], queryFn: () => fetchRevenue("week", dateFrom, dateTo) });
  const salesByLocation = useQuery({ queryKey: ["dashboard", "location", dateFrom, dateTo], queryFn: () => fetchSalesByLocation(dateFrom, dateTo) });
  const salesByProduct = useQuery({ queryKey: ["dashboard", "product", dateFrom, dateTo], queryFn: () => fetchSalesByProduct(dateFrom, dateTo) });
  const alerts = useQuery({ queryKey: ["dashboard", "alerts"], queryFn: () => fetchAlerts({ status: "New", page: 1 }), refetchInterval: 30000 });
  const forecast = useQuery({ queryKey: ["dashboard", "forecast-7"], queryFn: () => fetchForecast(7) });

  const totalRevenue = revenue.data?.reduce((sum, d) => sum + d.total_revenue, 0) ?? 0;
  const totalOrders = revenue.data?.reduce((sum, d) => sum + d.total_orders, 0) ?? 0;
  const totalQuantity = revenue.data?.reduce((sum, d) => sum + d.total_quantity, 0) ?? 0;
  const alertCount = alerts.data?.total ?? 0;
  const topProduct = salesByProduct.data?.length
    ? salesByProduct.data.reduce((top, p) => p.total_quantity > top.total_quantity ? p : top, salesByProduct.data[0])
    : null;
  const forecastTotal = forecast.data?.reduce((sum, d) => sum + d.predicted_quantity, 0) ?? 0;

  const locationPieData = salesByLocation.data?.map((loc) => ({ name: loc.location_name, value: loc.total_revenue })) ?? [];
  const weeklyBarData = weeklyRevenue.data?.map((d) => ({ week: d.period, revenue: d.total_revenue })) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Welcome back{user ? `, ${user.displayName}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Here&apos;s your business overview for the last 30 days
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard icon={<DollarSign className="w-4 h-4" />} label="Total Revenue" value={`₱${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} sublabel="Last 30 days" iconColor="bg-brand-500/15 text-brand-500" />
        <MetricCard icon={<ShoppingCart className="w-4 h-4" />} label="Total Orders" value={`${totalOrders.toLocaleString()}`} sublabel={`${totalQuantity} units sold`} iconColor="bg-purple-500/15 text-purple-500" />
        <MetricCard icon={<TrendingUp className="w-4 h-4" />} label="Predicted Demand" value={`${forecastTotal} units`} sublabel="Next 7 days (all products)" iconColor="bg-info/15 text-info" />
        <MetricCard icon={<Package className="w-4 h-4" />} label="Top Product" value={topProduct ? `${topProduct.product_name}` : "—"} sublabel={topProduct ? `${topProduct.variation_name} • ${topProduct.total_quantity} units` : "No data"} iconColor="bg-success/15 text-success" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Weekly Revenue</CardTitle>
            <CardDescription>Revenue trend by week</CardDescription>
          </CardHeader>
          <CardContent>
            {weeklyBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weeklyBarData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="week" tick={AXIS_TICK} tickFormatter={(v) => { try { const d = new Date(v + "T00:00:00"); return `${d.getMonth() + 1}/${d.getDate()}`; } catch { return v; } }} />
                  <YAxis tick={AXIS_TICK} tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`} width={50} />
                  <Tooltip contentStyle={tooltipContentStyle} formatter={(v) => [`₱${Number(v).toLocaleString()}`, "Revenue"]} />
                  <Bar dataKey="revenue" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">No revenue data</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue by Branch</CardTitle>
            <CardDescription>Distribution across locations</CardDescription>
          </CardHeader>
          <CardContent>
            {locationPieData.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie data={locationPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} dataKey="value" label={false}>
                      {locationPieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipContentStyle} formatter={(v) => [`₱${Number(v).toLocaleString()}`, "Revenue"]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 flex-1">
                  {salesByLocation.data?.map((loc, i) => {
                    const total = salesByLocation.data!.reduce((s, l) => s + l.total_revenue, 0);
                    const pct = total > 0 ? ((loc.total_revenue / total) * 100).toFixed(0) : "0";
                    return (
                      <div key={loc.location_name} className="flex items-center gap-2 text-xs">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-foreground flex-1 truncate">{loc.location_name}</span>
                        <span className="text-muted-foreground font-medium">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="h-[160px] flex items-center justify-center text-sm text-muted-foreground">No location data</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Top Selling Products</CardTitle>
            <CardDescription>By quantity sold (last 30 days)</CardDescription>
          </CardHeader>
          <CardContent>
            {salesByProduct.data && salesByProduct.data.length > 0 ? (
              <div className="space-y-3">
                {salesByProduct.data.slice(0, 5).map((p, i) => {
                  const maxQty = salesByProduct.data![0].total_quantity;
                  const pct = maxQty > 0 ? (p.total_quantity / maxQty) * 100 : 0;
                  return (
                    <div key={`${p.product_name}-${p.variation_name}`}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-foreground">{p.product_name} {p.variation_name}</span>
                        <span className="text-muted-foreground font-medium">{p.total_quantity} units</span>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-[150px] flex items-center justify-center text-sm text-muted-foreground">No product data</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security Overview</CardTitle>
            <CardDescription>Anomaly detection status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-xl">
              <div>
                <p className="text-xs text-muted-foreground uppercase">Unreviewed Alerts</p>
                <p className="text-2xl font-bold text-foreground mt-1">{alertCount}</p>
              </div>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${alertCount === 0 ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                <span className="text-lg">{alertCount === 0 ? "✓" : "⚠"}</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {alertCount === 0
                ? "All clear — no suspicious transactions pending review. The AI fraud detection system is actively monitoring all POS and ecommerce transactions."
                : `${alertCount} transaction${alertCount > 1 ? "s" : ""} flagged by the AI as potentially suspicious.`}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, sublabel, iconColor }: { icon: React.ReactNode; label: string; value: string; sublabel: string; iconColor: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconColor}`}>{icon}</div>
          <span className="text-sm text-muted-foreground font-medium">{label}</span>
        </div>
        <p className="text-xl font-semibold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{sublabel}</p>
      </CardContent>
    </Card>
  );
}

// ── Manager Dashboard ──
function ManagerDashboard() {
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const gatewayHealth = useQuery({ queryKey: ["health", "gateway"], queryFn: fetchGatewayHealth, refetchInterval: 30000 });
  const aiHealth = useQuery({ queryKey: ["health", "ai-service"], queryFn: fetchAiServiceHealth, refetchInterval: 30000 });
  const syncStatus = useQuery({ queryKey: ["sync", "status"], queryFn: fetchSyncStatus, refetchInterval: 60000 });

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const todayRevenue = useQuery({ queryKey: ["analytics", "today", today], queryFn: () => fetchRevenue("day", today, today), refetchInterval: 60000 });

  const totalSalesToday = todayRevenue.data?.[0]?.total_revenue ?? null;
  const totalOrdersToday = todayRevenue.data?.[0]?.total_orders ?? null;

  const activeAlerts = useQuery({ queryKey: ["alerts", "active-count"], queryFn: () => fetchAlerts({ status: "New", page: 1 }), refetchInterval: 30000 });
  const alertCount = activeAlerts.data?.total ?? 0;

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await triggerForceSync();
      if (result.error) setSyncResult(`⚠️ ${result.error}`);
      else setSyncResult(`✅ Synced ${result.total_rows_synced} rows in ${result.sync_duration_seconds}s`);
      queryClient.invalidateQueries({ queryKey: ["sync"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    } catch (err: unknown) {
      const error = err as { message?: string; status?: number };
      if (error.status === 429) setSyncResult("⏳ Rate limited — try again in a few minutes");
      else setSyncResult(`❌ ${error.message || "Sync failed"}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncResult(null), 5000);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">System overview and key metrics at a glance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard icon={<DollarSign className="w-4 h-4" />} label="Total Sales Today" value={totalSalesToday !== null ? `₱${totalSalesToday.toLocaleString()}` : "₱0.00"} sublabel={todayRevenue.isLoading ? "Loading…" : "Today's revenue"} iconColor="bg-brand-500/15 text-brand-500" />
        <MetricCard icon={<ShoppingCart className="w-4 h-4" />} label="Total Orders Today" value={totalOrdersToday !== null ? `${totalOrdersToday}` : "0"} sublabel={todayRevenue.isLoading ? "Loading…" : "Orders processed"} iconColor="bg-purple-500/15 text-purple-500" />
        <MetricCard icon={<ShieldAlert className="w-4 h-4" />} label="Active Alerts" value={activeAlerts.isLoading ? "…" : `${alertCount}`} sublabel={alertCount > 0 ? "Unreviewed anomalies" : "No active alerts"} iconColor="bg-warning/15 text-warning" />
        <MetricCard icon={<Clock className="w-4 h-4" />} label="Last Data Sync" value={formatSyncTime(syncStatus.data?.last_sync_timestamp)} sublabel={syncStatus.data?.last_sync_timestamp ? `Every ${syncStatus.data.sync_interval_minutes} min` : "Awaiting first sync"} iconColor="bg-success/15 text-success" />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">Data Synchronization</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {syncStatus.data?.last_sync_timestamp
                  ? `Last synced: ${new Date(syncStatus.data.last_sync_timestamp).toLocaleString()}`
                  : "No sync performed yet"}
                {" • "}Auto-sync every {syncStatus.data?.sync_interval_minutes ?? 10} minutes
              </p>
            </div>
            <Button onClick={handleSyncNow} disabled={syncing}>
              <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Sync Now"}
            </Button>
          </div>
          {syncResult && (
            <div className="mt-3 px-4 py-2.5 rounded-xl bg-muted/50 text-sm text-foreground">
              {syncResult}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>System Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <StatusItem label="Gateway" isOnline={gatewayHealth.isSuccess && gatewayHealth.data?.status === "healthy"} isLoading={gatewayHealth.isLoading} />
            <StatusItem label="AI Service" isOnline={aiHealth.isSuccess && aiHealth.data?.status === "healthy"} isLoading={aiHealth.isLoading} />
            <StatusItem label="Redis" isOnline={aiHealth.isSuccess && aiHealth.data?.dependencies?.redis === "connected"} isLoading={aiHealth.isLoading} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusItem({ label, isOnline, isLoading }: { label: string; isOnline: boolean; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-muted/50 rounded-xl">
        <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/40 animate-pulse" />
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="ml-auto text-sm text-muted-foreground">Checking…</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-muted/50 rounded-xl">
      {isOnline ? <CircleCheck className="w-4 h-4 text-success" /> : <CircleX className="w-4 h-4 text-destructive" />}
      <span className="text-sm text-foreground">{label}</span>
      <span className={`ml-auto text-sm font-medium ${isOnline ? "text-success" : "text-destructive"}`}>
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
    const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return date.toLocaleDateString();
  } catch {
    return "—";
  }
}
