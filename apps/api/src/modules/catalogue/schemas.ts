// Request schemas for the admin catalogue API (phase-8-plan.md §5.3). Strict:
// unknown fields are rejected; strings are bounded.
import {
  pricePaiseSchema,
  productLabelSchema,
  richTextSchema,
  slugSchema,
} from "@sanea/shared";
import { z } from "zod";

const name = z.string().trim().min(1).max(120);
const seoTitle = z.string().trim().max(70).nullable().optional();
const seoDescription = z.string().trim().max(160).nullable().optional();
const status = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
const position = z.number().int().min(0).max(10_000);
const shortText = z.string().trim().max(500).nullable().optional();

export const idParams = z.strictObject({ id: z.uuid() });
export const variantParams = z.strictObject({
  id: z.uuid(),
  variantId: z.uuid(),
});
export const imageParams = z.strictObject({ id: z.uuid(), imageId: z.uuid() });

const atLeastOne = <T extends z.ZodObject>(schema: T) =>
  schema.refine((b) => Object.keys(b).length > 0, {
    error: "Send at least one field",
  });

// Categories
const categoryFields = {
  name,
  slug: slugSchema,
  parentId: z.uuid().nullable().optional(),
  position: position.optional(),
  status: status.optional(),
  seoTitle,
  seoDescription,
};
export const categoryCreate = z.strictObject(categoryFields);
export const categoryUpdate = atLeastOne(
  z.strictObject(categoryFields).partial(),
);

// Collections
const isoDate = z.iso.datetime({ offset: true });
const collectionFields = {
  name,
  slug: slugSchema,
  description: z.string().trim().max(1000).nullable().optional(),
  heroImageId: z.uuid().nullable().optional(),
  status: status.optional(),
  startsAt: isoDate.nullable().optional(),
  endsAt: isoDate.nullable().optional(),
  seoTitle,
  seoDescription,
};
const scheduleOk = (b: { startsAt?: string | null; endsAt?: string | null }) =>
  !b.startsAt || !b.endsAt || new Date(b.endsAt) > new Date(b.startsAt);
export const collectionCreate = z
  .strictObject(collectionFields)
  .refine(scheduleOk, {
    error: "endsAt must be after startsAt",
    path: ["endsAt"],
  });
export const collectionUpdate = atLeastOne(
  z.strictObject(collectionFields).partial(),
).refine(scheduleOk, {
  error: "endsAt must be after startsAt",
  path: ["endsAt"],
});
export const collectionProducts = z.strictObject({
  productIds: z
    .array(z.uuid())
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length, {
      error: "Duplicate product",
    }),
});

// Colours and size charts (Q8-3)
const colourFields = {
  name: z.string().trim().min(1).max(60),
  slug: slugSchema,
  swatchHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  position: position.optional(),
};
export const colourCreate = z.strictObject(colourFields);
export const colourUpdate = atLeastOne(z.strictObject(colourFields).partial());

const sizeChartFields = {
  name: z.string().trim().min(1).max(80),
  unit: z.enum(["CM", "IN"]),
  rows: z
    .array(
      z.strictObject({
        size: z.string().trim().min(1).max(20),
        measurements: z
          .record(z.string().trim().min(1).max(40), z.number().min(0).max(500))
          .refine((m) => Object.keys(m).length <= 12, {
            error: "At most 12 measurements",
          }),
      }),
    )
    .max(20),
};
export const sizeChartCreate = z.strictObject(sizeChartFields);
export const sizeChartUpdate = atLeastOne(
  z.strictObject(sizeChartFields).partial(),
);

// Products. Status changes only through publish and archive.
const productFields = {
  name,
  slug: slugSchema,
  categoryId: z.uuid(),
  shortDescription: z.string().trim().min(1).max(200),
  description: richTextSchema,
  fabric: shortText,
  care: shortText,
  fit: shortText,
  hsnCode: z
    .string()
    .regex(/^\d{4,8}$/)
    .nullable()
    .optional(),
  sizeChartId: z.uuid().nullable().optional(),
  labels: z
    .array(productLabelSchema)
    .max(5)
    .refine((l) => new Set(l).size === l.length, { error: "Duplicate label" })
    .optional(),
  seoTitle,
  seoDescription,
};
export const productCreate = z.strictObject({
  ...productFields,
  description: richTextSchema.optional(),
});
export const productUpdate = atLeastOne(
  z.strictObject(productFields).partial(),
);

export const adminProductQuery = z.strictObject({
  status: status.optional(),
  categoryId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.uuid().optional(),
});

// Variants. Price fields need `products.editPrices` (O M).
const sku = z.string().regex(/^[A-Z0-9][A-Z0-9-]{2,39}$/);
export const PRICE_FIELDS = ["pricePaise", "compareAtPricePaise"] as const;
const comparesAbove = (b: {
  pricePaise?: number;
  compareAtPricePaise?: number | null;
}) =>
  b.compareAtPricePaise == null ||
  b.pricePaise === undefined ||
  b.compareAtPricePaise > b.pricePaise;
export const variantCreate = z
  .strictObject({
    colourId: z.uuid(),
    sizeId: z.uuid(),
    sku,
    pricePaise: pricePaiseSchema,
    compareAtPricePaise: pricePaiseSchema.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(comparesAbove, { error: "INVALID", path: ["compareAtPricePaise"] });
export const variantUpdate = atLeastOne(
  z.strictObject({
    sku: sku.optional(),
    isActive: z.boolean().optional(),
    pricePaise: pricePaiseSchema.optional(),
    compareAtPricePaise: pricePaiseSchema.nullable().optional(),
  }),
).refine(comparesAbove, { error: "INVALID", path: ["compareAtPricePaise"] });

// Product images
const imageFields = {
  mediaAssetId: z.uuid(),
  colourId: z.uuid().nullable().optional(),
  alt: z.string().trim().min(1).max(200),
  role: z.enum(["PRIMARY", "HOVER", "GALLERY"]).optional(),
  position: position.optional(),
};
export const imageCreate = z.strictObject(imageFields);
export const imageUpdate = atLeastOne(
  z.strictObject(imageFields).omit({ mediaAssetId: true }).partial(),
);
