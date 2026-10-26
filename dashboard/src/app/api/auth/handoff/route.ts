import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_SECONDS, signSession, verifyToken } from "@/lib/auth/token";

export const dynamic = "force-dynamic";

/** Arrival from the POS "Open Probe" button: trades its signed pass for a POS-PROBE session. */
export function GET(request: NextRequest) {
  const user = verifyToken(request.nextUrl.searchParams.get("token") ?? undefined, "probe-handoff");

  if (!user) {
    return NextResponse.redirect(new URL("/signin?reason=expired", request.url));
  }

  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(SESSION_COOKIE, signSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_SECONDS,
  });

  return response;
}
