import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { query, queryOne } from "@/lib/db";
import type { User } from "@/lib/types";

const COOKIE = "pf_session";
const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-only-secret-change-me-in-production-32chars",
);

export type Session = { uid: number; email: string; name: string };

export async function createSession(user: Session) {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      uid: Number(payload.uid),
      email: String(payload.email),
      name: String(payload.name),
    };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}

/* ----------------------------- token access ----------------------------- */

export const DEFAULT_ADMIN_TOKEN = "amr-portfolio-2025";

/** The single key that opens the dashboard. Env wins over the database. */
export async function getAdminToken(): Promise<string> {
  const fromEnv = process.env.ADMIN_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  try {
    const row = await queryOne<{ admin_token: string }>(
      "SELECT admin_token FROM settings WHERE id = 1",
    );
    return row?.admin_token?.trim() || DEFAULT_ADMIN_TOKEN;
  } catch {
    return DEFAULT_ADMIN_TOKEN;
  }
}

/** Constant-time-ish comparison so the token can't be guessed by timing. */
function sameToken(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyToken(token: string): Promise<Session | null> {
  const expected = await getAdminToken();
  if (!token || !sameToken(token.trim(), expected)) return null;

  const owner = await queryOne<{ name_en: string; email: string }>(
    "SELECT name_en, email FROM settings WHERE id = 1",
  ).catch(() => null);

  return {
    uid: 1,
    email: owner?.email || "owner@portfolio",
    name: owner?.name_en || "Owner",
  } satisfies Session;
}

export async function setAdminToken(token: string) {
  await query("UPDATE settings SET admin_token = $1 WHERE id = 1", [token.trim()]);
}

export async function verifyCredentials(email: string, password: string) {
  const user = await queryOne<User>("SELECT * FROM users WHERE email = $1", [
    email.trim().toLowerCase(),
  ]);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return null;
  return { uid: user.id, email: user.email, name: user.name } satisfies Session;
}

export async function changePassword(
  uid: number,
  current: string,
  next: string,
) {
  const user = await queryOne<User>("SELECT * FROM users WHERE id = $1", [uid]);
  if (!user) return "USER_NOT_FOUND";
  const ok = await bcrypt.compare(current, user.password_hash);
  if (!ok) return "WRONG_PASSWORD";
  const hash = await bcrypt.hash(next, 10);
  await query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, uid]);
  return "OK";
}

export async function updateAccount(uid: number, name: string, email: string) {
  await query("UPDATE users SET name = $1, email = $2 WHERE id = $3", [
    name,
    email.trim().toLowerCase(),
    uid,
  ]);
}

export const SESSION_COOKIE = COOKIE;
