import Image from "next/image";

import { cn } from "@/lib/utils";

/** The Enterprise Portal sidebar brand block, with this system's name in the badge. */
export function BrandLockup({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-[11px]", className)}>
      {/* Decorative: the adjacent "Bren Raphael's" text names the brand. */}
      <Image
        alt=""
        className="size-11 shrink-0 rounded-[10px]"
        height={44}
        src="/images/bren-raphaels-logo.svg"
        unoptimized
        width={44}
      />
      <div className="flex min-w-0 flex-col items-start gap-1.5">
        <span className="truncate text-xl/[normal] font-bold text-foreground">Bren Raphael&apos;s</span>
        <span className="rounded-md bg-brand-badge px-2 py-[3px] text-[11px] font-semibold leading-[normal] text-brand-badge-foreground">
          POS Probe
        </span>
      </div>
    </div>
  );
}
