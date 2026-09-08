import { NextResponse } from "next/server";
import { createSession, verifyToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Magic sign-in link: /admin/api/token?t=YOUR-TOKEN */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("t") ?? "";
  const next = url.searchParams.get("next") ?? "/admin";

  const session = await verifyToken(token);
  if (!session) {
    return NextResponse.redirect(new URL("/admin/login?e=1", url.origin));
  }

  await createSession(session);
  return NextResponse.redirect(
    new URL(next.startsWith("/admin") ? next : "/admin", url.origin),
  );
}
