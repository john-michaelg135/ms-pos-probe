"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { fetchForecast, ForecastItem } from "@/lib/api";
import { formatDate, formatDateShort } from "@/lib/format-date";
import { VARIATION_ORDER, getVariationSortIndex } from "@/lib/variation-order";

const FORECAST_WINDOWS = [
  { label: "7 Days", value: 7 },
  { label: "14 Days", value: 14 },
  { label: "30 Days", value: 30 },
];

const PRODUCT_FILTERS = [
  { label: "All Products", value: "all" },
  { label: "Ube Halaya", value: "Ube Halaya" },
  { label: "Ube Jam", value: "Ube Jam" },
];

const COLORS = [
  "#465fff", "#7a5af8", "#0ba5ec", "#f79009", "#12b76a", "#f04438",
  "#ee46bc", "#36bffa", "#fb6514", "#32d583", "#fdb022", "#9cb9ff",
];

export default function ForecastPage() {
  const [days, setDays] = useState(7);
  const [productFilter, setProductFilter] = useState("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["forecast", days],
    queryFn: () => fetchForecast(days),
  });

  // Filter by product
  const filteredData = useMemo(() => {
    if (!data) return [];
    if (productFilter === "all") return data;
    return data.filter((item) => item.product_name === productFilter);
  }, [data, productFilter]);

  // Group by date for chart — use full product+variation name as key
  const chartData = useMemo(() => {
    if (!filteredData || filteredData.length === 0) return [];
    const grouped: Record<string, Record<string, number>> = {};
    filteredData.forEach((item) => {
      if (!grouped[item.date]) grouped[item.date] = {};
      const label = productFilter === "all"
        ? `${item.product_name} ${item.variation_name}`
        : item.variation_name;
      grouped[item.date][label] = item.predicted_quantity;
    });
    return Object.entries(grouped).map(([date, vals]) => ({ date, ...vals }));
  }, [filteredData, productFilter]);

  // Unique variation names for legend — sorted by canonical order
  const variations = useMemo(() => {
    if (!filteredData) return [];
    const set = new Set(
      filteredData.map((d) =>
        productFilter === "all"
          ? `${d.product_name} ${d.variation_name}`
          : d.variation_name
      )
    );
    return [...set].sort((a, b) => {
      const fullA = productFilter === "all" ? a : `${productFilter} ${a}`;
      const fullB = productFilter === "all" ? b : `${productFilter} ${b}`;
      return getVariationSortIndex(fullA) - getVariationSortIndex(fullB);
    });
  }, [filteredData, productFilter]);

  // Summary table
  const summaryData = useMemo(() => {
    if (!filteredData) return [];
    const map = new Map<string, { total: number; upper: number; lower: number; count: number; variation_id: number; product_name: string; variation_name: string }>();
    filteredData.forEach((item) => {
      const key = `${item.variation_id}`;
      const existing = map.get(key) || { total: 0, upper: 0, lower: 0, count: 0, variation_id: item.variation_id, product_name: item.product_name, variation_name: item.variation_name };
      existing.total += item.predicted_quantity;
      existing.upper += item.upper_bound;
      existing.lower += item.lower_bound;
      existing.count += 1;
      map.set(key, existing);
    });
    return [...map.values()].sort((a, b) => getVariationSortIndex(undefined, a.variation_id) - getVariationSortIndex(undefined, b.variation_id));
  }, [filteredData]);

  return (
    <div className="space-y-6 page-enter">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Demand Forecast</h1>
          <p className="text-[13px] text-gray-500 mt-1">
            Predicted daily demand for each Ube product variation
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Product filter */}
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
            {PRODUCT_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setProductFilter(f.value)}
                className={`px-3 py-2 rounded-lg text-[11px] font-medium transition-all btn-press ${
                  productFilter === f.value
                    ? "bg-brand-500 text-white shadow-md"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Forecast window */}
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
            {FORECAST_WINDOWS.map((w) => (
              <button
                key={w.value}
                onClick={() => setDays(w.value)}
                className={`px-3 py-2 rounded-lg text-[11px] font-medium transition-all btn-press ${
                  days === w.value
                    ? "bg-brand-500 text-white shadow-md"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-[#2d3748] rounded-2xl p-6 card-hover animate-bounce-in stagger-1">
        <h2 className="text-[14px] font-semibold text-gray-900 dark:text-gray-50 mb-4">
          Predicted Demand — {productFilter === "all" ? "All Products" : productFilter} (Next {days} Days)
        </h2>

        {isLoading ? (
          <div className="h-[350px] flex items-center justify-center shimmer rounded-xl">
            <p className="text-[13px] text-gray-500">Loading forecast data...</p>
          </div>
        ) : error ? (
          <div className="h-[350px] flex items-center justify-center">
            <p className="text-[13px] text-error-500">Failed to load forecast. Is the AI service running?</p>
          </div>
        ) : chartData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(102,112,133,0.15)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#98a2b3" }} tickFormatter={formatDateShort} />
                <YAxis tick={{ fontSize: 11, fill: "#98a2b3" }} />
                <Tooltip
                  contentStyle={{
                    background: "rgba(26,34,49,0.95)",
                    border: "1px solid #2d3748",
                    borderRadius: 12,
                    fontSize: 12,
                    maxHeight: 350,
                    overflow: "auto",
                  }}
                  labelStyle={{ color: "#f9fafb", fontWeight: 600, marginBottom: 4 }}
                  labelFormatter={(label) => formatDate(String(label))}
                />
                <Legend content={() => null} />
                {variations.map((name, i) => (
                  <Area
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={COLORS[i % COLORS.length]}
                    fill={COLORS[i % COLORS.length]}
                    fillOpacity={0.06}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>

            {/* Custom legend below chart */}
            <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 px-2">
              {variations.map((name, i) => (
                <div key={name} className="flex items-center gap-1.5">
                  <div className="w-3 h-[3px] rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-[10px] text-gray-600 dark:text-gray-400">{name}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="h-[350px] flex items-center justify-center">
            <p className="text-[13px] text-gray-500">No forecast data available. Train the model first.</p>
          </div>
        )}
      </div>

      {/* Summary Table */}
      <div className="bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-[#2d3748] rounded-2xl p-6 card-hover animate-bounce-in stagger-2">
        <h2 className="text-[14px] font-semibold text-gray-900 dark:text-gray-50 mb-4">
          Recommended Production ({days}-Day Total) — {productFilter === "all" ? "All Products" : productFilter}
        </h2>

        {summaryData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-2 text-gray-500 font-medium">Product</th>
                  <th className="text-left py-3 px-2 text-gray-500 font-medium">Variation</th>
                  <th className="text-right py-3 px-2 text-gray-500 font-medium">Predicted</th>
                  <th className="text-right py-3 px-2 text-gray-500 font-medium">Lower</th>
                  <th className="text-right py-3 px-2 text-gray-500 font-medium">Upper</th>
                  <th className="text-right py-3 px-2 text-gray-500 font-medium">Avg/Day</th>
                </tr>
              </thead>
              <tbody>
                {summaryData.map((row) => (
                  <tr key={row.variation_id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="py-3 px-2 text-gray-900 dark:text-gray-100">{row.product_name}</td>
                    <td className="py-3 px-2 text-gray-700 dark:text-gray-300">{row.variation_name}</td>
                    <td className="py-3 px-2 text-right font-semibold text-brand-500">{row.total}</td>
                    <td className="py-3 px-2 text-right text-gray-500">{row.lower}</td>
                    <td className="py-3 px-2 text-right text-gray-500">{row.upper}</td>
                    <td className="py-3 px-2 text-right text-gray-700 dark:text-gray-300">{Math.round(row.total / row.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[13px] text-gray-500">No data available.</p>
        )}
      </div>
    </div>
  );
}
