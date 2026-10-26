"use client";

import { useAuthStore } from "@/stores/use-auth-store";

/** A manager's branch, which every page's data is fixed to; null for the owner, who sees every location. */
export function useLockedLocation(): string | null {
  const user = useAuthStore((state) => state.user);

  return user?.role === "manager" ? (user.location?.name ?? null) : null;
}

/** Page-header badge naming whose data is shown: the manager's branch, or "All Locations" for the owner. */
export function PageLocationBadge() {
  const user = useAuthStore((state) => state.user);
  const locked = useLockedLocation();

  if (!user) return null;

  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
      {locked ?? "All Locations"}
    </span>
  );
}
