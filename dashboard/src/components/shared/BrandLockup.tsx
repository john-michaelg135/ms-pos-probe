import Image from "next/image";

import { cn } from "@/lib/utils";

/** Sidebar brand block, laid out exactly like the POS one, with this system's name in the badge. */
export function BrandLockup({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-[11px] rounded-xl p-1", className)}>
      {/* Decorative: the adjacent "Bren Raphael's" text names the brand. */}
      <Image
        alt=""
        className="size-11 shrink-0 rounded-[10px]"
        height={44}
        src="/images/bren-raphaels-logo.svg"
        unoptimized
        width={44}
      />
      <div className="flex min-w-0 flex-col gap-1.5 pr-1">
        <span className="truncate text-xl font-bold leading-none text-foreground">Bren Raphael&apos;s</span>
        <span className="inline-block w-fit truncate rounded-md bg-brand-badge px-2 py-[3px] text-[11px] font-semibold text-brand-badge-foreground">
          POS Probe
        </span>
      </div>
    </div>
  );
}
