import cookieParser from "cookie-parser";
import express, { type Express, type Router } from "express";
import { pinoHttp } from "pino-http";
import type { Logger } from "pino";

import { auditRouter } from "../../modules/audit/router.ts";
import type { AuthDeps } from "../../modules/auth/deps.ts";
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
import { CART_WRITE_LIMIT, cartRouter } from "../../modules/cart/router.ts";
import { catalogueAdminRouter } from "../../modules/catalogue/admin-router.ts";
import { cataloguePublicRouter } from "../../modules/catalogue/public-router.ts";
import { contentAdminRouter } from "../../modules/content/admin-router.ts";
import {
  CHECKOUT_LIMITS,
  checkoutRouter,
} from "../../modules/checkout/router.ts";
import { settingsAdminRouter } from "../../modules/checkout/settings-router.ts";
import { contentPublicRouter } from "../../modules/content/public-router.ts";
import { enquiriesAdminRouter } from "../../modules/enquiries/admin-router.ts";
import {
  CLICK_LIMIT,
  ENQUIRY_LIMIT,
  enquiriesRouter,
} from "../../modules/enquiries/router.ts";
import {
  logEmailProvider,
  type EmailProvider,
} from "../../modules/notifications/provider.ts";
import { paymentProviderFor } from "../../modules/payments/mock.ts";
import type { PaymentProvider } from "../../modules/payments/provider.ts";
import { webhooksRouter } from "../../modules/payments/router.ts";
import { healthRouter } from "../../modules/health/router.ts";
import { inventoryRouter } from "../../modules/inventory/router.ts";
import { ordersAdminRouter } from "../../modules/orders/admin-router.ts";
import { dashboardRouter } from "../../modules/orders/dashboard.ts";
import {
  createMediaService,
  mediaRouter,
  mediaUploadRouter,
  type MediaOptions,
} from "../../modules/media/router.ts";
import { SEARCH_LIMIT, searchRouter } from "../../modules/search/router.ts";
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
  /** Test seams for the upload queue timings and the image worker. */
  readonly media?: MediaOptions;
  /** Test seam: the search rate limit (default 60 per minute per IP). */
  readonly searchLimit?: { windowMs: number; limit: number };
  /** Test seam: the cart write limit (default 60 per minute per IP). */
  readonly cartLimit?: { windowMs: number; limit: number };
  /** Test seam: the enquiry (5 per hour) and WhatsApp click (60 per minute) limits. */
  readonly enquiryLimits?: {
    enquiries: { windowMs: number; limit: number };
    clicks: { windowMs: number; limit: number };
  };
  /** The payment provider (main.ts shares it with the order jobs; tests); else from PAYMENT_PROVIDER. */
  readonly payments?: PaymentProvider | null;
  /** Test seam: the checkout write (20 per minute) and read (120 per minute) limits. */
  readonly checkoutLimits?: typeof CHECKOUT_LIMITS;
  /** The email provider (main.ts shares it with the order jobs; tests); else the log provider. */
  readonly email?: EmailProvider;
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
  media: mediaOptions = {},
  searchLimit = SEARCH_LIMIT,
  cartLimit = CART_WRITE_LIMIT,
  enquiryLimits = { enquiries: ENQUIRY_LIMIT, clicks: CLICK_LIMIT },
  payments,
  checkoutLimits = CHECKOUT_LIMITS,
  email,
}: AppOptions): Express {
  const deps: AuthDeps | undefined = db
    ? { db, config, logger, now, argon2 }
    : undefined;
  const media = deps ? createMediaService(deps, mediaOptions) : undefined;
  const app = express();
  // Read-only view of the media service for tests (queue counters).
  if (media) app.locals.mediaService = media;
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
  // 7a. The raw image upload: before the JSON-only body middleware (D-079).
  if (deps && media) app.use(mediaUploadRouter(deps, media));
  app.use(requireJson); // 8. 415 for non-JSON bodies
  app.use(jsonBody); // 9. 100 KB JSON

  app.use(healthRouter());
  app.use(csrfRouter(config));
  if (deps) {
    app.use(authRouter(deps, authLimits));
    app.use(staffRouter(deps));
    app.use(auditRouter(deps));
    if (media) {
      app.use(mediaRouter(deps, media));
      app.use(catalogueAdminRouter(deps, media.storage));
      app.use(inventoryRouter(deps));
      app.use(contentAdminRouter(deps));
      app.use(contentPublicRouter(deps, media.storage));
      app.use(cataloguePublicRouter(deps, media.storage));
      app.use(searchRouter(deps, media.storage, searchLimit));
      app.use(cartRouter(deps, media.storage, cartLimit));
      app.use(enquiriesRouter(deps, enquiryLimits));
      const checkout = {
        ...deps,
        storage: media.storage,
        payments:
          payments === undefined ? paymentProviderFor(config) : payments,
        email: email ?? logEmailProvider(logger),
      };
      app.use(checkoutRouter(checkout, checkoutLimits));
      app.use(webhooksRouter(checkout));
      // Phase 16: admin operations.
      app.use(ordersAdminRouter(checkout));
      app.use(enquiriesAdminRouter(deps));
      app.use(dashboardRouter(deps));
      app.use(settingsAdminRouter(deps));
    }
  }
  for (const router of routers) app.use(router);

  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
