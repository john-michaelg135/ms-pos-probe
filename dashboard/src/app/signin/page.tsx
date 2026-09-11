"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * br-trellis-style sign-in entry point.
 *
 * In br-trellis this redirects to the OIDC provider. POS-PROBE uses a local
 * credential form, so `/signin` simply forwards to `/login`.
 */
export default function SignInPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/login");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-sm text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm">Redirecting to sign in…</p>
      </div>
    </div>
  );
}
