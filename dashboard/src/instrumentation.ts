export function register() {
  if (process.env.NODE_ENV !== "production") return;
  if (!process.env.PROBE_HANDOFF_SECRET || (process.env.JWT_SECRET_KEY?.trim().length ?? 0) < 32) {
    throw new Error("Configure PROBE_HANDOFF_SECRET and a server-only JWT_SECRET_KEY before starting the dashboard.");
  }
}
