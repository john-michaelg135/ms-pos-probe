"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight, DollarSign, ShoppingCart, ListChecks, Target,
  ShieldAlert, Clock, CircleCheck, CircleX, RefreshCw,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  fetchRevenue, fetchAlerts, fetchForecast, fetchForecastBacktest, fetchAnomalyMetrics,
  fetchGatewayHealth, fetchAiServiceHealth, fetchSyncStatus, triggerForceSync,
} from "@/lib/api";
import { useAuthStore } from "@/stores/use-auth-store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CHART_COLORS, AXIS_TICK, GRID_STROKE, tooltipContentStyle, tooltipLabelStyle, formatAvgUnits, AVG_UNITS_AXIS_LABEL,
} from "@/lib/chart-theme";
import { formatDate, formatDateShort } from "@/lib/format-date";
import { getVariationSortIndex } from "@/lib/variation-order";
import { canAccessRoute } from "@/lib/auth/roles";
import { PageLocationBadge, useLockedLocation } from "@/components/shared/PageLocationBadge";

export default function HomePage() {
  const { user } = useAuthStore();
  if (user?.role === "manager") return <ManagerDashboard />;
  return <OwnerDashboard />;
}

// ── Owner Dashboard ──
// The POS dashboard already covers sales and revenue, so this one shows only what the probe adds:
// tomorrow's production, suspicious transactions, and whether the models and data can be trusted.

const isoDate = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const greeting = (date: Date) => {
  const hour = date.getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
};

const units = (value: number) => Math.round(value).toLocaleString("en-PH");

const HALAYA = "Ube Halaya";
const JAM = "Ube Jam";
const PRODUCT_COLORS = { [HALAYA]: CHART_COLORS[0], [JAM]: CHART_COLORS[1] };

function OwnerDashboard() {
  const { user } = useAuthStore();
  const tomorrow = isoDate(1);

  // Forecasts and model scores change slowly; alerts and sync are checked every couple of minutes.
  const forecast = useQuery({ queryKey: ["dashboard", "forecast", 7], queryFn: () => fetchForecast(7), staleTime: 10 * 60_000 });
  const alerts = useQuery({ queryKey: ["dashboard", "alerts-new"], queryFn: () => fetchAlerts({ status: "New", page: 1 }), refetchInterval: 120_000 });
  const backtest = useQuery({ queryKey: ["dashboard", "backtest"], queryFn: fetchForecastBacktest, staleTime: 30 * 60_000 });
  const anomalyMetrics = useQuery({ queryKey: ["dashboard", "anomaly-metrics"], queryFn: fetchAnomalyMetrics, staleTime: 30 * 60_000 });
  const syncStatus = useQuery({ queryKey: ["sync", "status"], queryFn: fetchSyncStatus, refetchInterval: 120_000 });
  const gatewayHealth = useQuery({ queryKey: ["health", "gateway"], queryFn: fetchGatewayHealth, refetchInterval: 120_000 });
  const aiHealth = useQuery({ queryKey: ["health", "ai-service"], queryFn: fetchAiServiceHealth, refetchInterval: 120_000 });

  // Tomorrow's quota: recommended production (covers demand on ~9 days in 10), as on the Restocking Quota page.
  const quota = useMemo(
    () =>
      (forecast.data ?? [])
        .filter((item) => item.date === tomorrow)
        .map((item) => ({ ...item, recommended: item.recommended_quantity }))
        .sort((a, b) => getVariationSortIndex(undefined, a.variation_id) - getVariationSortIndex(undefined, b.variation_id)),
    [forecast.data, tomorrow],
  );
  const quotaHalaya = quota.filter((q) => q.product_name === HALAYA).reduce((sum, q) => sum + q.recommended, 0);
  const quotaJam = quota.filter((q) => q.product_name === JAM).reduce((sum, q) => sum + q.recommended, 0);

  // Next 7 days, predicted units per product.
  const outlook = useMemo(() => {
    const byDate = new Map<string, { date: string; [HALAYA]: number; [JAM]: number }>();
    for (const item of forecast.data ?? []) {
      const row = byDate.get(item.date) ?? { date: item.date, [HALAYA]: 0, [JAM]: 0 };
      if (item.product_name === HALAYA || item.product_name === JAM) row[item.product_name] += item.predicted_quantity;
      byDate.set(item.date, row);
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 7);
  }, [forecast.data]);
  const outlookTotal = outlook.reduce((sum, d) => sum + d[HALAYA] + d[JAM], 0);

  const alertList = alerts.data?.alerts ?? [];
  const alertTotal = alerts.data?.total ?? 0;
  const highRisk = alertList.filter((a) => a.risk_level === "High" || a.risk_level === "Critical").length;

  const overall = backtest.data?.overall;
  const anomaly = anomalyMetrics.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {greeting(new Date())}{user ? `, ${user.displayName.split(" ")[0]}` : ""}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>What to make next, what looks suspicious, and how far to trust the predictions</span>
          <span aria-hidden>·</span>
          <PageLocationBadge />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <LinkMetricCard
          href="/forecast/quota"
          icon={<ListChecks className="w-4 h-4" />}
          iconColor="bg-brand-500/15 text-brand-500"
          label="Make tomorrow"
          value={forecast.isLoading ? "…" : quota.length ? `${units(quotaHalaya + quotaJam)} units` : "—"}
          sublabel={quota.length ? `${HALAYA} ${units(quotaHalaya)} · ${JAM} ${units(quotaJam)}` : forecast.isLoading ? "Loading…" : "No forecast for tomorrow"}
        />
        <LinkMetricCard
          href="/alerts"
          icon={<ShieldAlert className="w-4 h-4" />}
          iconColor={alertTotal > 0 ? "bg-warning/15 text-warning" : "bg-success/15 text-success"}
          label="Alerts to review"
          value={alerts.isLoading ? "…" : units(alertTotal)}
          sublabel={
            alertTotal === 0 ? "Nothing waiting"
            : alertTotal > alertList.length ? `${highRisk} high risk in the latest ${alertList.length}`
            : `${highRisk} high risk`
          }
        />
        <LinkMetricCard
          href="/accuracy"
          icon={<Target className="w-4 h-4" />}
          iconColor="bg-info/15 text-info"
          label="Forecast miss"
          value={overall?.avg_mae != null ? `±${overall.avg_mae} units/day` : backtest.isLoading ? "…" : "—"}
          sublabel={overall?.total ? `${overall.passed} of ${overall.total} variations beat last week's pattern` : "Average miss vs actual sales"}
        />
        <LinkMetricCard
          icon={<Clock className="w-4 h-4" />}
          iconColor="bg-success/15 text-success"
          label="Data last synced"
          value={formatSyncTime(syncStatus.data?.last_sync_timestamp)}
          sublabel={syncStatus.data?.last_sync_timestamp ? `From the POS every ${syncStatus.data.sync_interval_minutes} min` : "Awaiting first sync"}
        />
      </div>

        <Card>
          <CardHeader>
            <CardTitle>Demand outlook</CardTitle>
            <CardDescription>Predicted units per day for the next 7 days{outlookTotal > 0 ? ` · ${units(outlookTotal)} units in all` : ""}</CardDescription>
          </CardHeader>
          <CardContent>
            {outlook.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={outlook} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="date" tick={AXIS_TICK} tickFormatter={formatDateShort} />
                    <YAxis tick={AXIS_TICK} width={40} allowDecimals={false} tickFormatter={(v) => formatAvgUnits(Number(v))} label={AVG_UNITS_AXIS_LABEL} />
                    <Tooltip
                      contentStyle={tooltipContentStyle}
                      labelStyle={tooltipLabelStyle}
                      labelFormatter={(l) => formatDate(String(l))}
                      formatter={(v, name) => [`${formatAvgUnits(Number(v))} units`, String(name)]}
                    />
                    <Bar dataKey={HALAYA} stackId="units" fill={PRODUCT_COLORS[HALAYA]} />
                    <Bar dataKey={JAM} stackId="units" fill={PRODUCT_COLORS[JAM]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                  {[HALAYA, JAM].map((name) => (
                    <span key={name} className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: PRODUCT_COLORS[name as typeof HALAYA] }} />
                      {name}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
                {forecast.isLoading ? "Loading forecast…" : "No forecast available"}
              </div>
            )}
          </CardContent>
        </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Alerts waiting for review</CardTitle>
            <CardDescription>Transactions the anomaly model flagged as unusual, newest first</CardDescription>
          </CardHeader>
          <CardContent>
            {alertList.length > 0 ? (
              <ul className="divide-y divide-border m-0 p-0 list-none">
                {alertList.slice(0, 5).map((a) => (
                  <li key={a.alert_id} className="flex items-start gap-3 py-3 first:pt-0">
                    <Badge variant={a.risk_level === "High" || a.risk_level === "Critical" ? "destructive" : a.risk_level === "Medium" ? "warning" : "info"} className="shrink-0 mt-0.5">
                      {a.risk_level}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground m-0 truncate">{a.reason}</p>
                      <p className="text-xs text-muted-foreground m-0 mt-0.5 truncate">
                        {[a.location_name, a.cashier_name, formatDate(a.detected_at.slice(0, 10))].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-foreground shrink-0">
                      ₱{a.transaction_amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-8">
                <CircleCheck className="w-8 h-8 text-success mb-2" />
                <p className="text-sm font-semibold text-foreground m-0">{alerts.isLoading ? "Checking…" : "All clear"}</p>
                {!alerts.isLoading && <p className="text-xs text-muted-foreground m-0 mt-1">No flagged transactions are waiting.</p>}
              </div>
            )}
            {alertTotal > 0 && <CardLink href="/alerts">Review {alertTotal > 5 ? `all ${units(alertTotal)} alerts` : "alerts"}</CardLink>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Can you trust it?</CardTitle>
            <CardDescription>Model scores and system status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <HealthRow
              label="Demand forecast"
              detail={overall?.total
                ? `Misses by ${overall.avg_mae} units/day${overall.avg_coverage != null ? ` · in range ${overall.avg_coverage}% of days` : ""}`
                : "Not evaluated yet"}
              ok={overall?.overall_pass}
              loading={backtest.isLoading}
            />
            <HealthRow
              label="Anomaly detection"
              detail={anomaly?.metrics ? `F1 ${(anomaly.metrics.f1_score * 100).toFixed(1)}% · recall ${(anomaly.metrics.recall * 100).toFixed(1)}%` : "Not evaluated yet"}
              ok={anomaly?.overall_pass}
              loading={anomalyMetrics.isLoading}
            />
            <HealthRow
              label="Probe services"
              detail="Gateway, AI service and cache"
              ok={gatewayHealth.isSuccess && aiHealth.isSuccess
                ? gatewayHealth.data?.status === "healthy" && aiHealth.data?.status === "healthy" && aiHealth.data?.dependencies?.redis === "connected"
                : gatewayHealth.isError || aiHealth.isError ? false : undefined}
              loading={gatewayHealth.isLoading || aiHealth.isLoading}
              okText="Online"
              badText="Check"
            />
            <CardLink href="/accuracy">See model accuracy</CardLink>
            <CardLink href="/reports">Open the AI reports</CardLink>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** True when the signed-in role may open this page; links to pages they can't open are left out. */
function useCanOpen(href: string | undefined) {
  const role = useAuthStore((state) => state.user?.role);
  return !!href && canAccessRoute(role, href);
}

function LinkMetricCard({ href, ...props }: { href?: string; icon: React.ReactNode; label: string; value: string; sublabel: string; iconColor: string }) {
  const canOpen = useCanOpen(href);
  if (!href || !canOpen) return <MetricCard {...props} />;
  return (
    <Link href={href} className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <MetricCard {...props} action={<ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />} />
    </Link>
  );
}

function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  const canOpen = useCanOpen(href);
  if (!canOpen) return null;
  return (
    <Link href={href} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline underline-offset-2">
      {children}
      <ArrowUpRight className="w-3.5 h-3.5" />
    </Link>
  );
}

function HealthRow({ label, detail, ok, loading, okText = "Passing", badText = "Below target" }: {
  label: string;
  detail: string;
  ok?: boolean;
  loading: boolean;
  okText?: string;
  badText?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-muted/50 rounded-xl">
      {loading || ok === undefined
        ? <span className="w-4 h-4 flex items-center justify-center"><span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/40" /></span>
        : ok ? <CircleCheck className="w-4 h-4 text-success shrink-0" /> : <CircleX className="w-4 h-4 text-destructive shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground m-0">{label}</p>
        <p className="text-xs text-muted-foreground m-0 truncate">{loading ? "Checking…" : detail}</p>
      </div>
      {!loading && ok !== undefined && (
        <span className={`text-xs font-semibold shrink-0 ${ok ? "text-success" : "text-destructive"}`}>{ok ? okText : badText}</span>
      )}
    </div>
  );
}

function MetricCard({ icon, label, value, sublabel, iconColor, action }: { icon: React.ReactNode; label: string; value: string; sublabel: string; iconColor: string; action?: React.ReactNode }) {
  return (
    <Card className="h-full">
      <CardContent className="pt-5">
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconColor}`}>{icon}</div>
          <span className="text-sm text-muted-foreground font-medium">{label}</span>
          {action && <span className="ml-auto">{action}</span>}
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
  // A manager's figures are for their branch only.
  const lockedLocation = useLockedLocation() ?? undefined;
  const todayRevenue = useQuery({ queryKey: ["analytics", "today", today, lockedLocation], queryFn: () => fetchRevenue("day", today, today, lockedLocation), refetchInterval: 60000 });

  const totalSalesToday = todayRevenue.data?.[0]?.total_revenue ?? null;
  const totalOrdersToday = todayRevenue.data?.[0]?.total_orders ?? null;

  const activeAlerts = useQuery({ queryKey: ["alerts", "active-count", lockedLocation], queryFn: () => fetchAlerts({ status: "New", page: 1, location_name: lockedLocation }), refetchInterval: 30000 });
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
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>System overview and key metrics at a glance</span>
          <span aria-hidden>·</span>
          <PageLocationBadge />
        </div>
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
            <div className="mt-3 px-4 py-2.5 rounded-xl bg-muted/50 text-sm text-gray-700 dark:text-gray-300">
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
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
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
