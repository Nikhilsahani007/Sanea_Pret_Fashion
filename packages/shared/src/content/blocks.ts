import { z } from "zod";

import { slugSchema } from "../catalogue/slug.ts";
import { unknownFieldError } from "../validation/schema-helpers.ts";
import { safeHrefSchema } from "./rich-text.ts";

// Typed content blocks (system-design.md §7, D-109). Draft and published
// payloads are both validated with these schemas; there is no HTML anywhere.

// eslint-disable-next-line no-control-regex -- deliberately matches control characters to reject them
const ONE_LINE = /^[^\u0000-\u001f\u007f]*$/;
const text = (max: number) =>
  z
    .string({ error: "INVALID_TYPE" })
    .trim()
    .min(1, { error: "TOO_SHORT" })
    .max(max, { error: "TOO_LONG" })
    .regex(ONE_LINE, { error: "TEXT_INVALID_CHARACTERS" });
const strict = <T extends z.ZodRawShape>(shape: T) =>
  z.strictObject(shape, { error: unknownFieldError });
const when = z.iso.datetime({ error: "INVALID" }).nullable().optional();

/** Where a link or button goes: a catalogue item or page by slug, or a URL. */
export const linkTargetSchema = z.discriminatedUnion(
  "type",
  [
    strict({ type: z.literal("CATEGORY"), slug: slugSchema }),
    strict({ type: z.literal("COLLECTION"), slug: slugSchema }),
    strict({ type: z.literal("PRODUCT"), slug: slugSchema }),
    strict({ type: z.literal("PAGE"), slug: slugSchema }),
    strict({ type: z.literal("URL"), href: safeHrefSchema }),
  ],
  { error: "INVALID_OPTION" },
);
export type LinkTarget = z.infer<typeof linkTargetSchema>;

/** Storefront path for a target. Shared so the API and storefront agree. */
export function targetHref(target: LinkTarget): string {
  switch (target.type) {
    case "CATEGORY":
      return `/category/${target.slug}`;
    case "COLLECTION":
      return `/collections/${target.slug}`;
    case "PRODUCT":
      return `/products/${target.slug}`;
    case "PAGE":
      return `/pages/${target.slug}`;
    case "URL":
      return target.href;
  }
}

/** Which products a row shows. */
export const productSourceSchema = z.discriminatedUnion(
  "type",
  [
    strict({ type: z.literal("NEWEST") }),
    strict({ type: z.literal("COLLECTION"), slug: slugSchema }),
    strict({ type: z.literal("CATEGORY"), slug: slugSchema }),
    strict({
      type: z.literal("MANUAL"),
      slugs: z.array(slugSchema).min(1).max(24),
    }),
  ],
  { error: "INVALID_OPTION" },
);
export type ProductSource = z.infer<typeof productSourceSchema>;

const schedule = { startsAt: when, endsAt: when };
const scheduleOk = (b: { startsAt?: string | null; endsAt?: string | null }) =>
  !b.startsAt || !b.endsAt || new Date(b.endsAt) > new Date(b.startsAt);

export const announcementBarSchema = strict({
  text: text(90),
  link: linkTargetSchema.nullable().optional(),
  ...schedule,
}).refine(scheduleOk, { error: "INVALID", path: ["endsAt"] });

export const heroSlideSchema = strict({
  desktopImageId: z.uuid({ error: "INVALID" }),
  mobileImageId: z.uuid({ error: "INVALID" }).nullable().optional(),
  alt: text(300),
  campaignLine: text(120),
  ctaLabel: text(30),
  ctaTarget: linkTargetSchema,
  /** Focal point in percent, used for object-position when cropping. */
  focalX: z.number().min(0).max(100).default(50),
  focalY: z.number().min(0).max(100).default(50),
  ...schedule,
}).refine(scheduleOk, { error: "INVALID", path: ["endsAt"] });

export const heroSchema = strict({
  slides: z.array(heroSlideSchema).min(1).max(6),
});

export const categoryPillsSchema = strict({
  pills: z
    .array(strict({ label: text(30), target: linkTargetSchema }))
    .min(1)
    .max(12),
});

export const productRowSchema = strict({
  title: text(60),
  source: productSourceSchema,
  maxItems: z.number().int().min(2).max(24).default(12),
  viewAll: linkTargetSchema.nullable().optional(),
});

export const tabbedGridSchema = strict({
  title: text(60).nullable().optional(),
  tabs: z
    .array(strict({ label: text(30), source: productSourceSchema }))
    .min(2)
    .max(5),
  maxItems: z.number().int().min(4).max(24).default(8),
});

export const editorialBandSchema = strict({
  heading: text(80),
  text: text(300),
  images: z
    .array(strict({ imageId: z.uuid({ error: "INVALID" }), alt: text(300) }))
    .min(1)
    .max(4),
  link: linkTargetSchema.nullable().optional(),
});

export const footerSchema = strict({
  groups: z
    .array(
      strict({
        title: text(40),
        links: z
          .array(strict({ label: text(40), target: linkTargetSchema }))
          .max(10),
      }),
    )
    .max(4),
  social: z
    .array(strict({ label: text(30), href: safeHrefSchema }))
    .max(6)
    .default([]),
});

/** The fixed block keys, their database type and their schema. */
export const CONTENT_BLOCKS = {
  "home.announcement": {
    type: "ANNOUNCEMENT_BAR",
    schema: announcementBarSchema,
  },
  "home.hero": { type: "HERO_SLIDE", schema: heroSchema },
  "home.pills": { type: "CATEGORY_PILLS", schema: categoryPillsSchema },
  "home.new-ins": { type: "PRODUCT_ROW", schema: productRowSchema },
  "home.row-2": { type: "PRODUCT_ROW", schema: productRowSchema },
  "home.tabbed": { type: "TABBED_GRID", schema: tabbedGridSchema },
  "home.editorial": { type: "EDITORIAL_BAND", schema: editorialBandSchema },
  "site.footer": { type: "FOOTER", schema: footerSchema },
} as const;
export type ContentBlockKey = keyof typeof CONTENT_BLOCKS;
export const CONTENT_BLOCK_KEYS = Object.keys(
  CONTENT_BLOCKS,
) as ContentBlockKey[];

/** Navigation menus edited in the admin (header and footer menus). */
export const NAVIGATION_MENUS = [
  "HEADER",
  "FOOTER_SHOP",
  "FOOTER_HELP",
] as const;
export const navigationItemsSchema = strict({
  items: z.array(strict({ label: text(40), target: linkTargetSchema })).max(12),
});

/** Store settings shown on the storefront. Empty until the Owner enters real values. */
export const storeSettingsSchema = strict({
  whatsappNumber: z
    .string()
    .regex(/^\+91[6-9]\d{9}$/, { error: "PHONE_INVALID" })
    .nullable()
    .default(null),
  contactEmail: z.email({ error: "INVALID" }).max(254).nullable().default(null),
  contactPhone: z
    .string()
    .regex(/^\+91\d{10}$/, { error: "PHONE_INVALID" })
    .nullable()
    .default(null),
  /** Shown in the footer; never invented. */
  businessAddress: text(300).nullable().default(null),
});
export type StoreSettings = z.infer<typeof storeSettingsSchema>;
