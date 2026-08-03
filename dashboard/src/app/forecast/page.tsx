"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Info, TrendingUp, ShieldCheck, Zap, Package } from "lucide-react";
import { fetchForecast, fetchForecastInsights, ForecastItem, ForecastInsightsResponse } from "@/lib/api";
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
  const [selectedVariationId, setSelectedVariationId] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["forecast", days],
    queryFn: () => fetchForecast(days),
  });

  // Fetch AI insights for the explanation cards
  const { data: insights } = useQuery({
    queryKey: ["forecast", "insights", days, selectedVariationId],
    queryFn: () => fetchForecastInsights(days, selectedVariationId ?? undefined),
    enabled: !!data && data.length > 0,
  });

  // Filter by product
  const filteredData = useMemo(() => {
    if (!data) return [];
    if (productFilter === "all") return data;
    return data.filter((item) => item.product_name === productFilter);
  }, [data, productFilter]);

  // Group by date for chart
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

  // Unique variation names for legend
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

  // Get available variations for the insights dropdown
  const availableVariations = useMemo(() => {
    if (!data) return [];
    const map = new Map<number, { variation_id: number; product_name: string; variation_name: string }>();
    data.forEach((item) => {
      if (!map.has(item.variation_id)) {
        map.set(item.variation_id, {
          variation_id: item.variation_id,
          product_name: item.product_name,
          variation_name: item.variation_name,
        });
      }
    });
    return [...map.values()].sort((a, b) =>
      getVariationSortIndex(undefined, a.variation_id) - getVariationSortIndex(undefined, b.variation_id)
    );
  }, [data]);

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
          Predicted Demand (Next {days} Days)
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

      {/* AI Forecast Explanations & Key Drivers */}
      {data && data.length > 0 && (
        <div className="bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-[#2d3748] rounded-2xl p-6 card-hover animate-bounce-in stagger-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-brand-500/10 flex items-center justify-center">
                <TrendingUp size={18} className="text-brand-500" />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-gray-900 dark:text-gray-50">AI Forecast Explanations & Key Drivers</h2>
                <p className="text-[11px] text-gray-500">Data-backed demand insights derived from historical POS transaction patterns</p>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 text-[10px] font-semibold">
                {insights?.engine || "Statsmodels"} Additive ML
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-500">Analyze SKU:</span>
              <select
                value={selectedVariationId ?? "all"}
                onChange={(e) => setSelectedVariationId(e.target.value === "all" ? null : Number(e.target.value))}
                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-[12px] text-gray-900 dark:text-gray-100 outline-none"
              >
                <option value="all">All Variations (System Total)</option>
                {availableVariations.map((v) => (
                  <option key={v.variation_id} value={v.variation_id}>
                    {v.product_name} {v.variation_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Insight Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Model Baseline & Confidence */}
            <InsightCard
              icon={<TrendingUp size={16} className="text-brand-500" />}
              title="Model Baseline & Confidence"
              content={insights?.model_baseline || "Loading model confidence data..."}
            />

            {/* Primary Forecast Demand Drivers */}
            <InsightCard
              icon={<Zap size={16} className="text-purple-500" />}
              title="Primary Forecast Demand Drivers"
              content={insights?.demand_drivers || "Loading demand driver analysis..."}
            />

            {/* SKU Velocity & Stockout Risk */}
            <InsightCard
              icon={<Package size={16} className="text-green-500" />}
              title="SKU Velocity & Stockout Risk"
              content={insights?.stockout_risk || "Loading stockout risk assessment..."}
              badge={insights?.velocity_class}
            />

            {/* Safety Stock & Buffer Bounds */}
            <InsightCard
              icon={<ShieldCheck size={16} className="text-blue-500" />}
              title="Safety Stock & Buffer Bounds"
              content={insights?.safety_stock || "Loading safety stock recommendations..."}
            />
          </div>
        </div>
      )}

      {/* Restocking Summary Table */}
      <div className="bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-[#2d3748] rounded-2xl p-6 card-hover animate-bounce-in stagger-3">
        <h2 className="text-[14px] font-semibold text-gray-900 dark:text-gray-50 mb-4">
          Recommended Restocking ({days}-Day Total) — {productFilter === "all" ? "All Products" : productFilter}
        </h2>

        {summaryData.length > 0 ? (
          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-2 text-gray-500 font-medium">Product</th>
                  <th className="text-left py-3 px-2 text-gray-500 font-medium">Variation</th>
                  <th className="text-right py-3 px-2 text-gray-500 font-medium">
                    <span className="inline-flex items-center gap-1 justify-end">Predicted <HeaderTooltip text="The total predicted demand quantity for this product variation over the selected forecast window. This is the model's best estimate of how many units customers will purchase." /></span>
                  </th>
                  <th className="text-right py-3 px-2 text-gray-500 font-medium">
                    <span className="inline-flex items-center gap-1 justify-end">Min Restock <HeaderTooltip text="The minimum recommended restock quantity (lower bound). Represents the minimum expected demand. Stocking at this level minimizes overstock risk but may lead to stockouts on busy days." /></span>
                  </th>
                  <th className="text-right py-3 px-2 text-gray-500 font-medium">
                    <span className="inline-flex items-center gap-1 justify-end">Max Restock <HeaderTooltip text="The maximum recommended restock quantity (upper bound). Represents peak expected demand. Stocking at this level ensures availability during surges but may lead to excess inventory." /></span>
                  </th>
                  <th className="text-right py-3 px-2 text-gray-500 font-medium">
                    <span className="inline-flex items-center gap-1 justify-end">Avg/Day <HeaderTooltip text="Average predicted daily restocking need. Useful for planning daily replenishment schedules and setting reorder points." /></span>
                  </th>
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

// ── Insight Card Component ──
function InsightCard({ icon, title, content, badge }: { icon: React.ReactNode; title: string; content: string; badge?: string }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 border border-gray-100 dark:border-gray-800">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="text-[12px] font-semibold text-gray-900 dark:text-gray-50">{title}</h3>
        {badge && (
          <span className={`ml-auto px-2 py-0.5 rounded-md text-[10px] font-semibold ${
            badge === "Class A Fast-Mover" ? "bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400" :
            badge === "Class B Moderate-Mover" ? "bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400" :
            "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
          }`}>
            {badge}
          </span>
        )}
      </div>
      <p className="text-[12px] text-gray-600 dark:text-gray-400 leading-relaxed">{content}</p>
    </div>
  );
}

function HeaderTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        className="text-gray-400 hover:text-brand-500 transition-colors cursor-help"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        aria-label="More info"
      >
        <Info size={12} />
      </button>
      {show && (
        <div className="absolute z-50 top-full right-0 mt-2 w-56 p-3 bg-gray-900 dark:bg-gray-800 text-white text-[11px] leading-relaxed rounded-lg shadow-lg pointer-events-none text-left font-normal normal-case">
          {text}
          <div className="absolute bottom-full right-2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-gray-900 dark:border-b-gray-800"></div>
        </div>
      )}
    </div>
  );
}
