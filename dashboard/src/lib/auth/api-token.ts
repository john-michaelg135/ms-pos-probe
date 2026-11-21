import { createHmac } from "node:crypto";
import type { ProbeUser } from "./token";

/** "probe-api" for API calls through the proxy; "probe-alerts-ws" for the live alerts socket's ticket. */
export type ApiAudience = "probe-api" | "probe-alerts-ws";

/** The AI service's signing key, or null when it isn't configured. */
export function apiSigningKey(): string | null {
  const secret = process.env.JWT_SECRET_KEY;
  return secret && secret.trim().length >= 32 ? secret : null;
}

/**
 * A 60-second HS256 token for the AI service, carrying the signed-in user's role and branch.
 * The AI service scopes every query by these claims, so they come only from the session cookie.
 */
export function signApiToken(user: ProbeUser, audience: ApiAudience, secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    sub: user.username, role: user.role, location: user.location,
    iss: "probe-dashboard", aud: audience, iat: now, exp: now + 60,
  });
  const signature = createHmac("sha256", secret).update(header + "." + payload).digest("base64url");
  return `${header}.${payload}.${signature}`;
}
