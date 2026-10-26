import { NextResponse, type NextRequest } from "next/server";
import { canAccessRoute } from "@/lib/auth/roles";
import { SESSION_COOKIE, verifyToken } from "@/lib/auth/token";

const SIGN_IN_PATH = "/signin";

/**
 * Every page needs a POS-PROBE session, which only the POS "Open Probe" button hands out.
 * A page outside the signed-in role's set goes back to the Dashboard.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const user = verifyToken(request.cookies.get(SESSION_COOKIE)?.value, "probe-session");

  if (pathname === SIGN_IN_PATH) {
    return user ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }

  if (!user) {
    return NextResponse.redirect(new URL(SIGN_IN_PATH, request.url));
  }

  if (!canAccessRoute(user.role, pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Pages only: the auth API routes, Next's own files and public images check nothing here.
  matcher: ["/((?!api/|_next/static|_next/image|images/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
