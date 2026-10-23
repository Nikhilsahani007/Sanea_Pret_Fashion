-- Phase 11: guest cart (phase-11-plan.md §5.1; D-098, D-099; database-design.md
-- §3.3). Two new tables; no existing table or row changes. The cart and its
-- cookie are created by the first successful add, never by a read; only the
-- SHA-256 of the token is stored. Lines hold a variant and a quantity, never a
-- price. No customer link: accounts are deferred (D-034). Handwritten CHECKs
-- are listed in apps/api/src/db/handwritten.ts.

-- CreateTable
CREATE TABLE "cart" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "token_hash" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_item" (
    "cart_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cart_item_pkey" PRIMARY KEY ("cart_id","variant_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cart_token_hash_key" ON "cart"("token_hash");

-- CreateIndex
CREATE INDEX "cart_expires_at_idx" ON "cart"("expires_at");

-- CreateIndex
CREATE INDEX "cart_item_variant_id_idx" ON "cart_item"("variant_id");

-- AddForeignKey
ALTER TABLE "cart_item" ADD CONSTRAINT "cart_item_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_item" ADD CONSTRAINT "cart_item_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Handwritten CHECKs (Prisma does not model them).
-- A SHA-256 digest is exactly 32 bytes, as for admin sessions.
ALTER TABLE "cart" ADD CONSTRAINT "cart_token_hash_check"
  CHECK (octet_length("token_hash") = 32);
ALTER TABLE "cart" ADD CONSTRAINT "cart_expiry_check"
  CHECK ("expires_at" > "created_at");
-- The per-line ceiling (D-115, D-099); CART_MAX_LINE_QUANTITY can only be lower.
ALTER TABLE "cart_item" ADD CONSTRAINT "cart_item_quantity_check"
  CHECK ("quantity" BETWEEN 1 AND 10);
