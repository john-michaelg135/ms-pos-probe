"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { fetchRevenue, fetchSalesByLocation, fetchSalesByProduct, fetchSalesByChannel } from "@/lib/api";
import { formatDate, formatDateShort } from "@/lib/format-date";
import { getVariationSortIndex } from "@/lib/variation-order";
import { useAnalyticsStore } from "@/stores/use-analytics-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroupPills } from "@/components/shared/ToggleGroupPills";
import {
  CHART_COLORS, AXIS_TICK, GRID_STROKE, tooltipContentStyle,
  tooltipLabelStyle, tooltipItemStyle, brandCursor,
} from "@/lib/chart-theme";

const TABS = [
  { id: "revenue", label: "Revenue Trends" },
  { id: "location", label: "By Location" },
  { id: "product", label: "By Product" },
  { id: "channel", label: "By Channel" },
];

export default function AnalyticsPage() {
  const {
    activeTab, setActiveTab, groupBy, setGroupBy,
    dateFrom, setDateFrom, dateTo, setDateTo,
  } = useAnalyticsStore();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Sales Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Revenue trends, sales by location, product, and channel
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="flex-wrap h-auto">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Date range + controls */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="date-from" className="text-xs text-muted-foreground">From</Label>
            <Input
              id="date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 w-auto"
            />
          </div>
          <span className="text-muted-foreground text-sm pb-2.5">to</span>
          <div className="space-y-1.5">
            <Label htmlFor="date-to" className="text-xs text-muted-foreground">To</Label>
            <Input
              id="date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 w-auto"
            />
          </div>
          {activeTab === "revenue" && (
            <div className="ml-auto">
              <ToggleGroupPills
                options={[
                  { value: "day", label: "Day" },
                  { value: "week", label: "Week" },
                  { value: "month", label: "Month" },
                ]}
                value={groupBy}
                onChange={(v) => setGroupBy(v as "day" | "week" | "month")}
              />
            </div>
          )}
        </div>

        <TabsContent value="revenue" className="mt-0">
          <ChartCard>
            <RevenueChart groupBy={groupBy} dateFrom={dateFrom} dateTo={dateTo} />
          </ChartCard>
        </TabsContent>
        <TabsContent value="location" className="mt-0">
          <ChartCard>
            <LocationChart dateFrom={dateFrom} dateTo={dateTo} />
          </ChartCard>
        </TabsContent>
        <TabsContent value="product" className="mt-0">
          <ChartCard>
            <ProductChart dateFrom={dateFrom} dateTo={dateTo} />
          </ChartCard>
        </TabsContent>
        <TabsContent value="channel" className="mt-0">
          <ChartCard>
            <ChannelChart dateFrom={dateFrom} dateTo={dateTo} />
          </ChartCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ChartCard({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-6">{children}</CardContent>
    </Card>
  );
}

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
        <p className="text-xs text-muted-foreground uppercase font-medium">Total Revenue</p>
        <p className="text-2xl font-bold text-foreground">
          ₱{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </p>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="period" tick={AXIS_TICK} tickFormatter={formatDateShort} />
          <YAxis tick={AXIS_TICK} tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`} width={55} />
          <Tooltip
            cursor={brandCursor}
            formatter={(v) => [`₱${Number(v).toLocaleString()}`, "Revenue"]}
            contentStyle={tooltipContentStyle}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
            labelFormatter={(label) => formatDate(String(label))}
          />
          <Bar dataKey="total_revenue" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

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
      <h3 className="text-sm font-medium text-foreground mb-4">Revenue by Location</h3>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
          <XAxis type="number" tick={AXIS_TICK} tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`} />
          <YAxis type="category" dataKey="location_name" tick={AXIS_TICK} width={170} />
          <Tooltip
            cursor={brandCursor}
            formatter={(v) => [`₱${Number(v).toLocaleString()}`, "Revenue"]}
            contentStyle={tooltipContentStyle}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
          />
          <Bar dataKey="total_revenue" radius={[0, 4, 4, 0]}>
            {data?.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-4 space-y-2">
        {data?.map((item, i) => (
          <div key={item.location_name} className="flex items-center gap-3 text-sm">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="text-foreground flex-1">{item.location_name}</span>
            <span className="text-muted-foreground">₱{item.total_revenue.toLocaleString()}</span>
            <span className="text-muted-foreground w-12 text-right">
              {((item.total_revenue / totalRevenue) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductChart({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics", "product", dateFrom, dateTo],
    queryFn: () => fetchSalesByProduct(dateFrom, dateTo),
  });

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState />;

  const chartData = data?.map((d) => {
    const name = `${d.product_name} ${d.variation_name}`;
    return {
      name,
      quantity: d.total_quantity,
      revenue: d.total_revenue,
      // Match the color each variation gets in the Demand Forecast line chart,
      // keyed by its canonical variation order (not the sales ranking).
      color: CHART_COLORS[getVariationSortIndex(name) % CHART_COLORS.length],
    };
  });

  return (
    <div>
      <h3 className="text-sm font-medium text-foreground mb-4">Quantity Sold by Product Variation</h3>
      <ResponsiveContainer width="100%" height={420}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
          <XAxis type="number" tick={AXIS_TICK} />
          <YAxis type="category" dataKey="name" tick={AXIS_TICK} width={200} />
          <Tooltip
            cursor={brandCursor}
            formatter={(v, name) => [
              name === "quantity" ? `${Number(v)} units` : `₱${Number(v).toLocaleString()}`,
              name === "quantity" ? "Quantity" : "Revenue",
            ]}
            contentStyle={tooltipContentStyle}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
          />
          <Bar dataKey="quantity" radius={[0, 4, 4, 0]}>
            {chartData?.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

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
      <h3 className="text-sm font-medium text-foreground mb-4">Revenue by Sales Channel</h3>
      <div className="flex flex-col md:flex-row items-center gap-8">
        <ResponsiveContainer width={250} height={250}>
          <PieChart>
            <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={4} dataKey="value" label={false}>
              {pieData?.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v) => [`₱${Number(v).toLocaleString()}`, "Revenue"]} contentStyle={tooltipContentStyle} itemStyle={tooltipItemStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="space-y-4">
          {data?.map((item, i) => (
            <div key={item.order_source} className="flex items-center gap-4">
              <div className="w-3 h-3 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
              <div>
                <p className="text-sm font-medium text-foreground">{item.order_source}</p>
                <p className="text-sm text-muted-foreground">
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

function LoadingState() {
  return (
    <div className="h-[320px] flex items-center justify-center">
      <p className="text-sm text-muted-foreground animate-pulse">Loading analytics data…</p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="h-[320px] flex items-center justify-center">
      <p className="text-sm text-destructive">Failed to load data. Is the AI service running?</p>
    </div>
  );
}
