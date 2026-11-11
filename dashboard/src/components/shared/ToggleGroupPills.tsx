"use client";

import { cn } from "@/lib/utils";

export interface PillOption {
  value: string;
  label: string;
}

interface ToggleGroupPillsProps {
  options: PillOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Themed segmented control (pill group) built on shadcn theme tokens.
 * Used for filters like day/week/month or All/Predictive/Anomaly.
 */
export function ToggleGroupPills({ options, value, onChange, className }: ToggleGroupPillsProps) {
  return (
    <div className={cn("inline-flex items-center gap-1 rounded-xl bg-muted p-1", className)} role="tablist">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors cursor-pointer",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
