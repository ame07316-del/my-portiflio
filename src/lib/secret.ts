/**
 * Shared runtime helpers so auth and the database bootstrap never drift apart.
 */

/**
 * Publicly documented starter token (see README). Development only —
 * production refuses to fall back to it (see getAdminToken / db seed).
 */
export const DEFAULT_ADMIN_TOKEN = "amr-portfolio-2025";

/** True when running on a deployed platform (Vercel / prod Node). */
export function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL)
  );
}
