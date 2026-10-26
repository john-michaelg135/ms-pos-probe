/** The two ways into POS-PROBE: the owner (POS Super Admin or CEO) and POS Managers. */
export type UserRole = "owner" | "manager";

/** The pages each role may open. */
export const ROLE_ACCESS: Record<UserRole, string[]> = {
  owner: ["/", "/reports"],
  manager: ["/", "/forecast", "/forecast/quota", "/alerts", "/reports", "/accuracy"],
};

export function canAccessRoute(role: UserRole | undefined, path: string): boolean {
  if (!role) return false;
  const allowed = ROLE_ACCESS[role];
  return allowed.some((route) => path === route || (route !== "/" && path.startsWith(route)));
}
