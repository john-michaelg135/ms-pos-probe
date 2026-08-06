"use client";

import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Printer, FileText, TrendingUp, ShieldAlert, MapPin, Filter } from "lucide-react";
import { fetchForecast, fetchForecastInsights, fetchRevenue, fetchSalesByLocation, fetchSalesByProduct, fetchAlerts, fetchAnomalyMetrics, ForecastInsightsResponse } from "@/lib/api";
import { formatDate, formatDateShort } from "@/lib/format-date";
import { getVariationSortIndex } from "@/lib/variation-order";

const COLORS = ["#465fff", "#7a5af8", "#0ba5ec", "#f79009", "#12b76a", "#f04438", "#ee46bc"];

const REPORT_CATEGORIES = [
  { label: "All", value: "all" },
  { label: "Predictive Restocking", value: "forecast" },
  { label: "Anomaly Detection", value: "anomaly" },
];

const RANGE_OPTIONS = [
  { label: "7 Days", value: 7 },
  { label: "14 Days", value: 14 },
  { label: "30 Days", value: 30 },
];

export default function ReportsPage() {
  const [category, setCategory] = useState("all");
  const [rangeDays, setRangeDays] = useState(7);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  // Compute dateTo from dateFrom + rangeDays
  const dateTo = useMemo(() => {
    const d = new Date(dateFrom + "T00:00:00");
    d.setDate(d.getDate() + rangeDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, [dateFrom, rangeDays]);

  // Forecast data
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

  // Sales data
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

  // Anomaly data
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

  // Forecast chart data
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

  // Revenue totals
  const totalRevenue = revenue.data?.reduce((sum, d) => sum + d.total_revenue, 0) ?? 0;
  const totalOrders = revenue.data?.reduce((sum, d) => sum + d.total_orders, 0) ?? 0;

  const handlePrint = () => window.print();

  const reportDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-6 page-enter">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in print:hidden">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Generated Reports</h1>
          <p className="text-[13px] text-gray-500 mt-1">
            AI-generated analytical reports with charts and explanations
          </p>
        </div>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-[12px] font-semibold btn-press shadow-[0_2px_8px_rgba(70,95,255,0.25)]"
        >
          <Printer size={14} />
          Print Report
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 animate-slide-up stagger-1 print:hidden">
        {/* Category filter */}
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-400" />
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
            {REPORT_CATEGORIES.map((c) => (
              <button
                key={c.value}
                onClick={() => setCategory(c.value)}
                className={`px-3 py-2 rounded-lg text-[11px] font-medium transition-all btn-press ${
                  category === c.value
                    ? "bg-brand-500 text-white shadow-md"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Range selector */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r.value}
              onClick={() => setRangeDays(r.value)}
              className={`px-3 py-2 rounded-lg text-[11px] font-medium transition-all btn-press ${
                rangeDays === r.value
                  ? "bg-brand-500 text-white shadow-md"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block print:mb-6">
        <h1 className="text-2xl font-bold text-center">Bren Raphael&apos;s Ube Halaya &amp; Jam Company</h1>
        <h2 className="text-lg text-center text-gray-600 mt-1">
          {category === "forecast" ? "Predictive Restocking Report" :
           category === "anomaly" ? "Anomaly Detection Report" :
           "POS-PROBE Analytics Report"}
        </h2>
        <p className="text-sm text-center text-gray-400 mt-1">
          Generated on {reportDate} • Period: {formatDate(dateFrom)} – {formatDate(dateTo)} ({rangeDays} days)
        </p>
        <p className="text-xs text-center text-gray-400 mt-0.5">Generated by POS-PROBE AI System</p>
      </div>

      {/* ══ PREDICTIVE RESTOCKING SECTION ══ */}
      {(category === "all" || category === "forecast") && (
        <>
          <SectionHeader
            icon={<TrendingUp size={18} className="text-brand-500" />}
            title="Predictive Restocking Analysis"
            subtitle="AI-driven demand forecasting and restocking recommendations"
          />

          {/* Revenue Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-slide-up stagger-2">
            <MetricCard label="Total Revenue" value={`₱${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} sublabel={`${dateFrom} to ${dateTo}`} />
            <MetricCard label="Total Orders" value={`${totalOrders.toLocaleString()}`} sublabel="Orders processed" />
            <MetricCard label="Forecast Window" value={`Next ${rangeDays} Days`} sublabel="Predicted demand period" />
          </div>

          {/* Forecast Chart */}
          {forecast.data && forecast.data.length > 0 && (
            <div className="bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-[#2d3748] rounded-2xl p-6 animate-bounce-in stagger-3">
              <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-50 mb-2">Demand Forecast (Next {rangeDays} Days)</h3>
              <p className="text-[12px] text-gray-500 mb-4">
                Predicted daily customer demand per product variation, used to determine optimal restocking quantities.
              </p>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={forecastChartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(102,112,133,0.15)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#98a2b3" }} tickFormatter={formatDateShort} />
                  <YAxis tick={{ fontSize: 10, fill: "#98a2b3" }} />
                  <Tooltip contentStyle={{ background: "rgba(26,34,49,0.95)", border: "1px solid #2d3748", borderRadius: 12, fontSize: 11 }} labelStyle={{ color: "#f9fafb" }} labelFormatter={(l) => formatDate(String(l))} />
                  {forecastVariations.map((name, i) => (
                    <Area key={name} type="monotone" dataKey={name} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.05} strokeWidth={2} dot={false} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                {forecastVariations.map((name, i) => (
                  <div key={name} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-[2px] rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-[9px] text-gray-500">{name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Explanation */}
          {forecastInsights.data && (
            <div className="bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-[#2d3748] rounded-2xl p-6 animate-bounce-in stagger-4">
              <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-50 mb-3">AI Analysis Summary</h3>
              <div className="space-y-3 text-[12px] text-gray-700 dark:text-gray-300 leading-relaxed">
                <p><strong>Model Confidence:</strong> {forecastInsights.data.model_baseline}</p>
                <p><strong>Demand Drivers:</strong> {forecastInsights.data.demand_drivers}</p>
                <p><strong>Stockout Risk:</strong> {forecastInsights.data.stockout_risk}</p>
                <p><strong>Safety Stock:</strong> {forecastInsights.data.safety_stock}</p>
                <p><strong>Velocity Class:</strong> <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                  forecastInsights.data.velocity_class.includes("Fast") ? "bg-green-100 text-green-700" :
                  forecastInsights.data.velocity_class.includes("Moderate") ? "bg-blue-100 text-blue-700" :
                  "bg-gray-100 text-gray-700"
                }`}>{forecastInsights.data.velocity_class}</span></p>
              </div>
            </div>
          )}

          {/* Sales by Product */}
          {salesByProduct.data && salesByProduct.data.length > 0 && (
            <div className="bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-[#2d3748] rounded-2xl p-6 animate-bounce-in stagger-4">
              <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-50 mb-2">Historical Sales by Product</h3>
              <p className="text-[12px] text-gray-500 mb-4">Units sold per variation in the selected period — informs restocking priorities.</p>
              <ResponsiveContainer width="100%" height={Math.max(200, salesByProduct.data.length * 45)}>
                <BarChart data={salesByProduct.data.map((d) => ({ name: `${d.product_name} ${d.variation_name}`, quantity: d.total_quantity }))} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(102,112,133,0.15)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#667085" }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#98a2b3" }} width={180} />
                  <Tooltip contentStyle={{ background: "rgba(26,34,49,0.95)", border: "1px solid #2d3748", borderRadius: 12, fontSize: 11 }} />
                  <Bar dataKey="quantity" fill="#7a5af8" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Sales by Location */}
          {salesByLocation.data && salesByLocation.data.length > 0 && (
            <div className="bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-[#2d3748] rounded-2xl p-6 animate-bounce-in stagger-4">
              <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-50 mb-2">Sales by Location</h3>
              <p className="text-[12px] text-gray-500 mb-4">Revenue distribution across branches — helps plan location-specific restocking.</p>
              <ResponsiveContainer width="100%" height={Math.max(180, salesByLocation.data.length * 50)}>
                <BarChart data={salesByLocation.data} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(102,112,133,0.15)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#667085" }} tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="location_name" tick={{ fontSize: 10, fill: "#98a2b3" }} width={170} />
                  <Tooltip contentStyle={{ background: "rgba(26,34,49,0.95)", border: "1px solid #2d3748", borderRadius: 12, fontSize: 11 }} formatter={(v) => [`₱${Number(v).toLocaleString()}`, "Revenue"]} />
                  <Bar dataKey="total_revenue" radius={[0, 4, 4, 0]}>
                    {salesByLocation.data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {/* ══ ANOMALY DETECTION SECTION ══ */}
      {(category === "all" || category === "anomaly") && (
        <>
          <SectionHeader
            icon={<ShieldAlert size={18} className="text-red-500" />}
            title="Anomaly Detection Analysis"
            subtitle="Isolation Forest fraud detection results and alert summary"
          />

          {/* Anomaly Metrics */}
          {anomalyMetrics.data && anomalyMetrics.data.metrics && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-slide-up stagger-2">
              <MetricCard label="Precision" value={`${(anomalyMetrics.data.metrics.precision * 100).toFixed(1)}%`} sublabel="True positive rate" />
              <MetricCard label="Recall" value={`${(anomalyMetrics.data.metrics.recall * 100).toFixed(1)}%`} sublabel="Detection rate" />
              <MetricCard label="F1-Score" value={`${(anomalyMetrics.data.metrics.f1_score * 100).toFixed(1)}%`} sublabel="Balanced accuracy" />
              <MetricCard label="Contamination" value={`${(anomalyMetrics.data.contamination * 100).toFixed(0)}%`} sublabel="Expected anomaly rate" />
            </div>
          )}

          {/* Confusion Matrix */}
          {anomalyMetrics.data && anomalyMetrics.data.metrics && (
            <div className="bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-[#2d3748] rounded-2xl p-6 animate-bounce-in stagger-3">
              <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-50 mb-2">Confusion Matrix</h3>
              <p className="text-[12px] text-gray-500 mb-4">Classification performance of the Isolation Forest anomaly detection model.</p>
              <div className="grid grid-cols-2 gap-3 max-w-[320px]">
                <div className="bg-green-50 dark:bg-green-500/10 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-500">True Negative</p>
                  <p className="text-lg font-bold text-green-600">{anomalyMetrics.data.metrics.confusion_matrix.true_negative.toLocaleString()}</p>
                </div>
                <div className="bg-red-50 dark:bg-red-500/10 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-500">False Positive</p>
                  <p className="text-lg font-bold text-red-600">{anomalyMetrics.data.metrics.confusion_matrix.false_positive.toLocaleString()}</p>
                </div>
                <div className="bg-yellow-50 dark:bg-yellow-500/10 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-500">False Negative</p>
                  <p className="text-lg font-bold text-yellow-600">{anomalyMetrics.data.metrics.confusion_matrix.false_negative.toLocaleString()}</p>
                </div>
                <div className="bg-green-50 dark:bg-green-500/10 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-500">True Positive</p>
                  <p className="text-lg font-bold text-green-600">{anomalyMetrics.data.metrics.confusion_matrix.true_positive.toLocaleString()}</p>
                </div>
              </div>
              <p className="text-[11px] text-gray-500 mt-4 leading-relaxed">
                The Isolation Forest model identifies anomalous POS transactions by learning normal behavior patterns.
                True Positives are correctly detected anomalies (e.g., fraudulent refunds, discount abuse).
                The model uses {(anomalyMetrics.data.contamination * 100).toFixed(0)}% contamination rate,
                meaning it expects approximately {(anomalyMetrics.data.contamination * 100).toFixed(0)}% of transactions to be suspicious.
              </p>
            </div>
          )}

          {/* Alert Summary */}
          {alerts.data && (
            <div className="bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-[#2d3748] rounded-2xl p-6 animate-bounce-in stagger-4">
              <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-50 mb-2">Alert Summary</h3>
              <p className="text-[12px] text-gray-500 mb-4">Flagged transactions during the selected period.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
                  <p className="text-[10px] text-gray-500 uppercase">Total Alerts</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-50">{alerts.data.total}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
                  <p className="text-[10px] text-gray-500 uppercase">High Risk</p>
                  <p className="text-xl font-bold text-red-500">{alerts.data.alerts.filter((a) => a.risk_level === "High" || a.risk_level === "Critical").length}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
                  <p className="text-[10px] text-gray-500 uppercase">Reviewed</p>
                  <p className="text-xl font-bold text-green-500">{alerts.data.alerts.filter((a) => a.status === "Reviewed" || a.status === "Resolved").length}</p>
                </div>
              </div>
              {alerts.data.alerts.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-2 px-2 text-gray-500">Order ID</th>
                        <th className="text-right py-2 px-2 text-gray-500">Amount</th>
                        <th className="text-center py-2 px-2 text-gray-500">Risk</th>
                        <th className="text-left py-2 px-2 text-gray-500">Reason</th>
                        <th className="text-center py-2 px-2 text-gray-500">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alerts.data.alerts.slice(0, 10).map((alert) => (
                        <tr key={alert.alert_id} className="border-b border-gray-100 dark:border-gray-800">
                          <td className="py-2 px-2 text-gray-900 dark:text-gray-100 font-mono">{alert.order_id.slice(0, 8)}...</td>
                          <td className="py-2 px-2 text-right text-gray-700 dark:text-gray-300">₱{alert.transaction_amount.toLocaleString()}</td>
                          <td className="py-2 px-2 text-center">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-semibold ${
                              alert.risk_level === "Critical" ? "bg-red-100 text-red-700" :
                              alert.risk_level === "High" ? "bg-orange-100 text-orange-700" :
                              "bg-yellow-100 text-yellow-700"
                            }`}>{alert.risk_level}</span>
                          </td>
                          <td className="py-2 px-2 text-gray-600 dark:text-gray-400 max-w-[200px] truncate">{alert.reason}</td>
                          <td className="py-2 px-2 text-center text-gray-500">{alert.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {alerts.data.total > 10 && (
                    <p className="text-[10px] text-gray-400 mt-2">Showing 10 of {alerts.data.total} alerts</p>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Print footer */}
      <div className="hidden print:block print:mt-8 border-t border-gray-200 pt-4">
        <p className="text-[10px] text-gray-400 text-center">
          This report was auto-generated by the POS-PROBE AI system on {reportDate}.
          Data sourced from the Capstone POS & Ecommerce platform via the 10-minute sync pipeline.
        </p>
      </div>
    </div>
  );
}

// ── Shared Components ──

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        {icon}
      </div>
      <div>
        <h2 className="text-[15px] font-semibold text-gray-900 dark:text-gray-50">{title}</h2>
        <p className="text-[11px] text-gray-500">{subtitle}</p>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sublabel }: { label: string; value: string; sublabel: string }) {
  return (
    <div className="bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-[#2d3748] rounded-2xl p-4 card-hover">
      <p className="text-[10px] text-gray-500 uppercase font-medium">{label}</p>
      <p className="text-xl font-bold text-gray-900 dark:text-gray-50 mt-1">{value}</p>
      <p className="text-[11px] text-gray-400 mt-0.5">{sublabel}</p>
    </div>
  );
}
