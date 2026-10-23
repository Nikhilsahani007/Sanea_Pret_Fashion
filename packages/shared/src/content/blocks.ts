// Content blocks and navigation (Phase 10, D-093; system-design.md §7,
// phase-10-plan.md §3). One strict schema per block, used by the API on save
// and publish and by the admin editors. No HTML anywhere; links are internal
// targets, except the footer's social links (https, allow-listed hosts).
import { z } from "zod";

import { isInternalLink, plainTextSchema } from "../catalogue/rich-text.ts";
import { unknownFieldError } from "../validation/schema-helpers.ts";

const strict = <T extends z.ZodRawShape>(shape: T) =>
  z.strictObject(shape, { error: unknownFieldError });

const id = z.uuid({ error: "INVALID" });
const isoDate = z.iso.datetime({ offset: true, error: "INVALID" });

/** An optional active window; the end must follow the start. */
const activeWindow = {
  startsAt: isoDate.optional(),
  endsAt: isoDate.optional(),
};
const windowOk = (v: {
  startsAt?: string | undefined;
  endsAt?: string | undefined;
}) => !v.startsAt || !v.endsAt || new Date(v.endsAt) > new Date(v.startsAt);

/** Where a link or CTA points: an entity resolved at read time, or an internal path. */
export const contentTargetSchema = z.discriminatedUnion("kind", [
  strict({ kind: z.literal("CATEGORY"), id }),
  strict({ kind: z.literal("COLLECTION"), id }),
  strict({ kind: z.literal("PRODUCT"), id }),
  strict({ kind: z.literal("PAGE"), id }),
  strict({
    kind: z.literal("PATH"),
    path: z
      .string()
      .max(200, { error: "TOO_LONG" })
      .refine(isInternalLink, { error: "LINK_NOT_INTERNAL" }),
  }),
]);
export type ContentTarget = z.infer<typeof contentTargetSchema>;

/** Products for a row or tab (resolved to visible products only, at read time). */
export const productSourceSchema = z.discriminatedUnion("kind", [
  strict({ kind: z.literal("NEWEST") }),
  strict({ kind: z.literal("COLLECTION"), id }),
  strict({ kind: z.literal("CATEGORY"), id }),
  strict({
    kind: z.literal("MANUAL"),
    productIds: z
      .array(id)
      .min(1, { error: "TOO_SHORT" })
      .max(24, { error: "TOO_LONG" })
      .refine((ids) => new Set(ids).size === ids.length, { error: "INVALID" }),
  }),
]);
export type ProductSource = z.infer<typeof productSourceSchema>;

const maxItems = z
  .number({ error: "INVALID_TYPE" })
  .int()
  .min(4, { error: "TOO_SHORT" })
  .max(24, { error: "TOO_LONG" });

export const announcementSchema = strict({
  text: plainTextSchema(1, 90),
  link: contentTargetSchema.optional(),
  ...activeWindow,
}).refine(windowOk, { error: "INVALID", path: ["endsAt"] });

const heroSlide = strict({
  desktopImageId: id,
  mobileImageId: id,
  alt: plainTextSchema(1, 200),
  campaignLine: plainTextSchema(0, 90).optional(),
  ctaLabel: plainTextSchema(1, 30),
  ctaTarget: contentTargetSchema,
  focalPoint: strict({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }).optional(),
  ...activeWindow,
}).refine(windowOk, { error: "INVALID", path: ["endsAt"] });

/** Q10-2: one block, 1 to 5 ordered slides, published together. */
export const heroSchema = strict({
  slides: z
    .array(heroSlide)
    .min(1, { error: "TOO_SHORT" })
    .max(5, { error: "TOO_LONG" }),
});

export const newInsSchema = strict({
  title: plainTextSchema(1, 60),
  source: strict({ kind: z.literal("NEWEST") }),
  maxItems,
});

export const productRowSchema = strict({
  title: plainTextSchema(1, 60),
  source: productSourceSchema,
  maxItems,
});

export const tabbedGridSchema = strict({
  tabs: z
    .array(
      strict({ label: plainTextSchema(1, 30), source: productSourceSchema }),
    )
    .min(2, { error: "TOO_SHORT" })
    .max(5, { error: "TOO_LONG" }),
  maxItems,
});

export const editorialBandSchema = strict({
  images: z
    .array(strict({ mediaAssetId: id, alt: plainTextSchema(1, 200) }))
    .min(1, { error: "TOO_SHORT" })
    .max(4, { error: "TOO_LONG" }),
  heading: plainTextSchema(1, 60),
  text: plainTextSchema(0, 280).optional(),
  link: contentTargetSchema.optional(),
});

/** Q10-4: the only external links; https on these hosts, per network. */
export const SOCIAL_HOSTS = {
  INSTAGRAM: ["instagram.com", "www.instagram.com"],
  FACEBOOK: ["facebook.com", "www.facebook.com"],
  YOUTUBE: ["youtube.com", "www.youtube.com"],
  PINTEREST: ["pinterest.com", "www.pinterest.com", "in.pinterest.com"],
  WHATSAPP: ["wa.me"],
  X: ["x.com"],
} as const;
export type SocialNetwork = keyof typeof SOCIAL_HOSTS;

/**
 * `https://host/path?query`, nothing else: no user info, port or fragment.
 * A pattern, because the shared package has no URL API (it runs everywhere).
 */
const HTTPS_URL =
  /^https:\/\/([a-z0-9.-]+)(\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*)?(\?[A-Za-z0-9._~!$&'()*+,;=:@%/?-]*)?$/;

export function isAllowedSocialUrl(
  network: SocialNetwork,
  raw: string,
): boolean {
  if (raw.length > 200) return false;
  const host = HTTPS_URL.exec(raw)?.[1];
  return (
    host !== undefined &&
    (SOCIAL_HOSTS[network] as readonly string[]).includes(host)
  );
}

const socialLink = strict({
  network: z.enum(
    Object.keys(SOCIAL_HOSTS) as [SocialNetwork, ...SocialNetwork[]],
  ),
  url: z.string(),
}).refine((l) => isAllowedSocialUrl(l.network, l.url), {
  error: "LINK_NOT_INTERNAL",
  path: ["url"],
});

/** Q10-3: contact and social only; link groups live in the navigation menus. */
export const footerSchema = strict({
  contact: strict({
    addressLines: z
      .array(plainTextSchema(1, 100))
      .max(4, { error: "TOO_LONG" })
      .optional(),
    hours: plainTextSchema(1, 100).optional(),
    phone: plainTextSchema(1, 30).optional(),
    email: z.email({ error: "INVALID" }).max(254).optional(),
  }).optional(),
  social: z.array(socialLink).max(6, { error: "TOO_LONG" }).optional(),
});

/**
 * Q10-1: the fixed registry. A new key is a reviewed code change; the API
 * refuses any other key. `CATEGORY_PILLS` has no key (Q10-3).
 */
export const CONTENT_BLOCKS = {
  "site.announcement": { type: "ANNOUNCEMENT_BAR", schema: announcementSchema },
  "home.hero": { type: "HERO_SLIDE", schema: heroSchema },
  "home.newIns": { type: "PRODUCT_ROW", schema: newInsSchema },
  "home.row2": { type: "PRODUCT_ROW", schema: productRowSchema },
  "home.tabbedGrid": { type: "TABBED_GRID", schema: tabbedGridSchema },
  // Served publicly only once OD-23 allows it (Phase 12).
  "home.editorial": { type: "EDITORIAL_BAND", schema: editorialBandSchema },
  "site.footer": { type: "FOOTER", schema: footerSchema },
} as const;
export type ContentBlockKey = keyof typeof CONTENT_BLOCKS;
export const CONTENT_BLOCK_KEYS = Object.keys(
  CONTENT_BLOCKS,
) as ContentBlockKey[];

export function isContentBlockKey(key: string): key is ContentBlockKey {
  return Object.hasOwn(CONTENT_BLOCKS, key);
}

// ── Navigation (Q10-3) ──────────────────────────────────────────────────────

/** The allow-listed menus and their item limits. */
export const NAV_MENUS = {
  HEADER: 12,
  CATEGORY_PILLS: 20,
  FOOTER_SHOP: 12,
  FOOTER_HELP: 12,
  FOOTER_ABOUT: 12,
} as const;
export type NavMenu = keyof typeof NAV_MENUS;

export function isNavMenu(menu: string): menu is NavMenu {
  return Object.hasOwn(NAV_MENUS, menu);
}

/** One menu item; `URL` targets are internal paths only (safeguard 2). */
export const navItemSchema = strict({
  label: plainTextSchema(1, 40),
  target: z.discriminatedUnion("kind", [
    strict({ kind: z.literal("CATEGORY"), id }),
    strict({ kind: z.literal("COLLECTION"), id }),
    strict({ kind: z.literal("PRODUCT"), id }),
    strict({ kind: z.literal("PAGE"), id }),
    strict({
      kind: z.literal("URL"),
      url: z
        .string()
        .max(200, { error: "TOO_LONG" })
        .refine(isInternalLink, { error: "LINK_NOT_INTERNAL" }),
    }),
  ]),
});
export type NavItem = z.infer<typeof navItemSchema>;

export function navMenuSchema(menu: NavMenu) {
  return strict({
    items: z.array(navItemSchema).max(NAV_MENUS[menu], { error: "TOO_LONG" }),
  });
}
