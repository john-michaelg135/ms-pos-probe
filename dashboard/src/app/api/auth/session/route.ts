import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifyToken } from "@/lib/auth/token";

export const dynamic = "force-dynamic";

/** Who is signed in, for the client; the session cookie itself is out of the browser's reach. */
export function GET(request: NextRequest) {
  const user = verifyToken(request.cookies.get(SESSION_COOKIE)?.value, "probe-session");

  return user
    ? NextResponse.json({ user })
    : NextResponse.json({ user: null }, { status: 401 });
}
