import { NextResponse } from "next/server";
import { createSession, verifyToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Absolute URL of the *public* site. Behind Vercel / a preview proxy the
 * incoming request URL is an internal http:// host, and redirecting to it
 * breaks the magic link — so prefer the forwarded headers.
 */
function publicOrigin(request: Request, url: URL) {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    url.host;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0] ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

/** Magic sign-in link: /admin/api/token?t=YOUR-TOKEN */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = publicOrigin(request, url);
  const token = url.searchParams.get("t") ?? "";
  const next = url.searchParams.get("next") ?? "/admin";

  const session = await verifyToken(token);
  if (!session) {
    return NextResponse.redirect(new URL("/admin/login?e=1", origin));
  }

  await createSession(session);
  return NextResponse.redirect(
    new URL(next.startsWith("/admin") ? next : "/admin", origin),
  );
}
