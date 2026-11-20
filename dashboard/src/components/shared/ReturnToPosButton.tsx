import { ArrowLeft } from "lucide-react";

import { posSalesUrl } from "@/lib/pos-url";

/** Foot of the sidebar: back to the POS, where the probe is opened from. The probe session stays. */
export function ReturnToPosButton() {
  return (
    <a
      href={posSalesUrl}
      className="inline-flex h-9 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-1 focus-visible:ring-ring [&_svg]:size-4 [&_svg]:shrink-0"
    >
      <ArrowLeft aria-hidden="true" />
      Return to POS
    </a>
  );
}
