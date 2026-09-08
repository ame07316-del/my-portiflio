import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Optimistic auth check (Next.js 16 renamed Middleware -> Proxy).
 * The real authorization happens again inside every admin page & server action.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isLogin = pathname === "/admin/login";
  // the magic-link route authenticates itself with the ?t= token
  const isTokenLink = pathname === "/admin/api/token";
  const hasSession = Boolean(request.cookies.get("pf_session")?.value);

  if (!hasSession && !isLogin && !isTokenLink) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  // Only bounce *navigations* away from the login page. Server Action POSTs
  // (login submit) must reach the route or React receives an HTML redirect
  // instead of an RSC payload ("An unexpected response was received").
  const isNavigation =
    request.method === "GET" && !request.headers.get("next-action");

  if (hasSession && isLogin && isNavigation) {
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
