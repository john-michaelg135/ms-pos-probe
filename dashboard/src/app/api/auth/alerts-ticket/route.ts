import { NextResponse, type NextRequest } from "next/server";
import { apiSigningKey, signApiToken } from "@/lib/auth/api-token";
import { SESSION_COOKIE, verifyToken } from "@/lib/auth/token";

export const dynamic = "force-dynamic";

/**
 * A 60-second ticket for the live alerts WebSocket, sent as the socket's first message.
 * Browsers can't set an Authorization header on a WebSocket, and the session cookie belongs to
 * this origin, not the gateway's. The ticket's audience keeps it from working as an API bearer.
 */
export function POST(request: NextRequest) {
  const user = verifyToken(request.cookies.get(SESSION_COOKIE)?.value, "probe-session");
  if (!user) return NextResponse.json({ detail: "Sign in through POS" }, { status: 401 });

  const secret = apiSigningKey();
  if (!secret) return NextResponse.json({ detail: "API signing key unavailable" }, { status: 503 });

  return NextResponse.json(
    { ticket: signApiToken(user, "probe-alerts-ws", secret) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
