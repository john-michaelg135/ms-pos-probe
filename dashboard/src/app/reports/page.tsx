"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, AreaChart, Area, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Printer, TrendingUp, ShieldAlert, Filter } from "lucide-react";
import {
  fetchForecast, fetchForecastInsights, fetchRevenue,
  fetchSalesByLocation, fetchSalesByProduct, fetchAlerts, fetchAnomalyMetrics,
} from "@/lib/api";
import { formatDate, formatDateShort } from "@/lib/format-date";
import { getVariationSortIndex } from "@/lib/variation-order";
import { useAnalyticsStore } from "@/stores/use-analytics-store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ToggleGroupPills } from "@/components/shared/ToggleGroupPills";
import {
  CHART_COLORS, AXIS_TICK, GRID_STROKE, tooltipContentStyle, tooltipLabelStyle,
} from "@/lib/chart-theme";

const REPORT_CATEGORIES = [
  { label: "All", value: "all" },
  { label: "Predictive Restocking", value: "forecast" },
  { label: "Anomaly Detection", value: "anomaly" },
];

const RANGE_OPTIONS = [
  { label: "7 Days", value: "7" },
  { label: "14 Days", value: "14" },
  { label: "30 Days", value: "30" },
];

function riskVariant(level: string): "destructive" | "warning" | "info" {
  if (level === "Critical" || level === "High") return "destructive";
  if (level === "Medium") return "warning";
  return "info";
}

export default function ReportsPage() {
  const [category, setCategory] = useState("all");
  const [rangeDays, setRangeDays] = useState(30);
  const { dateFrom, dateTo } = useAnalyticsStore();

  const forecast = useQuery({
    queryKey: ["report", "forecast", rangeDays],
    queryFn: () => fetchForecast(rangeDays),
    enabled: category === "all" || category === "forecast",
  });

  const forecastInsights = useQuery({
    queryKey: ["report", "forecast-insights", rangeDays],
    queryFn: () => fetchForecastInsights(rangeDays),
    enabled: (category === "all" || category === "forecast") && !!forecast.data,
  });

  const revenue = useQuery({
    queryKey: ["report", "revenue", dateFrom, dateTo],
    queryFn: () => fetchRevenue("day", dateFrom, dateTo),
    enabled: category === "all" || category === "forecast",
  });

  const salesByProduct = useQuery({
    queryKey: ["report", "product", dateFrom, dateTo],
    queryFn: () => fetchSalesByProduct(dateFrom, dateTo),
    enabled: category === "all" || category === "forecast",
  });

  const salesByLocation = useQuery({
    queryKey: ["report", "location", dateFrom, dateTo],
    queryFn: () => fetchSalesByLocation(dateFrom, dateTo),
    enabled: category === "all" || category === "forecast",
  });

  const alerts = useQuery({
    queryKey: ["report", "alerts", dateFrom, dateTo],
    queryFn: () => fetchAlerts({ date_from: dateFrom, date_to: dateTo, page: 1 }),
    enabled: category === "all" || category === "anomaly",
  });

  const anomalyMetrics = useQuery({
    queryKey: ["report", "anomaly-metrics"],
    queryFn: fetchAnomalyMetrics,
    enabled: category === "all" || category === "anomaly",
  });

  const forecastChartData = useMemo(() => {
    if (!forecast.data) return [];
    const grouped: Record<string, Record<string, number>> = {};
    forecast.data.forEach((item) => {
      if (!grouped[item.date]) grouped[item.date] = {};
      const label = `${item.product_name} ${item.variation_name}`;
      grouped[item.date][label] = item.predicted_quantity;
    });
    return Object.entries(grouped).map(([date, vals]) => ({ date, ...vals }));
  }, [forecast.data]);

  const forecastVariations = useMemo(() => {
    if (!forecast.data) return [];
    const set = new Set(forecast.data.map((d) => `${d.product_name} ${d.variation_name}`));
    return [...set].sort((a, b) => getVariationSortIndex(a) - getVariationSortIndex(b));
  }, [forecast.data]);

  const totalRevenue = revenue.data?.reduce((sum, d) => sum + d.total_revenue, 0) ?? 0;
  const totalOrders = revenue.data?.reduce((sum, d) => sum + d.total_orders, 0) ?? 0;

  const handlePrint = () => window.print();

  const reportDate = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Generated Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-generated analytical reports with charts and explanations
          </p>
        </div>
        <Button onClick={handlePrint}>
          <Printer className="w-4 h-4" />
          Print Report
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <ToggleGroupPills options={REPORT_CATEGORIES} value={category} onChange={setCategory} />
        </div>
        <ToggleGroupPills
          options={RANGE_OPTIONS}
          value={String(rangeDays)}
          onChange={(v) => setRangeDays(Number(v))}
        />
      </div>

      {/* Print header */}
      <div className="hidden print:block print:mb-6">
        <h1 className="text-2xl font-bold text-center">Bren Raphael&apos;s Ube Halaya &amp; Jam Company</h1>
        <h2 className="text-lg text-center text-muted-foreground mt-1">
          {category === "forecast" ? "Predictive Restocking Report" :
           category === "anomaly" ? "Anomaly Detection Report" :
           "POS-PROBE Analytics Report"}
        </h2>
        <p className="text-sm text-center text-muted-foreground mt-1">
          Generated on {reportDate} • Period: {formatDate(dateFrom)} – {formatDate(dateTo)} ({rangeDays} days)
        </p>
        <p className="text-xs text-center text-muted-foreground mt-0.5">Generated by POS-PROBE AI System</p>
      </div>

      {/* ══ PREDICTIVE RESTOCKING SECTION ══ */}
      {(category === "all" || category === "forecast") && (
        <>
          <SectionHeader
            icon={<TrendingUp className="w-4 h-4 text-brand-500" />}
            title="Predictive Restocking Analysis"
            subtitle="AI-driven demand forecasting and restocking recommendations"
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard label="Total Revenue" value={`₱${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} sublabel={`${dateFrom} to ${dateTo}`} />
            <MetricCard label="Total Orders" value={`${totalOrders.toLocaleString()}`} sublabel="Orders processed" />
            <MetricCard label="Forecast Window" value={`Next ${rangeDays} Days`} sublabel="Predicted demand period" />
          </div>

          {forecast.data && forecast.data.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Demand Forecast (Next {rangeDays} Days)</CardTitle>
                <CardDescription>
                  Predicted daily customer demand per product variation, used to determine optimal restocking quantities.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={forecastChartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis dataKey="date" tick={AXIS_TICK} tickFormatter={formatDateShort} />
                    <YAxis tick={AXIS_TICK} />
                    <Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} labelFormatter={(l) => formatDate(String(l))} />
                    {forecastVariations.map((name, i) => (
                      <Area key={name} type="monotone" dataKey={name} stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.05} strokeWidth={2} dot={false} />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                  {forecastVariations.map((name, i) => (
                    <div key={name} className="flex items-center gap-1.5">
                      <div className="w-2.5 h-[2px] rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="text-[10px] text-muted-foreground">{name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {forecastInsights.data && (
            <Card>
              <CardHeader>
                <CardTitle>AI Analysis Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                <p><strong className="text-foreground">Model Confidence:</strong> {forecastInsights.data.model_baseline}</p>
                <p><strong className="text-foreground">Demand Drivers:</strong> {forecastInsights.data.demand_drivers}</p>
                <p><strong className="text-foreground">Stockout Risk:</strong> {forecastInsights.data.stockout_risk}</p>
                <p><strong className="text-foreground">Safety Stock:</strong> {forecastInsights.data.safety_stock}</p>
                <div className="flex items-center gap-2">
                  <strong className="text-foreground">Velocity Class:</strong>
                  <Badge
                    variant={
                      forecastInsights.data.velocity_class.includes("Fast") ? "success" :
                      forecastInsights.data.velocity_class.includes("Moderate") ? "info" : "secondary"
                    }
                  >
                    {forecastInsights.data.velocity_class}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {salesByProduct.data && salesByProduct.data.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Historical Sales by Product</CardTitle>
                <CardDescription>Units sold per variation in the selected period — informs restocking priorities.</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(200, salesByProduct.data.length * 45)}>
                  <BarChart data={salesByProduct.data.map((d) => { const name = `${d.product_name} ${d.variation_name}`; return { name, quantity: d.total_quantity, color: CHART_COLORS[getVariationSortIndex(name) % CHART_COLORS.length] }; })} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                    <XAxis type="number" tick={AXIS_TICK} />
                    <YAxis type="category" dataKey="name" tick={AXIS_TICK} width={180} />
                    <Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} />
                    <Bar dataKey="quantity" radius={[0, 4, 4, 0]}>
                      {salesByProduct.data.map((d) => { const name = `${d.product_name} ${d.variation_name}`; return <Cell key={name} fill={CHART_COLORS[getVariationSortIndex(name) % CHART_COLORS.length]} />; })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {salesByLocation.data && salesByLocation.data.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Sales by Location</CardTitle>
                <CardDescription>Revenue distribution across branches — helps plan location-specific restocking.</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(180, salesByLocation.data.length * 50)}>
                  <BarChart data={salesByLocation.data} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                    <XAxis type="number" tick={AXIS_TICK} tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="location_name" tick={AXIS_TICK} width={170} />
                    <Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} formatter={(v) => [`₱${Number(v).toLocaleString()}`, "Revenue"]} />
                    <Bar dataKey="total_revenue" radius={[0, 4, 4, 0]}>
                      {salesByLocation.data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ══ ANOMALY DETECTION SECTION ══ */}
      {(category === "all" || category === "anomaly") && (
        <>
          <SectionHeader
            icon={<ShieldAlert className="w-4 h-4 text-destructive" />}
            title="Anomaly Detection Analysis"
            subtitle="Isolation Forest fraud detection results and alert summary"
          />

          {anomalyMetrics.data?.metrics && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <MetricCard label="Precision" value={`${(anomalyMetrics.data.metrics.precision * 100).toFixed(1)}%`} sublabel="True positive rate" />
              <MetricCard label="Recall" value={`${(anomalyMetrics.data.metrics.recall * 100).toFixed(1)}%`} sublabel="Detection rate" />
              <MetricCard label="F1-Score" value={`${(anomalyMetrics.data.metrics.f1_score * 100).toFixed(1)}%`} sublabel="Balanced accuracy" />
              <MetricCard label="Contamination" value={`${(anomalyMetrics.data.contamination * 100).toFixed(0)}%`} sublabel="Expected anomaly rate" />
            </div>
          )}

          {anomalyMetrics.data?.metrics?.confusion_matrix && (
            <Card>
              <CardHeader>
                <CardTitle>Confusion Matrix</CardTitle>
                <CardDescription>Classification performance of the Isolation Forest anomaly detection model.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 max-w-[320px]">
                  <ConfusionCell label="True Negative" value={anomalyMetrics.data.metrics.confusion_matrix.true_negative} tone="success" />
                  <ConfusionCell label="False Positive" value={anomalyMetrics.data.metrics.confusion_matrix.false_positive} tone="destructive" />
                  <ConfusionCell label="False Negative" value={anomalyMetrics.data.metrics.confusion_matrix.false_negative} tone="warning" />
                  <ConfusionCell label="True Positive" value={anomalyMetrics.data.metrics.confusion_matrix.true_positive} tone="success" />
                </div>
                <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
                  The Isolation Forest model identifies anomalous POS transactions by learning normal behavior patterns.
                  True Positives are correctly detected anomalies (e.g., fraudulent refunds, discount abuse).
                  The model uses {(anomalyMetrics.data.contamination * 100).toFixed(0)}% contamination rate,
                  meaning it expects approximately {(anomalyMetrics.data.contamination * 100).toFixed(0)}% of transactions to be suspicious.
                </p>
              </CardContent>
            </Card>
          )}

          {alerts.data && (
            <Card>
              <CardHeader>
                <CardTitle>Alert Summary</CardTitle>
                <CardDescription>Flagged transactions during the selected period.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <SummaryStat label="Total Alerts" value={alerts.data.total} />
                  <SummaryStat label="High Risk" value={alerts.data.alerts.filter((a) => a.risk_level === "High" || a.risk_level === "Critical").length} tone="destructive" />
                  <SummaryStat label="Reviewed" value={alerts.data.alerts.filter((a) => a.status === "Reviewed" || a.status === "Resolved").length} tone="success" />
                </div>
                {alerts.data.alerts.length > 0 && (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order ID</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-center">Risk</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {alerts.data.alerts.slice(0, 10).map((alert) => (
                          <TableRow key={alert.alert_id}>
                            <TableCell className="font-mono text-xs">{alert.order_id.slice(0, 8)}…</TableCell>
                            <TableCell className="text-right">₱{alert.transaction_amount.toLocaleString()}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant={riskVariant(alert.risk_level)}>{alert.risk_level}</Badge>
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate text-muted-foreground">{alert.reason}</TableCell>
                            <TableCell className="text-center text-muted-foreground">{alert.status}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {alerts.data.total > 10 && (
                      <p className="text-xs text-muted-foreground mt-2">Showing 10 of {alerts.data.total} alerts</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Print footer */}
      <div className="hidden print:block print:mt-8 border-t border-border pt-4">
        <p className="text-[10px] text-muted-foreground text-center">
          This report was auto-generated by the POS-PROBE AI system on {reportDate}.
          Data sourced from the Capstone POS &amp; Ecommerce platform via the 10-minute sync pipeline.
        </p>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">{icon}</div>
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sublabel }: { label: string; value: string; sublabel: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-[10px] text-muted-foreground uppercase font-medium">{label}</p>
        <p className="text-xl font-bold text-foreground mt-1">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>
      </CardContent>
    </Card>
  );
}

function ConfusionCell({ label, value, tone }: { label: string; value: number; tone: "success" | "destructive" | "warning" }) {
  const toneClass =
    tone === "success" ? "text-success bg-success/10" :
    tone === "destructive" ? "text-destructive bg-destructive/10" :
    "text-warning bg-warning/10";
  return (
    <div className={`rounded-xl p-3 text-center ${toneClass.split(" ")[1]}`}>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${toneClass.split(" ")[0]}`}>{value.toLocaleString()}</p>
    </div>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: number; tone?: "destructive" | "success" }) {
  const color = tone === "destructive" ? "text-destructive" : tone === "success" ? "text-success" : "text-foreground";
  return (
    <div className="bg-muted/50 rounded-xl p-4">
      <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
