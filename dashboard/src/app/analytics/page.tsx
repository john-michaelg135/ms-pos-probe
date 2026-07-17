"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { fetchRevenue, fetchSalesByLocation, fetchSalesByProduct, fetchSalesByChannel } from "@/lib/api";
import { formatDate, formatDateShort } from "@/lib/format-date";

const TABS = [
  { id: "revenue", label: "Revenue Trends" },
  { id: "location", label: "By Location" },
  { id: "product", label: "By Product" },
  { id: "channel", label: "By Channel" },
];

const COLORS = ["#465fff", "#7a5af8", "#0ba5ec", "#f79009", "#12b76a", "#f04438", "#ee46bc"];

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState("revenue");
  const [groupBy, setGroupBy] = useState<"day" | "week" | "month">("day");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  return (
    <div className="space-y-6 page-enter">
      <div className="animate-fade-in">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Sales Analytics</h1>
        <p className="text-[13px] text-gray-500 mt-1">
          Revenue trends, sales by location, product, and channel
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 overflow-x-auto animate-slide-up stagger-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-[12px] font-medium whitespace-nowrap transition-all btn-press ${
              activeTab === tab.id
                ? "bg-brand-500 text-white shadow-md"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Date Range + Controls */}
      <div className="flex flex-wrap items-center gap-3 animate-slide-up stagger-2">
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="px-3 py-2 text-[12px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        />
        <span className="text-gray-400 text-[12px]">to</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="px-3 py-2 text-[12px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        />
        {activeTab === "revenue" && (
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 ml-auto">
            {(["day", "week", "month"] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                className={`px-3 py-1.5 rounded-md text-[11px] font-medium capitalize transition-all ${
                  groupBy === g
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chart Area */}
      <div className="bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-[#2d3748] rounded-2xl p-6 card-hover animate-bounce-in stagger-3">
        {activeTab === "revenue" && <RevenueChart groupBy={groupBy} dateFrom={dateFrom} dateTo={dateTo} />}
        {activeTab === "location" && <LocationChart dateFrom={dateFrom} dateTo={dateTo} />}
        {activeTab === "product" && <ProductChart dateFrom={dateFrom} dateTo={dateTo} />}
        {activeTab === "channel" && <ChannelChart dateFrom={dateFrom} dateTo={dateTo} />}
      </div>
    </div>
  );
}

// ── Revenue Trends Chart (US-PROBE-021) ──
function RevenueChart({ groupBy, dateFrom, dateTo }: { groupBy: "day" | "week" | "month"; dateFrom: string; dateTo: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics", "revenue", groupBy, dateFrom, dateTo],
    queryFn: () => fetchRevenue(groupBy, dateFrom, dateTo),
  });

  const totalRevenue = data?.reduce((sum, d) => sum + d.total_revenue, 0) ?? 0;

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState />;

  return (
    <div>
      <div className="mb-4">
        <p className="text-[12px] text-gray-500 uppercase font-medium">Total Revenue</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-50">₱{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(102,112,133,0.15)" vertical={false} />
          <XAxis dataKey="period" tick={{ fontSize: 10, fill: "#667085" }} tickFormatter={formatDateShort} />
          <YAxis tick={{ fontSize: 10, fill: "#667085" }} tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`} width={55} />
          <Tooltip cursor={{ fill: "rgba(70,95,255,0.06)" }} formatter={(v) => [`₱${Number(v).toLocaleString()}`, "Revenue"]} contentStyle={{ background: "rgba(26,34,49,0.95)", border: "1px solid #2d3748", borderRadius: 12, fontSize: 12 }} labelStyle={{ color: "#f9fafb", marginBottom: 4 }} itemStyle={{ color: "#e4e7ec" }} labelFormatter={(label) => formatDate(String(label))} />
          <Bar dataKey="total_revenue" fill="#465fff" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Sales by Location (US-PROBE-022) ──
function LocationChart({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics", "location", dateFrom, dateTo],
    queryFn: () => fetchSalesByLocation(dateFrom, dateTo),
  });

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState />;

  const totalRevenue = data?.reduce((sum, d) => sum + d.total_revenue, 0) ?? 1;

  return (
    <div>
      <h3 className="text-[13px] font-medium text-gray-900 dark:text-gray-50 mb-4">Revenue by Location</h3>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(102,112,133,0.15)" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: "#667085" }} tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`} />
          <YAxis type="category" dataKey="location_name" tick={{ fontSize: 10, fill: "#98a2b3" }} width={170} />
          <Tooltip cursor={{ fill: "rgba(70,95,255,0.06)" }} formatter={(v) => [`₱${Number(v).toLocaleString()}`, "Revenue"]} contentStyle={{ background: "rgba(26,34,49,0.95)", border: "1px solid #2d3748", borderRadius: 12, fontSize: 12 }} labelStyle={{ color: "#f9fafb" }} itemStyle={{ color: "#e4e7ec" }} />
          <Bar dataKey="total_revenue" radius={[0, 4, 4, 0]}>
            {data?.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {/* Percentage breakdown */}
      <div className="mt-4 space-y-2">
        {data?.map((item, i) => (
          <div key={item.location_name} className="flex items-center gap-3 text-[12px]">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="text-gray-700 dark:text-gray-300 flex-1">{item.location_name}</span>
            <span className="text-gray-500">₱{item.total_revenue.toLocaleString()}</span>
            <span className="text-gray-400 w-12 text-right">{((item.total_revenue / totalRevenue) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sales by Product (US-PROBE-023) ──
function ProductChart({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics", "product", dateFrom, dateTo],
    queryFn: () => fetchSalesByProduct(dateFrom, dateTo),
  });

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState />;

  const chartData = data?.map((d) => ({
    name: `${d.product_name} ${d.variation_name}`,
    quantity: d.total_quantity,
    revenue: d.total_revenue,
  }));

  return (
    <div>
      <h3 className="text-[13px] font-medium text-gray-900 dark:text-gray-50 mb-4">Quantity Sold by Product Variation</h3>
      <ResponsiveContainer width="100%" height={420}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(102,112,133,0.15)" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: "#667085" }} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#98a2b3" }} width={200} />
          <Tooltip cursor={{ fill: "rgba(122,90,248,0.06)" }} formatter={(v, name) => [name === "quantity" ? `${Number(v)} units` : `₱${Number(v).toLocaleString()}`, name === "quantity" ? "Quantity" : "Revenue"]} contentStyle={{ background: "rgba(26,34,49,0.95)", border: "1px solid #2d3748", borderRadius: 12, fontSize: 12 }} labelStyle={{ color: "#f9fafb" }} itemStyle={{ color: "#e4e7ec" }} />
          <Bar dataKey="quantity" fill="#7a5af8" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Sales by Channel (US-PROBE-024) ──
function ChannelChart({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics", "channel", dateFrom, dateTo],
    queryFn: () => fetchSalesByChannel(dateFrom, dateTo),
  });

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState />;

  const totalRevenue = data?.reduce((sum, d) => sum + d.total_revenue, 0) ?? 1;
  const pieData = data?.map((d) => ({
    name: d.order_source,
    value: d.total_revenue,
    percentage: ((d.total_revenue / totalRevenue) * 100).toFixed(1),
  }));

  return (
    <div>
      <h3 className="text-[13px] font-medium text-gray-900 dark:text-gray-50 mb-4">Revenue by Sales Channel</h3>
      <div className="flex flex-col md:flex-row items-center gap-8">
        <ResponsiveContainer width={250} height={250}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={95}
              paddingAngle={4}
              dataKey="value"
              label={false}
            >
              {pieData?.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v) => [`₱${Number(v).toLocaleString()}`, "Revenue"]} contentStyle={{ background: "rgba(26,34,49,0.95)", border: "1px solid #2d3748", borderRadius: 12, fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="space-y-4">
          {data?.map((item, i) => (
            <div key={item.order_source} className="flex items-center gap-4">
              <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
              <div>
                <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{item.order_source}</p>
                <p className="text-[12px] text-gray-500">
                  ₱{item.total_revenue.toLocaleString()} • {((item.total_revenue / totalRevenue) * 100).toFixed(1)}%
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Shared Components ──
function LoadingState() {
  return (
    <div className="h-[320px] flex items-center justify-center shimmer rounded-xl">
      <p className="text-[13px] text-gray-500">Loading analytics data...</p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="h-[320px] flex items-center justify-center">
      <p className="text-[13px] text-error-500">Failed to load data. Is the AI service running?</p>
    </div>
  );
}
