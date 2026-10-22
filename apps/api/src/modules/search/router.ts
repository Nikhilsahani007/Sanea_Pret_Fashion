// Public search (api-specification.md §3, D-081, D-084): `/search` with the
// listing filters, ranked by relevance; `/search/suggest` for up to 6
// suggestions. 60 requests per minute per IP for both, under the global
// limit (security-design.md §3). 60-second HTTP caching (Q8-5).
import { Router, type RequestHandler } from "express";
import { z } from "zod";

import { validate } from "../../platform/http/validate.ts";
import { createRateLimiter } from "../../platform/http/rate-limit.ts";
import type { AuthDeps } from "../auth/deps.ts";
import { handle, input, publicCache } from "../catalogue/common.ts";
import { suggest } from "../catalogue/listing.ts";
import {
  listingQueryShape,
  listingResponse,
  type ListingQuery,
} from "../catalogue/public-router.ts";
import type { MediaStorage } from "../media/storage.ts";

export const SEARCH = "/api/v1/search";
export const SEARCH_LIMIT = { windowMs: 60_000, limit: 60 } as const;

// Trimmed, 2 to 100 characters, no control characters.
const searchText = z
  .string()
  .trim()
  .min(2)
  .max(100)
  // eslint-disable-next-line no-control-regex
  .refine((q) => !/[\u0000-\u001f\u007f]/.test(q), {
    error: "TEXT_INVALID_CHARACTERS",
  });

const searchQuery = z
  .strictObject({
    ...listingQueryShape,
    q: searchText,
    sort: z
      .enum(["relevance", "newest", "price_asc", "price_desc"])
      .default("relevance"),
  })
  .refine(
    (v) =>
      v.priceMin === undefined ||
      v.priceMax === undefined ||
      v.priceMin <= v.priceMax,
    {
      error: "priceMin must not be above priceMax",
      path: ["priceMin"],
    },
  );

export function searchRouter(
  deps: AuthDeps,
  storage: MediaStorage,
  limit: { windowMs: number; limit: number } = SEARCH_LIMIT,
): Router {
  const router = Router();
  const limiter: RequestHandler = createRateLimiter(limit);
  router.use(SEARCH, limiter, publicCache);

  router.get(
    SEARCH,
    validate({ query: searchQuery }),
    handle(async (_req, res) => {
      const { query } = input<unknown, unknown, z.infer<typeof searchQuery>>(
        res,
      );
      res.json(
        await listingResponse(deps, storage, query as ListingQuery, query.sort),
      );
    }),
  );

  router.get(
    `${SEARCH}/suggest`,
    validate({ query: z.strictObject({ q: searchText }) }),
    handle(async (_req, res) => {
      const { query } = input<unknown, unknown, { q: string }>(res);
      res.json(await suggest(deps.db, query.q, deps.now()));
    }),
  );

  return router;
}
