"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, ShieldCheck, Zap, Package } from "lucide-react";
import { fetchForecast, fetchForecastInsights, fetchForecastLocations } from "@/lib/api";
import { formatDate, formatDateShort } from "@/lib/format-date";
import { getVariationSortIndex } from "@/lib/variation-order";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ToggleGroupPills } from "@/components/shared/ToggleGroupPills";
import {
  CHART_COLORS, AXIS_TICK, GRID_STROKE, tooltipContentStyle, tooltipLabelStyle,
} from "@/lib/chart-theme";

const FORECAST_WINDOWS = [
  { label: "7 Days", value: "7" },
  { label: "14 Days", value: "14" },
  { label: "30 Days", value: "30" },
];

const PRODUCT_FILTERS = [
  { label: "All Products", value: "all" },
  { label: "Ube Halaya", value: "Ube Halaya" },
  { label: "Ube Jam", value: "Ube Jam" },
];

export default function ForecastPage() {
  const [days, setDays] = useState(7);
  const [productFilter, setProductFilter] = useState("all");
  const [selectedVariationId, setSelectedVariationId] = useState<number | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["forecast", days, selectedLocationId],
    queryFn: () => fetchForecast(days, undefined, selectedLocationId ?? undefined),
  });

  const { data: locations } = useQuery({
    queryKey: ["forecast", "locations"],
    queryFn: fetchForecastLocations,
  });

  const { data: insights } = useQuery({
    queryKey: ["forecast", "insights", days, selectedVariationId],
    queryFn: () => fetchForecastInsights(days, selectedVariationId ?? undefined),
    enabled: !!data && data.length > 0,
  });

  const filteredData = useMemo(() => {
    if (!data) return [];
    if (productFilter === "all") return data;
    return data.filter((item) => item.product_name === productFilter);
  }, [data, productFilter]);

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

  const variations = useMemo(() => {
    if (!filteredData) return [];
    const set = new Set(
      filteredData.map((d) =>
        productFilter === "all" ? `${d.product_name} ${d.variation_name}` : d.variation_name
      )
    );
    return [...set].sort((a, b) => {
      const fullA = productFilter === "all" ? a : `${productFilter} ${a}`;
      const fullB = productFilter === "all" ? b : `${productFilter} ${b}`;
      return getVariationSortIndex(fullA) - getVariationSortIndex(fullB);
    });
  }, [filteredData, productFilter]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Demand Forecast</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Predicted daily demand for each Ube product variation
          </p>
        </div>

        <div className="flex flex-col gap-2 lg:items-end">
          <div className="w-[280px]">
            <Select
              value={selectedLocationId ?? "all"}
              onValueChange={(v: string) => setSelectedLocationId(v === "all" ? null : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All Locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {locations?.map((loc, i) => (
                  <SelectItem key={`loc-${i}`} value={loc.location_name}>{loc.location_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ToggleGroupPills
            className="w-[280px]"
            options={PRODUCT_FILTERS}
            value={productFilter}
            onChange={setProductFilter}
          />
          <ToggleGroupPills
            className="w-[280px]"
            options={FORECAST_WINDOWS}
            value={String(days)}
            onChange={(v) => setDays(Number(v))}
          />
        </div>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Predicted Demand (Next {days} Days)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-[350px] flex items-center justify-center">
              <p className="text-sm text-muted-foreground animate-pulse">Loading forecast data…</p>
            </div>
          ) : error ? (
            <div className="h-[350px] flex items-center justify-center">
              <p className="text-sm text-destructive">Failed to load forecast. Is the AI service running?</p>
            </div>
          ) : chartData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="date" tick={AXIS_TICK} tickFormatter={formatDateShort} />
                  <YAxis tick={AXIS_TICK} />
                  <Tooltip
                    contentStyle={{ ...tooltipContentStyle, maxHeight: 350, overflow: "auto" }}
                    labelStyle={{ ...tooltipLabelStyle, fontWeight: 600 }}
                    labelFormatter={(label) => formatDate(String(label))}
                  />
                  <Legend content={() => null} />
                  {variations.map((name, i) => (
                    <Area
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                      fillOpacity={0.06}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>

              <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 px-2">
                {variations.map((name, i) => (
                  <div key={name} className="flex items-center gap-1.5">
                    <div className="w-3 h-[3px] rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="text-[10px] text-muted-foreground">{name}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-[350px] flex items-center justify-center">
              <p className="text-sm text-muted-foreground">No forecast data available. Train the model first.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Forecast Explanations & Key Drivers */}
      {data && data.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-brand-500/10 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-4 h-4 text-brand-500" />
                </div>
                <div>
                  <CardTitle>AI Forecast Explanations &amp; Key Drivers</CardTitle>
                  <CardDescription>
                    Data-backed demand insights derived from historical POS transaction patterns
                  </CardDescription>
                </div>
                <Badge variant="purple">{insights?.engine || "Statsmodels"} Additive ML</Badge>
              </div>

              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Analyze SKU:</Label>
                <Select
                  value={selectedVariationId != null ? String(selectedVariationId) : "all"}
                  onValueChange={(v: string) => setSelectedVariationId(v === "all" ? null : Number(v))}
                >
                  <SelectTrigger className="w-[240px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Variations (System Total)</SelectItem>
                    {availableVariations.map((v) => (
                      <SelectItem key={v.variation_id} value={String(v.variation_id)}>
                        {v.product_name} {v.variation_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InsightCard
                icon={<TrendingUp className="w-4 h-4 text-brand-500" />}
                title="Model Baseline & Confidence"
                content={insights?.model_baseline || "Loading model confidence data…"}
              />
              <InsightCard
                icon={<Zap className="w-4 h-4 text-purple-500" />}
                title="Primary Forecast Demand Drivers"
                content={insights?.demand_drivers || "Loading demand driver analysis…"}
              />
              <InsightCard
                icon={<Package className="w-4 h-4 text-success" />}
                title="SKU Velocity & Stockout Risk"
                content={insights?.stockout_risk || "Loading stockout risk assessment…"}
                badge={insights?.velocity_class}
              />
              <InsightCard
                icon={<ShieldCheck className="w-4 h-4 text-info" />}
                title="Safety Stock & Buffer Bounds"
                content={insights?.safety_stock || "Loading safety stock recommendations…"}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InsightCard({ icon, title, content, badge }: { icon: React.ReactNode; title: string; content: string; badge?: string }) {
  const badgeVariant =
    badge === "Class A Fast-Mover" ? "success" :
    badge === "Class B Moderate-Mover" ? "info" : "secondary";
  return (
    <div className="bg-muted/40 rounded-xl p-4 border border-border">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="text-xs font-semibold text-foreground">{title}</h3>
        {badge && <Badge variant={badgeVariant} className="ml-auto">{badge}</Badge>}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{content}</p>
    </div>
  );
}
