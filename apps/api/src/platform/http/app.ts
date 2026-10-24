import cookieParser from "cookie-parser";
import express, { type Express, type Router } from "express";
import { pinoHttp } from "pino-http";
import type { Logger } from "pino";

import { auditRouter } from "../../modules/audit/router.ts";
import { adminSession } from "../../modules/auth/middleware.ts";
import {
  DEFAULT_ARGON2,
  type Argon2Params,
} from "../../modules/auth/password.ts";
import {
  DEFAULT_AUTH_LIMITS,
  authRouter,
  type AuthLimits,
} from "../../modules/auth/router.ts";
import { adminProductsRouter } from "../../modules/catalogue/admin-products.ts";
import { adminTaxonomyRouter } from "../../modules/catalogue/admin-taxonomy.ts";
import { publicCatalogueRouter } from "../../modules/catalogue/public-router.ts";
import { cartRouter } from "../../modules/cart/router.ts";
import { contentAdminRouter } from "../../modules/content/admin-router.ts";
import { contentPublicRouter } from "../../modules/content/public-router.ts";
import type { ModuleDeps } from "../../modules/deps.ts";
import { healthRouter } from "../../modules/health/router.ts";
import { startReservationExpiry } from "../../modules/inventory/jobs.ts";
import { inventoryRouter } from "../../modules/inventory/router.ts";
import { mediaRouter } from "../../modules/media/router.ts";
import {
  localMediaStorage,
  type MediaStorage,
} from "../../modules/media/storage.ts";
import { staffRouter } from "../../modules/staff/router.ts";
import type { Config } from "../config.ts";
import type { Db } from "../db.ts";
import { jsonBody, requireJson } from "./body.ts";
import { corsPolicy } from "./cors.ts";
import { csrfProtection, csrfRouter } from "./csrf.ts";
import { errorHandler, notFound } from "./errors.ts";
import { globalRateLimit } from "./rate-limit.ts";
import { requestId } from "./request-id.ts";
import { securityHeaders } from "./security-headers.ts";

export type AppOptions = {
  readonly config: Config;
  readonly logger: Logger;
  /** Extra routers mounted after the platform routes (tests; later phases). */
  readonly routers?: readonly Router[];
  /** With a database, the admin auth, staff and audit modules are mounted. */
  readonly db?: Db;
  /** Test seams: clock, cheaper Argon2 parameters, higher auth rate limits. */
  readonly now?: () => Date;
  readonly argon2?: Argon2Params;
  readonly authLimits?: AuthLimits;
  /** Media storage; defaults to the local folder MEDIA_DIR. */
  readonly media?: MediaStorage;
  /** Start background jobs (reservation expiry). Only main.ts sets this. */
  readonly jobs?: boolean;
};

/** Builds the Express app. Middleware order matters; see each step. */
export function createApp({
  config,
  logger,
  routers = [],
  db,
  now = () => new Date(),
  argon2 = DEFAULT_ARGON2,
  authLimits = DEFAULT_AUTH_LIMITS,
  media,
  jobs = false,
}: AppOptions): Express {
  const deps: ModuleDeps | undefined = db
    ? {
        db,
        config,
        logger,
        now,
        argon2,
        media: media ?? localMediaStorage(config.mediaDir),
      }
    : undefined;
  const app = express();
  app.set("trust proxy", config.trustProxy);
  app.disable("x-powered-by");

  app.use(requestId); // 1. server-generated request ID
  app.use(pinoHttp({ logger, genReqId: (req) => req.id })); // 2. request logs
  app.use(securityHeaders(config.nodeEnv === "production")); // 3. headers on every response
  app.use(corsPolicy(config)); // 4. CORS, including preflight
  app.use(globalRateLimit()); // 5. 300/min per IP, health exempt
  app.use(cookieParser()); // 6. cookies for CSRF and admin sessions
  if (deps) app.use(adminSession(deps)); // 6a. admin session, so CSRF can bind to it
  app.use(csrfProtection(config)); // 7. Origin + token on state-changing methods
  app.use(requireJson); // 8. 415 for non-JSON bodies
  app.use(jsonBody); // 9. 100 KB JSON

  // Development only: serve local media derivatives. In production a CDN
  // serves them and the API never does (security-design.md §6).
  const mediaDir = deps?.media.localPublicDir;
  if (
    deps &&
    mediaDir &&
    config.nodeEnv !== "production" &&
    config.mediaPublicBaseUrl.startsWith("/")
  ) {
    app.use(
      config.mediaPublicBaseUrl,
      express.static(mediaDir, {
        immutable: true,
        maxAge: "365d",
        index: false,
        dotfiles: "deny",
      }),
    );
  }

  app.use(healthRouter());
  app.use(csrfRouter(config));
  if (deps) {
    app.use(authRouter(deps, authLimits));
    app.use(staffRouter(deps));
    app.use(auditRouter(deps));
    app.use(mediaRouter(deps));
    app.use(adminProductsRouter(deps));
    app.use(adminTaxonomyRouter(deps));
    app.use(publicCatalogueRouter(deps));
    app.use(inventoryRouter(deps));
    app.use(contentAdminRouter(deps));
    app.use(contentPublicRouter(deps));
    app.use(cartRouter(deps));
    if (jobs) startReservationExpiry(deps);
  }
  for (const router of routers) app.use(router);

  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
