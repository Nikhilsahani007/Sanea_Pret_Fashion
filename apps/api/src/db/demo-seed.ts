// Demo store seed (D-187): the owner's fictional demo catalogue
// (demo/catalogue.json, from sanea_pret_demo_products.xlsx) with labelled
// demo images in each colour, and the storefront content around it.
// Development and demo databases only: it refuses production and any
// database that is not on this machine, like the development seed.
//
//   npm run demo:seed   (needs DATABASE_URL and MEDIA_STORAGE_DIR)
//
// The images are drawn here from the supplied logo's arch on each colour and
// say "Demo image" on them: no photograph is copied from anyone (the
// workbook's own rule). Idempotent: if the demo catalogue is there already it
// does nothing.
import { randomBytes } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import sharp from "sharp";

import { PrismaClient } from "../generated/prisma/client.ts";
import { assertSeedAllowed, SeedRefused } from "./seed.ts";

type Catalogue = {
  categories: { name: string; slug: string }[];
  collections: { name: string; slug: string }[];
  products: {
    sku: string;
    slug: string;
    name: string;
    category: string;
    collection: string;
    pricePaise: number;
    compareAtPricePaise: number | null;
    garmentType: string;
    fabric: string;
    description: string;
    colours: { name: string; slug: string; hex: string }[];
    variants: { colour: string; size: string; onHand: number }[];
    featured: boolean;
    newArrival: boolean;
  }[];
};

const ROOT = new URL("../../../../", import.meta.url);
const LOGO = new URL("docs/brand/logo-supplied-2026-10-26.webp", ROOT);
const WIDTHS = [480, 960, 1440, 2048] as const;
const INSTAGRAM = "https://www.instagram.com/saneapret/";

/** Relative luminance, to choose a readable tone over a colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** The arch from the supplied logo, recoloured to one tone, alpha kept. */
async function arch(tone: string, height: number): Promise<Buffer> {
  const { data, info } = await sharp(new URL(LOGO).pathname)
    .extract({ left: 890, top: 95, width: 220, height: 335 })
    .resize({ height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(tone.slice(i, i + 2), 16));
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r!;
    data[i + 1] = g!;
    data[i + 2] = b!;
    data[i + 3] = Math.round(data[i + 3]! * 0.55);
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

/**
 * A demo image in the given ratio: the colour as the ground, the arch in a
 * quiet tone, and "Demo image" so it is never taken for a photograph.
 * Written as WebP derivatives only, like an upload's (Phase 8).
 */
async function demoImage(
  db: PrismaClient,
  mediaDir: string,
  admin: string,
  ground: string,
  ratio: number,
  hero = false,
): Promise<string> {
  const key = randomBytes(16).toString("hex");
  const dir = join(mediaDir, "public", key);
  await mkdir(dir, { recursive: true });
  const light = luminance(ground) > 0.35;
  const tone = light ? "#3B2F2A" : "#F8F4E9";
  const variants = [];
  // Product images (4:5): the arch centred. Campaign images (16:9 desktop,
  // 4:5 mobile): the arch kept clear of the campaign line, which sits at the
  // bottom left: to the right on desktop, high on mobile.
  const campaign = ratio !== 4 / 5 || hero;
  for (const width of WIDTHS) {
    const height = Math.round(width / ratio);
    const archHeight = campaign
      ? Math.round(height * (ratio > 1 ? 0.62 : 0.34))
      : Math.round(Math.min(height * 0.42, width * 0.6));
    const caption = Math.round(width / (campaign ? 60 : 34));
    const label = Buffer.from(
      campaign
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <text x="${width - caption * 2}" y="${caption * 3}" text-anchor="end" font-family="Inter, DejaVu Sans, sans-serif" font-size="${caption}" letter-spacing="${caption * 0.12}" fill="${tone}" fill-opacity="0.75">DEMO IMAGE</text>
      </svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <text x="50%" y="${height - caption * 2}" text-anchor="middle" font-family="Inter, DejaVu Sans, sans-serif" font-size="${caption}" letter-spacing="${caption * 0.12}" fill="${tone}" fill-opacity="0.75">DEMO IMAGE</text>
      </svg>`,
    );
    const mark = await arch(tone, archHeight);
    const markWidth = (await sharp(mark).metadata()).width!;
    const place = !campaign
      ? { gravity: "center" as const }
      : ratio > 1
        ? {
            top: Math.round((height - archHeight) / 2),
            left: Math.round(width * 0.72 - markWidth / 2),
          }
        : {
            top: Math.round(height * 0.16),
            left: Math.round((width - markWidth) / 2),
          };
    await sharp({
      create: { width, height, channels: 3, background: ground },
    })
      .composite([
        { input: mark, ...place },
        { input: label, top: 0, left: 0 },
      ])
      .webp({ quality: 72 })
      .toFile(join(dir, `${width}.webp`));
    variants.push({
      key: `${key}/${width}.webp`,
      format: "webp",
      width,
      height,
    });
  }
  const asset = await db.mediaAsset.create({
    data: {
      storageKey: `master/${key}.jpg`,
      originalFilename: "demo-image.jpg",
      mimeType: "image/jpeg",
      width: 2048,
      height: Math.round(2048 / ratio),
      bytes: 1000,
      variants,
      uploadedByAdminId: admin,
    },
  });
  return asset.id;
}

const doc = (...paragraphs: string[]) => ({
  type: "doc",
  content: paragraphs.map((text) => ({
    type: "paragraph",
    content: [{ type: "text", text }],
  })),
});

export async function seedDemo(
  db: PrismaClient,
  mediaDir: string,
): Promise<{ created: boolean; products: number; variants: number }> {
  const catalogue = JSON.parse(
    await readFile(new URL("./demo/catalogue.json", import.meta.url), "utf8"),
  ) as Catalogue;
  const first = catalogue.products[0]!;
  if (await db.product.findUnique({ where: { slug: first.slug } }))
    return { created: false, products: 0, variants: 0 };

  // An inactive admin row, only to own the demo images (uploadedByAdminId).
  const [admin] = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO "admin_user" ("email", "name", "password_hash", "role", "mfa_secret_encrypted", "mfa_key_version", "mfa_enabled_at", "is_active", "updated_at")
    VALUES ('demo-seed@example.test', 'Demo seed', 'DEMO-no-sign-in', 'OWNER', '\\x00'::bytea, 1, now(), false, now())
    ON CONFLICT ("email") DO UPDATE SET "updated_at" = now() RETURNING "id"::text AS "id"`;
  const owner = admin!.id;

  const categories = new Map<string, string>();
  for (const [i, c] of catalogue.categories.entries()) {
    const row = await db.category.create({
      data: { name: c.name, slug: c.slug, status: "PUBLISHED", position: i },
    });
    categories.set(c.slug, row.id);
  }
  const collections = new Map<string, string>();
  for (const c of catalogue.collections) {
    const row = await db.collection.create({
      data: { name: c.name, slug: c.slug, status: "PUBLISHED" },
    });
    collections.set(c.slug, row.id);
  }
  const sizes = new Map(
    (await db.size.findMany()).map((s) => [s.label, s.id] as const),
  );
  const colours = new Map<string, string>();
  let position = 0;
  let variantCount = 0;
  const productIds = new Map<string, string>();

  // Newest first in the workbook's order: the first product is the newest.
  const now = Date.now();
  for (const [n, p] of catalogue.products.entries()) {
    for (const c of p.colours) {
      if (colours.has(c.slug)) continue;
      const row = await db.colour.create({
        data: {
          name: c.name,
          slug: c.slug,
          swatchHex: c.hex,
          position: position++,
        },
      });
      colours.set(c.slug, row.id);
    }
    const product = await db.product.create({
      data: {
        name: p.name,
        slug: p.slug,
        categoryId: categories.get(p.category)!,
        shortDescription: `${p.garmentType[0]!.toUpperCase()}${p.garmentType.slice(1)}.`,
        description: doc(p.description),
        fabric: p.fabric,
        status: "PUBLISHED",
        publishedAt: new Date(now - (n + 1) * 60_000),
        labels: p.newArrival ? ["NEW"] : [],
      },
    });
    productIds.set(p.slug, product.id);
    await db.collectionProduct.create({
      data: {
        collectionId: collections.get(p.collection)!,
        productId: product.id,
        position: n,
      },
    });
    for (const v of p.variants) {
      const colour = p.colours.find((c) => c.name === v.colour)!;
      await db.productVariant.create({
        data: {
          productId: product.id,
          colourId: colours.get(colour.slug)!,
          sizeId: sizes.get(v.size)!,
          sku: `${p.sku}-${colour.slug.toUpperCase()}-${v.size}`,
          pricePaise: p.pricePaise,
          compareAtPricePaise: p.compareAtPricePaise,
          inventory: { create: { onHand: v.onHand } },
        },
      });
      variantCount++;
    }
    for (const [i, c] of p.colours.entries()) {
      await db.productImage.create({
        data: {
          productId: product.id,
          colourId: colours.get(c.slug)!,
          mediaAssetId: await demoImage(db, mediaDir, owner, c.hex, 4 / 5),
          alt: `Demo image for ${p.name} in ${c.name}`,
          role: i === 0 ? "PRIMARY" : "GALLERY",
          position: i,
        },
      });
    }
  }

  // The home page: three campaign slides, one per edit, then the rows.
  const campaign = [
    ["the-festive-edit", "#4E2A3A", "The Festive Edit"],
    ["occasion-dressing", "#1F2A44", "Occasion Dressing"],
    ["everyday-elegance", "#D8C3B5", "Everyday Elegance"],
  ] as const;
  const slides = [];
  for (const [slug, ground, line] of campaign)
    slides.push({
      desktopImageId: await demoImage(db, mediaDir, owner, ground, 16 / 9),
      mobileImageId: await demoImage(db, mediaDir, owner, ground, 4 / 5, true),
      alt: `Demo campaign image for ${line}`,
      campaignLine: line,
      ctaLabel: "Shop the edit",
      ctaTarget: { kind: "COLLECTION", id: collections.get(slug)! },
    });
  const inCollection = (slug: string) =>
    catalogue.products
      .filter((p) => p.collection === slug)
      .map((p) => productIds.get(p.slug)!);
  const blocks = {
    "site.announcement": {
      type: "ANNOUNCEMENT_BAR",
      value: {
        text: "Demo store: products, prices and images are illustrative.",
      },
    },
    "home.hero": { type: "HERO_SLIDE", value: { slides } },
    "home.newIns": {
      type: "PRODUCT_ROW",
      value: { title: "New Ins", source: { kind: "NEWEST" }, maxItems: 8 },
    },
    "home.row2": {
      type: "PRODUCT_ROW",
      value: {
        title: "The Festive Edit",
        source: {
          kind: "MANUAL",
          productIds: inCollection("the-festive-edit"),
        },
        maxItems: 8,
      },
    },
    "home.tabbedGrid": {
      type: "TABBED_GRID",
      value: {
        tabs: [
          ["Everyday Elegance", "everyday-elegance"],
          ["Occasion Dressing", "occasion-dressing"],
          ["Modern Heirlooms", "modern-heirlooms"],
        ].map(([label, slug]) => ({
          label: label!,
          source: { kind: "MANUAL", productIds: inCollection(slug!) },
        })),
        maxItems: 8,
      },
    },
    "site.footer": {
      type: "FOOTER",
      value: { social: [{ network: "INSTAGRAM", url: INSTAGRAM }] },
    },
  } as const;
  for (const [key, { type, value }] of Object.entries(blocks))
    await db.contentBlock.upsert({
      where: { key },
      create: {
        key,
        type,
        draft: value,
        published: value,
        publishedAt: new Date(),
      },
      update: { draft: value, published: value, publishedAt: new Date() },
    });

  // About: only the facts the owner gave (2026-10-26).
  const about = doc(
    "Sanéa Pret is an online label of women's eastern wear, founded and run by Saniya Abbadi.",
    "Follow the label on Instagram at @saneapret.",
  );
  const page = await db.page.upsert({
    where: { slug: "about" },
    create: {
      slug: "about",
      title: "About Sanéa Pret",
      draftBody: about,
      publishedBody: about,
      status: "PUBLISHED",
    },
    update: { draftBody: about, publishedBody: about, status: "PUBLISHED" },
  });

  // Policy pages: placeholders only. No policy or legal text is written by
  // engineering; the Owner and a lawyer supply it (OD-09, OD-12, D-186).
  const policies: { slug: string; title: string }[] = [
    { slug: "returns", title: "Returns and exchanges" },
    { slug: "shipping", title: "Shipping and delivery" },
    { slug: "privacy", title: "Privacy policy" },
    { slug: "terms", title: "Terms of use" },
  ];
  const help: { label: string; kind: string; id: string }[] = [];
  for (const policy of policies) {
    const body = doc(
      "This page is being prepared and will be published before the store opens.",
      "Questions in the meantime: message Sanéa Pret on Instagram at @saneapret.",
    );
    const row = await db.page.upsert({
      where: { slug: policy.slug },
      create: {
        slug: policy.slug,
        title: policy.title,
        draftBody: body,
        publishedBody: body,
        status: "PUBLISHED",
      },
      update: { draftBody: body, publishedBody: body, status: "PUBLISHED" },
    });
    help.push({ label: policy.title, kind: "PAGE", id: row.id });
  }

  // Menus, replaced whole as the admin does.
  const menus: [
    string,
    { label: string; kind: string; id?: string; url?: string }[],
  ][] = [
    [
      "HEADER",
      [
        { label: "New In", kind: "URL", url: "/new-in" },
        { label: "Shop all", kind: "URL", url: "/shop" },
        {
          label: "The Festive Edit",
          kind: "COLLECTION",
          id: collections.get("the-festive-edit")!,
        },
      ],
    ],
    [
      "CATEGORY_PILLS",
      catalogue.categories.map((c) => ({
        label: c.name,
        kind: "CATEGORY",
        id: categories.get(c.slug)!,
      })),
    ],
    [
      "FOOTER_SHOP",
      catalogue.collections.map((c) => ({
        label: c.name,
        kind: "COLLECTION",
        id: collections.get(c.slug)!,
      })),
    ],
    ["FOOTER_HELP", help],
    [
      "FOOTER_ABOUT",
      [{ label: "About Sanéa Pret", kind: "PAGE", id: page.id }],
    ],
  ];
  for (const [menu, items] of menus) {
    await db.navigationItem.deleteMany({
      where: { menu: menu as "HEADER" },
    });
    await db.navigationItem.createMany({
      data: items.map((item, i) => ({
        menu: menu as "HEADER",
        label: item.label,
        position: i,
        targetType: item.kind as "URL",
        targetId: item.id ?? null,
        url: item.url ?? null,
      })),
    });
  }
  return {
    created: true,
    products: catalogue.products.length,
    variants: variantCount,
  };
}

if (import.meta.main) {
  let url: string;
  try {
    url = assertSeedAllowed(process.env);
    if (!process.env.MEDIA_STORAGE_DIR)
      throw new SeedRefused("refusing to seed: MEDIA_STORAGE_DIR is not set");
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  }
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  try {
    const result = await seedDemo(db, process.env.MEDIA_STORAGE_DIR!);
    process.stdout.write(
      result.created
        ? `seeded the demo store: ${result.products} products, ${result.variants} variants\n`
        : "demo catalogue already present; nothing changed\n",
    );
  } finally {
    await db.$disconnect();
  }
}
