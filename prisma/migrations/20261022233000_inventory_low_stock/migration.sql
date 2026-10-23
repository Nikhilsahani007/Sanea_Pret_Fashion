-- Phase 9: low-stock list (Q9-1, D-090; database-design.md §3.2 and §5).
-- Handwritten: Prisma models neither expression indexes nor views, so
-- apps/api/src/db/handwritten.ts lists both and tests check them. No table or
-- column changes.

-- Low stock means available (on hand minus reserved) is at or below the
-- variant's threshold. The expression index serves `... <= 0` lookups.
-- CreateIndex
CREATE INDEX "inventory_level_low_stock_idx"
  ON "inventory_level" (("on_hand" - "reserved" - "low_stock_threshold"));

-- Active variants at or below their low-stock level, sold out included.
CREATE VIEW "low_stock_variant" AS
SELECT
  "il"."variant_id",
  "il"."on_hand",
  "il"."reserved",
  "il"."on_hand" - "il"."reserved" AS "available",
  "il"."low_stock_threshold"
FROM "inventory_level" AS "il"
JOIN "product_variant" AS "v" ON "v"."id" = "il"."variant_id"
WHERE "v"."is_active"
  AND "il"."on_hand" - "il"."reserved" - "il"."low_stock_threshold" <= 0;
