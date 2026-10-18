import type { Config } from "../config.ts";

export const ADMIN_PREFIX = "/api/v1/admin";

/**
 * True when the request path belongs to the admin surface. Case-insensitive,
 * because Express routing is: /API/V1/ADMIN/x reaches /api/v1/admin/x routes.
 */
export function isAdminPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower === ADMIN_PREFIX || lower.startsWith(`${ADMIN_PREFIX}/`);
}

/**
 * The single origin allowed for a path: the admin origin for admin routes,
 * the storefront origin for everything else (security-design.md §3).
 */
export function allowedOriginFor(path: string, config: Config): string {
  return isAdminPath(path) ? config.adminOrigin : config.storefrontOrigin;
}
