import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifyToken } from "@/lib/auth/token";

async function training(request: NextRequest) {
  const user = verifyToken(request.cookies.get(SESSION_COOKIE)?.value, "probe-session");
  if (user?.role !== "manager") return NextResponse.json({}, { status: 403 });
  const key = process.env.PROBE_TRAINING_KEY;
  if (!key) return NextResponse.json({}, { status: 503 });
  const gateway = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5020";
  try {
    const response = await fetch(new URL("/api/probe/sync/training", gateway), {
      method: request.method, headers: { "X-Training-Key": key }, cache: "no-store",
      redirect: "error", signal: AbortSignal.timeout(10000),
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({}, { status: 503 });
  }
}

export { training as GET, training as POST };
