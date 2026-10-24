// Request schemas for the admin catalogue routes. Strict objects: unknown
// fields are rejected (security-design.md §3). Prices are integer paise.
import { pricePaiseSchema, richTextSchema, slugSchema } from "@sanea/shared";
import { z } from "zod";

// eslint-disable-next-line no-control-regex
const LINE = /^[^\u0000-\u001f\u007f]*$/;
const line = (max: number) => z.string().trim().min(1).max(max).regex(LINE);
const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional();

export const idParams = z.object({ id: z.uuid() });
export const variantParams = z.object({ id: z.uuid(), variantId: z.uuid() });

export const publishStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);

/** Labels an editor may set; "Only n left" and "Sold out" come from stock. */
export const PRODUCT_LABELS = ["NEW", "LIMITED"] as const;

const seo = {
  seoTitle: optionalText(70),
  seoDescription: optionalText(160),
};

// HSN codes are 4, 6 or 8 digits (D-030); rates are not stored here.
const hsnCode = z
  .string()
  .regex(/^(\d{4}|\d{6}|\d{8})$/)
  .nullable()
  .optional();

const productFields = {
  name: line(160),
  slug: slugSchema.optional(),
  categoryId: z.uuid(),
  shortDescription: line(200),
  description: richTextSchema,
  fabric: optionalText(500),
  care: optionalText(500),
  fit: optionalText(500),
  hsnCode,
  sizeChartId: z.uuid().nullable().optional(),
  labels: z.array(z.enum(PRODUCT_LABELS)).max(PRODUCT_LABELS.length).optional(),
  ...seo,
};

export const createProductBody = z.strictObject(productFields);
export const updateProductBody = z
  .strictObject(productFields)
  .partial()
  .refine((b) => Object.keys(b).length > 0, {
    error: "Send at least one field",
  });

export const productListQuery = z
  .object({
    status: publishStatusSchema.optional(),
    q: z.string().trim().max(100).optional(),
    categoryId: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    before: z.uuid().optional(),
  })
  .strict();

// SKUs: uppercase letters, digits and hyphens. TEST- marks development data.
const sku = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{1,39}$/);

const compareAt = pricePaiseSchema.nullable().optional();

export const createVariantBody = z
  .strictObject({
    colourId: z.uuid(),
    sizeId: z.uuid(),
    sku,
    pricePaise: pricePaiseSchema,
    compareAtPricePaise: compareAt,
    isActive: z.boolean().optional(),
  })
  .refine(
    (b) =>
      b.compareAtPricePaise == null || b.compareAtPricePaise > b.pricePaise,
    {
      error: "The compare-at price must be higher than the price",
      path: ["compareAtPricePaise"],
    },
  );

export const updateVariantBody = z
  .strictObject({
    sku: sku.optional(),
    pricePaise: pricePaiseSchema.optional(),
    compareAtPricePaise: compareAt,
    isActive: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, {
    error: "Send at least one field",
  });

export const imagesBody = z.strictObject({
  images: z
    .array(
      z.strictObject({
        mediaAssetId: z.uuid(),
        colourId: z.uuid().nullable().optional(),
        alt: line(300),
        role: z.enum(["PRIMARY", "HOVER", "GALLERY"]),
      }),
    )
    .max(40),
});

export const categoryBody = z.strictObject({
  name: line(80),
  slug: slugSchema.optional(),
  parentId: z.uuid().nullable().optional(),
  position: z.number().int().min(0).max(10_000).optional(),
  status: publishStatusSchema.optional(),
  ...seo,
});
export const updateCategoryBody = categoryBody
  .partial()
  .refine((b) => Object.keys(b).length > 0, {
    error: "Send at least one field",
  });

const collectionFields = {
  name: line(120),
  slug: slugSchema.optional(),
  description: optionalText(1000),
  heroImageId: z.uuid().nullable().optional(),
  status: publishStatusSchema.optional(),
  startsAt: z.iso.datetime().nullable().optional(),
  endsAt: z.iso.datetime().nullable().optional(),
  ...seo,
};
const scheduleOk = (b: { startsAt?: string | null; endsAt?: string | null }) =>
  !b.startsAt || !b.endsAt || new Date(b.endsAt) > new Date(b.startsAt);
export const collectionBody = z
  .strictObject(collectionFields)
  .refine(scheduleOk, {
    error: "The end must be after the start",
    path: ["endsAt"],
  });
export const updateCollectionBody = z
  .strictObject(collectionFields)
  .partial()
  .refine((b) => Object.keys(b).length > 0, {
    error: "Send at least one field",
  })
  .refine(scheduleOk, {
    error: "The end must be after the start",
    path: ["endsAt"],
  });

export const collectionProductsBody = z.strictObject({
  productIds: z.array(z.uuid()).max(500),
});

export const colourBody = z.strictObject({
  name: line(60),
  slug: slugSchema.optional(),
  swatchHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  position: z.number().int().min(0).max(10_000).optional(),
});
export const updateColourBody = colourBody
  .partial()
  .refine((b) => Object.keys(b).length > 0, {
    error: "Send at least one field",
  });

/** Rows of a size chart: one label per size, measurements as numbers. */
export const sizeChartBody = z.strictObject({
  name: line(80),
  unit: z.enum(["CM", "IN"]),
  rows: z
    .array(
      z.strictObject({
        size: line(20),
        measurements: z.record(line(40), z.number().positive().max(500)),
      }),
    )
    .min(1)
    .max(20),
});
export const updateSizeChartBody = sizeChartBody
  .partial()
  .refine((b) => Object.keys(b).length > 0, {
    error: "Send at least one field",
  });
