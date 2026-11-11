import { variationIndexFromName } from "@/lib/variation-order";

/**
 * Shared Recharts styling helpers so charts follow the shadcn theme tokens
 * instead of hardcoded hex values. Colors reference CSS variables defined in
 * globals.css (brand palette + chart tokens), so they adapt to light/dark.
 */

export const CHART_COLORS = [
  "var(--color-brand-500)",
  "var(--color-blue-light-500)",
  "var(--color-warning-500)",
  "var(--color-success-500)",
  "var(--color-error-500)",
  "#ee46bc",
  "var(--color-purple-500)",
];

export const AXIS_TICK = {
  fontSize: 10,
  fill: "var(--color-muted-foreground)",
} as const;

/** Forecast units as whole jars (the forecast is rounded to the nearest unit). */
export function formatAvgUnits(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return String(Math.round(value));
}

/** Y-axis title for forecast charts. */
export const AVG_UNITS_AXIS_LABEL = {
  value: "Units per day",
  angle: -90,
  position: "insideLeft",
  offset: 12,
  style: { fontSize: 10, fill: "var(--color-muted-foreground)", textAnchor: "middle" },
} as const;

export const GRID_STROKE = "var(--color-border)";

export const tooltipContentStyle = {
  background: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--color-popover-foreground)",
} as const;

export const tooltipLabelStyle = {
  color: "var(--color-foreground)",
  marginBottom: 4,
} as const;

export const tooltipItemStyle = {
  color: "var(--color-muted-foreground)",
} as const;

export const brandCursor = { fill: "color-mix(in oklab, var(--color-brand-500) 8%, transparent)" };


/** One fixed colour per variation, so a product looks the same in every chart. */
export function variationColor(name: string): string {
  const index = variationIndexFromName(name);
  if (index !== 999) return CHART_COLORS[index % CHART_COLORS.length];
  // A variation outside the built-in catalog (e.g. a new 300g jar): a stable colour from its name,
  // so several unknown variations don't all share the first colour.
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return CHART_COLORS[hash % CHART_COLORS.length];
}
