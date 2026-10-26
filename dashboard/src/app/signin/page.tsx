import Image from "next/image";
import { Radar } from "lucide-react";
import { posUrl } from "@/lib/auth/token";

/**
 * POS-PROBE has no sign-in form of its own: the owner and POS Managers open it with the
 * "Open Probe" button in the POS's Sales Processing page.
 */
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <Image
          alt="Bren Raphael's"
          className="mx-auto size-14 rounded-xl"
          height={56}
          src="/images/bren-raphaels-logo.svg"
          unoptimized
          width={56}
        />
        <h1 className="mt-5 text-2xl font-bold tracking-tight text-foreground">Open POS-PROBE from the POS</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {reason === "expired"
            ? "That link has expired. Open the probe again from the POS."
            : "Sign in to the POS, then use the Open Probe button on the Sales Processing page. It's available to the owner and POS Managers."}
        </p>
        <a
          className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          href={`${posUrl()}/sales-processing`}
        >
          <Radar aria-hidden className="size-4" />
          Go to the POS
        </a>
      </div>
    </main>
  );
}
