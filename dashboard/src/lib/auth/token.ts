import { createHmac, timingSafeEqual } from "node:crypto";
import type { UserRole } from "./roles";

/** Who is signed in, as the POS vouched for them. */
export type ProbeUser = {
  name: string;
  username: string;
  email: string;
  /** Their POS role, e.g. "Super Admin" or "POS Manager". */
  posRole: string;
  role: UserRole;
};

export const SESSION_COOKIE = "probe_session";
export const SESSION_SECONDS = 8 * 60 * 60;

/** Where people are sent to sign in: the POS, whose "Open Probe" button signs them in here. */
export function posUrl(): string {
  return (process.env.NEXT_PUBLIC_POS_URL ?? "https://localhost:3002").replace(/\/$/, "");
}

function secret(): string {
  const value = process.env.PROBE_HANDOFF_SECRET;

  if (!value) {
    throw new Error("PROBE_HANDOFF_SECRET is not set; see .env.production.example");
  }

  return value;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

/**
 * Reads a signed token, either the POS's short-lived "probe-handoff" pass or this app's own
 * "probe-session" cookie. The purpose is part of the signed payload, so one can't stand in for the other.
 */
export function verifyToken(token: string | undefined, purpose: "probe-handoff" | "probe-session"): ProbeUser | null {
  if (!token) return null;

  const [payload, signature] = token.split(".");

  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);

  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    const now = Math.floor(Date.now() / 1000);

    if (claims.purpose !== purpose || typeof claims.exp !== "number" || claims.exp < now) return null;
    if (claims.role !== "owner" && claims.role !== "manager") return null;
    if (typeof claims.name !== "string" || typeof claims.username !== "string") return null;

    return {
      name: claims.name,
      username: claims.username,
      email: typeof claims.email === "string" ? claims.email : "",
      posRole: typeof claims.posRole === "string" ? claims.posRole : "",
      role: claims.role,
    };
  } catch {
    return null;
  }
}

/** This app's own session cookie value, signed so the browser can't change who it says they are. */
export function signSession(user: ProbeUser): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ purpose: "probe-session", ...user, iat: now, exp: now + SESSION_SECONDS }),
  ).toString("base64url");

  return `${payload}.${sign(payload)}`;
}
