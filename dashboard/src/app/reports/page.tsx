"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, AreaChart, Area, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Printer, TrendingUp, ShieldAlert } from "lucide-react";
import {
  fetchForecast, fetchForecastInsights, fetchRevenue,
  fetchSalesByProduct, fetchAlerts, fetchAnomalyMetrics,
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
  variationColor, AXIS_TICK, GRID_STROKE, tooltipContentStyle, tooltipLabelStyle,
} from "@/lib/chart-theme";
import { PageLocationBadge, useLockedLocation } from "@/components/shared/PageLocationBadge";
import { PrintSignDialog } from "@/components/shared/PrintSignDialog";
import { useAuthStore } from "@/stores/use-auth-store";
import {
  NUM, ReportDetailsStrip, ReportEmpty, ReportFigure, ReportNotes, ReportPrintFrame, ReportSection,
  ReportTable, TD, TH, TOTAL_ROW, TR,
} from "@/components/shared/ReportPrint";
import type { AlertItem, AnomalyMetricsResponse, ForecastInsightsResponse, ForecastItem, ProductSalesItem } from "@/lib/api";

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

const REPORT_TITLES: Record<string, string> = {
  all: "AI Analytics Report",
  forecast: "Predictive Restocking Report",
  anomaly: "Anomaly Detection Report",
};

/** Printed under "Notes to the report", and shown in the signing dialog before printing. */
function reportNotes(category: string, rangeDays: number, periodLabel: string): string[] {
  const notes = ["All amounts are in Philippine pesos (₱)."];
  if (category !== "anomaly") {
    notes.push(
      `Demand forecasts predict walk-in, bazaar and online units per day for the next ${rangeDays} days from past sales; institutional orders are booked ahead and not included. Each variation uses the method with the smallest errors on its own recent sales. The likely range is the 10th–90th percentile of past forecast errors, so actual demand should fall inside it on about 8 days in 10.`,
      `Revenue, orders and historical sales by product cover ${periodLabel}.`,
    );
  }
  if (category !== "forecast") {
    notes.push(
      "Each order is compared only with recent orders from the same channel (walk-in store, bazaar, institutional or online), so large institutional orders are not flagged for their size. Alerts come from POS process checks (such as the 20 kg institutional minimum, the 50% downpayment, payments recorded against Paid orders and self-approved refunds), amounts or units far outside the channel's usual range, and a per-channel Isolation Forest model. A flag means the transaction needs review; it is not proof of fraud.",
      "Precision, recall and F1-score come from the model's most recent training and measure agreement with proxy labels (orders far outside their channel's usual range), not a confirmed fraud rate.",
    );
  }
  notes.push("Data comes from the POS and e-commerce systems through a sync that runs every 10 minutes, so the last few minutes of activity may not be included.");
  return notes;
}

const peso = (value: number) =>
  `₱${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const count = (value: number) => value.toLocaleString("en-PH");
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

/** "October 1 – 31, 2026", like the POS report period. */
function formatPeriod(from: string, to: string) {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return `${formatDate(from)} – ${formatDate(to)}`;
  const month = (d: Date) => d.toLocaleDateString("en-PH", { month: "long" });
  if (a.getFullYear() === b.getFullYear()) {
    return a.getMonth() === b.getMonth()
      ? `${month(a)} ${a.getDate()} – ${b.getDate()}, ${b.getFullYear()}`
      : `${month(a)} ${a.getDate()} – ${month(b)} ${b.getDate()}, ${b.getFullYear()}`;
  }
  return `${month(a)} ${a.getDate()}, ${a.getFullYear()} – ${month(b)} ${b.getDate()}, ${b.getFullYear()}`;
}

const SIGNATURE_KEY = (username: string) => `report-signature:${username}`;

function riskVariant(level: string): "destructive" | "warning" | "info" {
  if (level === "Critical" || level === "High") return "destructive";
  if (level === "Medium") return "warning";
  return "info";
}

export default function ReportsPage() {
  const [category, setCategory] = useState("all");
  const [rangeDays, setRangeDays] = useState(30);
  const { dateFrom, dateTo } = useAnalyticsStore();
  // A manager's report covers their branch only.
  const lockedLocation = useLockedLocation() ?? undefined;
  const user = useAuthStore((state) => state.user);
  const preparedBy = user?.displayName || user?.username || "";
  const branchLabel = lockedLocation ?? "All Locations";
  const periodLabel = formatPeriod(dateFrom, dateTo);
  const reportTitle = REPORT_TITLES[category] ?? REPORT_TITLES.all;
  const notes = reportNotes(category, rangeDays, periodLabel);

  // Print / PDF first asks for a signature; it is placed on the printout's sign-off line.
  const [isSigning, setIsSigning] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [savedSignature, setSavedSignature] = useState<string | null>(null);

  // Read the remembered signature when signing starts, so it always matches who is signed in.
  const startSigning = () => {
    let saved: string | null = null;
    try {
      if (user?.username) saved = window.localStorage.getItem(SIGNATURE_KEY(user.username));
    } catch {
      saved = null;
    }
    setSavedSignature(saved);
    setIsSigning(true);
  };

  const saveSignature = (value: string) => {
    if (!user?.username) return;
    try {
      window.localStorage.setItem(SIGNATURE_KEY(user.username), value);
    } catch {
      // Storage full or blocked: the signature still prints, it just isn't remembered.
    }
    setSavedSignature(value);
  };

  const forecast = useQuery({
    queryKey: ["report", "forecast", rangeDays, lockedLocation],
    queryFn: () => fetchForecast(rangeDays, undefined, lockedLocation),
    enabled: category === "all" || category === "forecast",
  });

  const forecastInsights = useQuery({
    queryKey: ["report", "forecast-insights", rangeDays, lockedLocation],
    queryFn: () => fetchForecastInsights(rangeDays, undefined, lockedLocation),
    enabled: (category === "all" || category === "forecast") && !!forecast.data,
  });

  const revenue = useQuery({
    queryKey: ["report", "revenue", dateFrom, dateTo, lockedLocation],
    queryFn: () => fetchRevenue("day", dateFrom, dateTo, lockedLocation),
    enabled: category === "all" || category === "forecast",
  });

  const salesByProduct = useQuery({
    queryKey: ["report", "product", dateFrom, dateTo, lockedLocation],
    queryFn: () => fetchSalesByProduct(dateFrom, dateTo, lockedLocation),
    enabled: category === "all" || category === "forecast",
  });

  const alerts = useQuery({
    queryKey: ["report", "alerts", dateFrom, dateTo, lockedLocation],
    queryFn: () => fetchAlerts({ date_from: dateFrom, date_to: dateTo, page: 1, location_name: lockedLocation }),
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

  const showForecast = category === "all" || category === "forecast";
  const showAnomaly = category === "all" || category === "anomaly";
  // Print once the parts of the report that are shown have loaded.
  const ready = !(
    (showForecast && (forecast.isLoading || revenue.isLoading || salesByProduct.isLoading || forecastInsights.isLoading))
    || (showAnomaly && (alerts.isLoading || anomalyMetrics.isLoading))
  );

  const reportFileStem = () => {
    const kind = category === "forecast" ? "restocking-report" : category === "anomaly" ? "anomaly-report" : "ai-analytics-report";
    const branch = branchLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    return `${kind}_${branch}_${dateFrom}_to_${dateTo}`;
  };

  // Same as the POS: the PDF file name comes from the document title while printing.
  const printPage = (title: string) => {
    const originalTitle = document.title;
    document.title = title;
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.title = originalTitle;
      }, 1000);
    }, 250);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Generated Reports</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>AI-generated analytical reports with charts and explanations</span>
            <span aria-hidden>·</span>
            <PageLocationBadge />
          </div>
        </div>
      </div>

      {/* Toolbar: filters on the left, the print action on the right, as in the POS Sales Report. */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <ToggleGroupPills options={REPORT_CATEGORIES} value={category} onChange={setCategory} />
          <ToggleGroupPills
            options={RANGE_OPTIONS}
            value={String(rangeDays)}
            onChange={(v) => setRangeDays(Number(v))}
          />
        </div>
        <Button className="gap-2" disabled={!ready} onClick={startSigning}>
          <Printer className="h-4 w-4" />
          Print / PDF
        </Button>
      </div>

      {/* On screen: charts and cards. On paper the templated report below replaces them. */}
      <div className="space-y-6 print:hidden">
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
                    {forecastVariations.map((name) => (
                      <Area key={name} type="monotone" dataKey={name} stroke={variationColor(name)} fill={variationColor(name)} fillOpacity={0.05} strokeWidth={2} dot={false} />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                  {forecastVariations.map((name) => (
                    <div key={name} className="flex items-center gap-1.5">
                      <div className="w-2.5 h-[2px] rounded-full" style={{ background: variationColor(name) }} />
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
                <p><strong className="text-gray-900 dark:text-white">Model Confidence:</strong> {forecastInsights.data.model_baseline}</p>
                <p><strong className="text-gray-900 dark:text-white">Demand Drivers:</strong> {forecastInsights.data.demand_drivers}</p>
                <p><strong className="text-gray-900 dark:text-white">Stockout Risk:</strong> {forecastInsights.data.stockout_risk}</p>
                <p><strong className="text-gray-900 dark:text-white">Safety Stock:</strong> {forecastInsights.data.safety_stock}</p>
                <div className="flex items-center gap-2">
                  <strong className="text-gray-900 dark:text-white">Velocity Class:</strong>
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
                  <BarChart data={salesByProduct.data.map((d) => { const name = `${d.product_name} ${d.variation_name}`; return { name, quantity: d.total_quantity, color: variationColor(name) }; })} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                    <XAxis type="number" tick={AXIS_TICK} />
                    <YAxis type="category" dataKey="name" tick={AXIS_TICK} width={180} />
                    <Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} />
                    <Bar dataKey="quantity" radius={[0, 4, 4, 0]}>
                      {salesByProduct.data.map((d) => { const name = `${d.product_name} ${d.variation_name}`; return <Cell key={name} fill={variationColor(name)} />; })}
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
                  <ConfusionCell label="True Negative" value={anomalyMetrics.data.metrics.confusion_matrix.true_negative} tone="brand" />
                  <ConfusionCell label="False Positive" value={anomalyMetrics.data.metrics.confusion_matrix.false_positive} tone="destructive" />
                  <ConfusionCell label="False Negative" value={anomalyMetrics.data.metrics.confusion_matrix.false_negative} tone="warning" />
                  <ConfusionCell label="True Positive" value={anomalyMetrics.data.metrics.confusion_matrix.true_positive} tone="brand" />
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

      </div>

      <ReportPrintFrame title={reportTitle} periodLabel={periodLabel} branchLabel={branchLabel} className="hidden">
        <ReportPrintBody
          showForecast={showForecast}
          showAnomaly={showAnomaly}
          rangeDays={rangeDays}
          branchLabel={branchLabel}
          preparedBy={preparedBy}
          notes={notes}
          signature={signature}
          totalRevenue={totalRevenue}
          totalOrders={totalOrders}
          forecast={forecast.data}
          insights={forecastInsights.data}
          salesByProduct={salesByProduct.data}
          alerts={alerts.data?.alerts}
          alertsTotal={alerts.data?.total ?? 0}
          anomalyMetrics={anomalyMetrics.data}
        />
      </ReportPrintFrame>

      <PrintSignDialog
        open={isSigning}
        onOpenChange={setIsSigning}
        title={reportTitle}
        notes={notes}
        signerName={preparedBy}
        savedSignature={savedSignature}
        onSaveSignature={saveSignature}
        onConfirm={(signed) => {
          setSignature(signed);
          setIsSigning(false);
          // printPage waits a moment, so the signature is on the page and the dialog has closed.
          printPage(`${reportFileStem()} | ${reportTitle}`);
        }}
      />
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
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-xl font-bold text-foreground mt-1">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>
      </CardContent>
    </Card>
  );
}

function ConfusionCell({ label, value, tone }: { label: string; value: number; tone: "brand" | "destructive" | "warning" }) {
  const toneClass =
    tone === "brand" ? "text-brand-500 bg-primary/10" :
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
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

// ── Printed report (POS template) ───────────────────────────────────

const RISK_TONE: Record<string, string> = {
  Critical: "var(--destructive)",
  High: "var(--destructive)",
  Medium: "var(--warning)",
};

function ReportPrintBody({
  showForecast, showAnomaly, rangeDays, branchLabel, preparedBy, notes, signature,
  totalRevenue, totalOrders, forecast, insights, salesByProduct, alerts, alertsTotal, anomalyMetrics,
}: {
  showForecast: boolean;
  showAnomaly: boolean;
  rangeDays: number;
  branchLabel: string;
  preparedBy: string;
  notes: string[];
  signature: string | null;
  totalRevenue: number;
  totalOrders: number;
  forecast?: ForecastItem[];
  insights?: ForecastInsightsResponse;
  salesByProduct?: ProductSalesItem[];
  alerts?: AlertItem[];
  alertsTotal: number;
  anomalyMetrics?: AnomalyMetricsResponse;
}) {
  // One row per variation: total predicted units over the window, its range, and the busiest day.
  const forecastRows = useMemo(() => {
    const byVariation = new Map<string, { units: number; low: number; high: number; days: number; peakDate: string; peakUnits: number }>();
    for (const item of forecast ?? []) {
      const name = `${item.product_name} ${item.variation_name}`;
      const row = byVariation.get(name) ?? { units: 0, low: 0, high: 0, days: 0, peakDate: item.date, peakUnits: -Infinity };
      row.units += item.predicted_quantity;
      row.low += item.lower_bound;
      row.high += item.upper_bound;
      row.days += 1;
      if (item.predicted_quantity > row.peakUnits) {
        row.peakUnits = item.predicted_quantity;
        row.peakDate = item.date;
      }
      byVariation.set(name, row);
    }
    return [...byVariation.entries()]
      .map(([name, row]) => ({ name, ...row }))
      .sort((a, b) => getVariationSortIndex(a.name) - getVariationSortIndex(b.name));
  }, [forecast]);

  const forecastUnits = forecastRows.reduce((sum, r) => sum + r.units, 0);
  const productRows = [...(salesByProduct ?? [])].sort(
    (a, b) => getVariationSortIndex(`${a.product_name} ${a.variation_name}`) - getVariationSortIndex(`${b.product_name} ${b.variation_name}`),
  );
  const unitsSold = productRows.reduce((sum, p) => sum + p.total_quantity, 0);
  const productRevenue = productRows.reduce((sum, p) => sum + p.total_revenue, 0);

  const alertList = alerts ?? [];
  const highRisk = alertList.filter((a) => a.risk_level === "High" || a.risk_level === "Critical").length;
  const reviewed = alertList.filter((a) => a.status === "Reviewed" || a.status === "Resolved").length;
  // Only the first page of alerts is loaded, so counts taken from it are labelled as such.
  const partialAlerts = alertsTotal > alertList.length;
  const metrics = anomalyMetrics?.metrics;
  const matrix = metrics?.confusion_matrix;

  const generated = new Date().toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  let n = 0;
  const next = () => ++n;

  return (
    <div className="space-y-6 print:space-y-5">
      <ReportDetailsStrip
        items={[
          ["Branch", branchLabel],
          ["Forecast window", showForecast ? `Next ${rangeDays} days` : "—"],
          ["Prepared by", preparedBy || "—"],
          ["Generated", generated],
        ]}
      />

      {showForecast && (
        <>
          <div className="grid grid-cols-4 gap-3 break-inside-avoid">
            <ReportFigure label="Revenue" value={peso(totalRevenue)} />
            <ReportFigure label="Orders" value={count(totalOrders)} />
            <ReportFigure label="Average order" value={totalOrders > 0 ? peso(totalRevenue / totalOrders) : "—"} />
            <ReportFigure label={`Forecast units, ${rangeDays} days`} value={count(Math.round(forecastUnits))} />
          </div>

          <ReportSection number={next()} title="Demand forecast" subtitle={`Predicted units per product variation over the next ${rangeDays} days`}>
            {forecastRows.length === 0 ? (
              <ReportEmpty>No forecast available.</ReportEmpty>
            ) : (
              <ReportTable minWidth={680}>
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className={TH}>Product variation</th>
                    <th className={`${TH} !text-right`}>Predicted units</th>
                    <th className={`${TH} !text-right`}>Per day</th>
                    <th className={`${TH} !text-right`}>Likely range</th>
                    <th className={`${TH} !text-right`}>Busiest day</th>
                  </tr>
                </thead>
                <tbody>
                  {forecastRows.map((r) => (
                    <tr key={r.name} className={TR}>
                      <td className={`${TD} font-medium text-muted-foreground`}>{r.name}</td>
                      <td className={`${TD} ${NUM} font-semibold text-foreground`}>{count(Math.round(r.units))}</td>
                      <td className={`${TD} ${NUM}`}>{(r.units / Math.max(1, r.days)).toFixed(1)}</td>
                      <td className={`${TD} ${NUM} text-muted-foreground`}>{count(Math.round(r.low))} – {count(Math.round(r.high))}</td>
                      <td className={`${TD} ${NUM}`}>{formatDate(r.peakDate)}</td>
                    </tr>
                  ))}
                  <tr className={TOTAL_ROW}>
                    <td className={TD}>Total</td>
                    <td className={`${TD} ${NUM}`}>{count(Math.round(forecastUnits))}</td>
                    <td className={`${TD} ${NUM}`}>{(forecastUnits / Math.max(1, rangeDays)).toFixed(1)}</td>
                    <td className={`${TD} ${NUM}`}>
                      {count(Math.round(forecastRows.reduce((s, r) => s + r.low, 0)))} – {count(Math.round(forecastRows.reduce((s, r) => s + r.high, 0)))}
                    </td>
                    <td className={`${TD} ${NUM}`}>—</td>
                  </tr>
                </tbody>
              </ReportTable>
            )}
          </ReportSection>

          {insights && (
            <ReportSection number={next()} title="AI analysis summary" subtitle="What the forecast model sees in the sales history">
              <ReportTable minWidth={560}>
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className={`${TH} w-[28%]`}>Particulars</th>
                    <th className={TH}>Finding</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Model confidence", insights.model_baseline],
                    ["Demand drivers", insights.demand_drivers],
                    ["Stockout risk", insights.stockout_risk],
                    ["Safety stock", insights.safety_stock],
                    ["Velocity class", insights.velocity_class],
                  ].map(([label, value]) => (
                    <tr key={label} className={TR}>
                      <td className={`${TD} font-medium text-muted-foreground align-top`}>{label}</td>
                      <td className={`${TD} text-foreground`}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </ReportTable>
            </ReportSection>
          )}

          <ReportSection number={next()} title="Historical sales by product" subtitle="Units sold per variation in the period; informs restocking priorities">
            {productRows.length === 0 ? (
              <ReportEmpty>No sales in this period.</ReportEmpty>
            ) : (
              <ReportTable minWidth={560}>
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className={TH}>Product variation</th>
                    <th className={`${TH} !text-right`}>Units sold</th>
                    <th className={`${TH} !text-right`}>Revenue</th>
                    <th className={`${TH} !text-right`}>% of units</th>
                  </tr>
                </thead>
                <tbody>
                  {productRows.map((p) => {
                    const name = `${p.product_name} ${p.variation_name}`;
                    return (
                      <tr key={name} className={TR}>
                        <td className={`${TD} font-medium text-muted-foreground`}>{name}</td>
                        <td className={`${TD} ${NUM}`}>{count(p.total_quantity)}</td>
                        <td className={`${TD} ${NUM} font-semibold text-foreground`}>{peso(p.total_revenue)}</td>
                        <td className={`${TD} ${NUM} text-muted-foreground`}>{unitsSold > 0 ? pct(p.total_quantity / unitsSold) : "—"}</td>
                      </tr>
                    );
                  })}
                  <tr className={TOTAL_ROW}>
                    <td className={TD}>Total</td>
                    <td className={`${TD} ${NUM}`}>{count(unitsSold)}</td>
                    <td className={`${TD} ${NUM}`}>{peso(productRevenue)}</td>
                    <td className={`${TD} ${NUM}`}>{unitsSold > 0 ? "100.0%" : "—"}</td>
                  </tr>
                </tbody>
              </ReportTable>
            )}
          </ReportSection>
        </>
      )}

      {showAnomaly && (
        <>
          <div className="grid grid-cols-4 gap-3 break-inside-avoid">
            <ReportFigure label="Alerts" value={count(alertsTotal)} />
            <ReportFigure label="High risk" value={count(highRisk)} tone={highRisk > 0 ? "var(--destructive)" : undefined}>
              {partialAlerts && <p className="text-xs text-muted-foreground m-0">Of the {alertList.length} listed</p>}
            </ReportFigure>
            <ReportFigure label="Reviewed" value={count(reviewed)}>
              {partialAlerts && <p className="text-xs text-muted-foreground m-0">Of the {alertList.length} listed</p>}
            </ReportFigure>
            <ReportFigure label="Model F1-score" value={metrics ? pct(metrics.f1_score) : "—"} />
          </div>

          {metrics && (
            <ReportSection number={next()} title="Model performance" subtitle="How well the Isolation Forest model separates unusual transactions from normal ones">
              <div className="grid grid-cols-2 gap-5">
                <ReportTable minWidth={320}>
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className={TH}>Measure</th>
                      <th className={`${TH} !text-right`}>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Precision", pct(metrics.precision)],
                      ["Recall", pct(metrics.recall)],
                      ["F1-score", pct(metrics.f1_score)],
                      ["Expected anomaly rate", `${((anomalyMetrics?.contamination ?? 0) * 100).toFixed(0)}%`],
                    ].map(([label, value]) => (
                      <tr key={label} className={TR}>
                        <td className={`${TD} font-medium text-muted-foreground`}>{label}</td>
                        <td className={`${TD} ${NUM} font-semibold text-foreground`}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </ReportTable>
                {matrix && (
                  <ReportTable minWidth={320}>
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className={TH}>Actual</th>
                        <th className={`${TH} !text-right`}>Flagged</th>
                        <th className={`${TH} !text-right`}>Not flagged</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className={TR}>
                        <td className={`${TD} font-medium text-muted-foreground`}>Anomaly</td>
                        <td className={`${TD} ${NUM} font-semibold text-foreground`}>{count(matrix.true_positive)}</td>
                        <td className={`${TD} ${NUM}`}>{count(matrix.false_negative)}</td>
                      </tr>
                      <tr className={TR}>
                        <td className={`${TD} font-medium text-muted-foreground`}>Normal</td>
                        <td className={`${TD} ${NUM}`}>{count(matrix.false_positive)}</td>
                        <td className={`${TD} ${NUM} font-semibold text-foreground`}>{count(matrix.true_negative)}</td>
                      </tr>
                    </tbody>
                  </ReportTable>
                )}
              </div>
            </ReportSection>
          )}

          <ReportSection
            number={next()}
            title="Flagged transactions"
            subtitle={alertsTotal > alertList.length ? `The ${alertList.length} most recent of ${count(alertsTotal)} alerts in the period` : "Alerts raised in the period"}
          >
            {alertList.length === 0 ? (
              <ReportEmpty>No alerts in this period.</ReportEmpty>
            ) : (
              <ReportTable minWidth={760}>
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className={TH}>Detected</th>
                    <th className={TH}>Order</th>
                    <th className={TH}>Branch</th>
                    <th className={`${TH} !text-right`}>Amount</th>
                    <th className={TH}>Risk</th>
                    <th className={TH}>Reason</th>
                    <th className={TH}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {alertList.map((a) => (
                    <tr key={a.alert_id} className={TR}>
                      <td className={`${TD} whitespace-nowrap`}>{formatDate(a.detected_at.slice(0, 10))}</td>
                      <td className={`${TD} font-mono text-xs`}>{a.order_id.slice(0, 8)}</td>
                      <td className={`${TD} text-muted-foreground`}>{a.location_name ?? "—"}</td>
                      <td className={`${TD} ${NUM}`}>{peso(a.transaction_amount)}</td>
                      <td className={`${TD} font-semibold`} style={{ color: RISK_TONE[a.risk_level] }}>{a.risk_level}</td>
                      <td className={`${TD} text-muted-foreground`}>{a.reason}</td>
                      <td className={TD}>{a.status}</td>
                    </tr>
                  ))}
                </tbody>
              </ReportTable>
            )}
          </ReportSection>
        </>
      )}

      <ReportNotes notes={notes} preparedBy={preparedBy} signature={signature} />
    </div>
  );
}
