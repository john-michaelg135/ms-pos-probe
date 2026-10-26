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
  return CHART_COLORS[(index === 999 ? 0 : index) % CHART_COLORS.length];
}
