import { Router } from "express";

/** `GET /api/v1/health`: liveness only, with no version or internal details. */
export function healthRouter(): Router {
  const router = Router();
  router.get("/api/v1/health", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ status: "ok" });
  });
  return router;
}
