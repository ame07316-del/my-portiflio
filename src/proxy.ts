import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Optimistic auth check (Next.js 16 renamed Middleware -> Proxy).
 * The real authorization happens again inside every admin page & server action.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isLogin = pathname === "/admin/login";
  const hasSession = Boolean(request.cookies.get("pf_session")?.value);

  if (!hasSession && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (hasSession && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
