-- Phase 13: website enquiries and the anonymous WhatsApp click log
-- (phase-13-plan.md; database-design.md §3.5; D-054). Two new tables and one
-- enum; no existing table or row changes. Consent is required and an enquiry
-- needs an email or a mobile number; the IP is stored only as a keyed hash.
-- Clicks hold no personal data. Handwritten CHECKs are listed in
-- apps/api/src/db/handwritten.ts.

-- CreateEnum
CREATE TYPE "enquiry_status" AS ENUM ('NEW', 'IN_PROGRESS', 'CLOSED');

-- CreateTable
CREATE TABLE "enquiry" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "source" TEXT NOT NULL DEFAULT 'WEBSITE',
    "product_id" UUID,
    "variant_id" UUID,
    "name" TEXT NOT NULL,
    "email" CITEXT,
    "phone" TEXT,
    "message" TEXT NOT NULL,
    "consent_to_contact" BOOLEAN NOT NULL,
    "source_path" TEXT NOT NULL,
    "status" "enquiry_status" NOT NULL DEFAULT 'NEW',
    "assigned_admin_id" UUID,
    "ip_hash" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "enquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_click" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "product_id" UUID,
    "variant_id" UUID,
    "page_path" TEXT NOT NULL,
    "session_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_click_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "enquiry_status_created_at_idx" ON "enquiry"("status", "created_at");

-- CreateIndex
CREATE INDEX "enquiry_product_id_idx" ON "enquiry"("product_id");

-- CreateIndex
CREATE INDEX "enquiry_variant_id_idx" ON "enquiry"("variant_id");

-- CreateIndex
CREATE INDEX "enquiry_assigned_admin_id_idx" ON "enquiry"("assigned_admin_id");

-- CreateIndex
CREATE INDEX "whatsapp_click_product_id_created_at_idx" ON "whatsapp_click"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "whatsapp_click_variant_id_idx" ON "whatsapp_click"("variant_id");

-- CreateIndex
CREATE INDEX "whatsapp_click_created_at_idx" ON "whatsapp_click"("created_at");

-- AddForeignKey
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_assigned_admin_id_fkey" FOREIGN KEY ("assigned_admin_id") REFERENCES "admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_click" ADD CONSTRAINT "whatsapp_click_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_click" ADD CONSTRAINT "whatsapp_click_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Handwritten CHECK constraints
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_consent_check"
  CHECK ("consent_to_contact");
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_contact_check"
  CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL);
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_phone_check"
  CHECK ("phone" IS NULL OR "phone" ~ '^\+91[6-9][0-9]{9}$');
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_text_check"
  CHECK (char_length("name") BETWEEN 1 AND 100 AND char_length("message") BETWEEN 10 AND 2000);
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_source_check"
  CHECK ("source" = 'WEBSITE');
ALTER TABLE "whatsapp_click" ADD CONSTRAINT "whatsapp_click_page_path_check"
  CHECK (char_length("page_path") BETWEEN 1 AND 300);
