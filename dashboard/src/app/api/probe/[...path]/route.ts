import { NextRequest, NextResponse } from "next/server";
import { apiSigningKey, signApiToken } from "@/lib/auth/api-token";
import { SESSION_COOKIE, verifyToken } from "@/lib/auth/token";

export const dynamic = "force-dynamic";

async function forward(request: NextRequest) {
  const user = verifyToken(request.cookies.get(SESSION_COOKIE)?.value, "probe-session");
  if (!user) return NextResponse.json({ detail: "Sign in through POS" }, { status: 401 });

  const secret = apiSigningKey();
  if (!secret) {
    return NextResponse.json({ detail: "API signing key unavailable" }, { status: 503 });
  }
  const target = new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:5020");
  target.pathname = request.nextUrl.pathname;
  target.search = request.nextUrl.search;
  try {
    const response = await fetch(target, {
      method: request.method,
      headers: { Authorization: `Bearer ${signApiToken(user, "probe-api", secret)}`, "Content-Type": "application/json" },
      body: request.method === "GET" ? undefined : await request.text(),
      redirect: "error", cache: "no-store", signal: request.signal,
    });
    return new Response(response.body, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") || "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ detail: "Probe gateway unavailable" }, { status: 502 });
  }
}

export { forward as GET, forward as POST, forward as PUT };
