import { NextResponse } from "next/server";
import { createSession, verifyToken } from "@/lib/auth";
import { checkRateLimit, clientIp } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/**
 * Hosts whose x-forwarded-* headers are trusted (Vercel / sandbox edge set
 * them; the browser cannot). Anything else is ignored so the redirect can
 * never be steered to a third-party origin.
 */
function trustedHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h.endsWith(".vercel.app") ||
    h.endsWith(".e2b.app") ||
    h === "localhost" ||
    h.startsWith("localhost:") ||
    h === "127.0.0.1" ||
    h.startsWith("127.0.0.1:")
  );
}

/**
 * Absolute origin of the *public* site. Behind Vercel / a preview proxy the
 * incoming request URL is an internal http:// host — redirecting the browser
 * there breaks the magic link — so use the (whitelisted) forwarded headers.
 */
function publicOrigin(request: Request, url: URL): string {
  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin
    : null;

  const fwdHost =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? "";
  const host =
    fwdHost && (trustedHost(fwdHost) || fwdHost === siteOrigin?.split("://")[1])
      ? fwdHost
      : url.host;

  const fwdProto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "";
  const proto =
    fwdProto === "https" || fwdProto === "http" ? fwdProto : url.protocol.replace(":", "");

  return `${proto}://${host}`;
}

/** Magic sign-in link: /admin/api/token?t=YOUR-TOKEN */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = publicOrigin(request, url);
  const token = url.searchParams.get("t") ?? "";
  const next = url.searchParams.get("next") ?? "/admin";

  // Same brute-force budget as the login form: 8 / 15 min / IP.
  const gate = checkRateLimit(`toklink:${clientIp(request.headers)}`, 8, 15 * 60 * 1000);
  const session = gate.ok ? await verifyToken(token) : null;
  if (!session) {
    return NextResponse.redirect(new URL("/admin/login?e=1", origin));
  }

  await createSession(session);
  return NextResponse.redirect(new URL(next.startsWith("/admin") ? next : "/admin", origin));
}
