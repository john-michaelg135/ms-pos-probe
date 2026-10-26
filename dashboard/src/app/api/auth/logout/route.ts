import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/token";

export const dynamic = "force-dynamic";

/** Ends the POS-PROBE session only; the POS and Enterprise Portal sessions are left alone. */
export function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);

  return response;
}
