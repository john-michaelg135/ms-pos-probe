import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifyToken } from "@/lib/auth/token";

export const dynamic = "force-dynamic";

async function forward(request: NextRequest) {
  const user = verifyToken(request.cookies.get(SESSION_COOKIE)?.value, "probe-session");
  if (!user) return NextResponse.json({ detail: "Sign in through POS" }, { status: 401 });

  const secret = process.env.JWT_SECRET_KEY;
  if (!secret || secret.trim().length < 32) {
    return NextResponse.json({ detail: "API signing key unavailable" }, { status: 503 });
  }
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    sub: user.username, role: user.role, location: user.location,
    iss: "probe-dashboard", aud: "probe-api", iat: now, exp: now + 60,
  });
  const signature = createHmac("sha256", secret).update(header + "." + payload).digest("base64url");
  const target = new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:5020");
  target.pathname = request.nextUrl.pathname;
  target.search = request.nextUrl.search;
  try {
    const response = await fetch(target, {
      method: request.method,
      headers: { Authorization: `Bearer ${header}.${payload}.${signature}`, "Content-Type": "application/json" },
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
