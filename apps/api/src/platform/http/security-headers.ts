import type { RequestHandler } from "express";
import helmet from "helmet";

/**
 * Security headers for a JSON-only API (security-design.md §3). HSTS is sent
 * only in production, where the API is served over HTTPS.
 */
export function securityHeaders(production: boolean): RequestHandler[] {
  return [
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      strictTransportSecurity: production
        ? { maxAge: 31_536_000, includeSubDomains: true }
        : false,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      xContentTypeOptions: true,
      xPoweredBy: false,
    }),
    (_req, res, next) => {
      res.setHeader(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=(), payment=()",
      );
      next();
    },
  ];
}
