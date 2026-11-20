import Image from "next/image";

import { cn } from "@/lib/utils";

/** Sidebar brand block, laid out exactly like the POS one, with this system's name in the badge. */
export function BrandLockup({ className, forPrint = false }: { className?: string; forPrint?: boolean }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-3 text-left", className)}>
      <span className="relative size-12 shrink-0 overflow-hidden rounded-[12px] border border-[#ece6f2] bg-white">
        <Image alt="" src="/images/logo/chef-tile.png" fill sizes="48px" loading={forPrint ? "eager" : undefined} unoptimized={forPrint} className="object-contain p-[3px]" />
      </span>
      <span className="flex min-w-0 flex-col gap-[3px] font-semibold">
        <span className="truncate font-[family-name:var(--font-fraunces)] text-xl leading-normal text-[#2a0f3f] dark:text-white print:text-[#2a0f3f]!"
          style={{ fontVariationSettings: '"SOFT" 0, "WONK" 1' }}>
          Bren Raphael&apos;s
        </span>
        <span className="text-[9px] uppercase leading-3 tracking-[1.1px] text-[#7a5899] dark:text-[#cdb8e6] print:text-[#7a5899]!">
          POS Probe
        </span>
      </span>
    </span>
  );
}
