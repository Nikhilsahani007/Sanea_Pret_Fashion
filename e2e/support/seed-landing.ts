// Development placeholders for the Phase 12 landing test (phase-12-plan.md
// P12-4), in the disposable e2e database only. Every image is a flat field
// with "PLACEHOLDER" and the missing asset written on it, served through the
// normal derivative path; nothing here is real photography, and the landing
// gate cannot pass on it (D-120, B-06). All names are TEST.
//   node e2e/support/seed-landing.ts   (needs E2E_MEDIA_DIR from global setup)
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";

import { connect, urlFor } from "../../apps/api/src/db/testing/database.ts";

const media = process.env.E2E_MEDIA_DIR;
if (!media) throw new Error("E2E_MEDIA_DIR is not set (global setup).");
const db = connect(urlFor("sanea_test_e2e"));
const EMPTY = { type: "doc", content: [] };
const WIDTHS = [480, 960, 1440, 2048] as const;

/** A labelled placeholder in the given ratio, as WebP derivatives only. */
async function placeholder(
  admin: string,
  label: string,
  ratio: number,
  ground: string,
): Promise<string> {
  const key = randomBytes(16).toString("hex");
  const dir = join(media!, "public", key);
  await mkdir(dir, { recursive: true });
  const variants = [];
  for (const width of WIDTHS) {
    const height = Math.round(width / ratio);
    const size = Math.round(width / 22);
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <rect width="100%" height="100%" fill="${ground}"/>
        <text x="50%" y="42%" text-anchor="middle" font-family="Arial" font-size="${size * 1.6}" fill="#5a5156">PLACEHOLDER</text>
        <text x="50%" y="52%" text-anchor="middle" font-family="Arial" font-size="${size}" fill="#5a5156">${label}</text>
      </svg>`,
    );
    await sharp(svg)
      .webp({ quality: 70 })
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
      originalFilename: "TEST-placeholder.jpg",
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

try {
  const [admin] = await db.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO "admin_user" ("email", "name", "password_hash", "role", "mfa_secret_encrypted", "mfa_key_version", "mfa_enabled_at", "updated_at")
     VALUES ('test-landing-${Date.now()}@example.test', 'TEST Landing seed', 'TEST-hash', 'OWNER', '\\x00'::bytea, 1, now(), now()) RETURNING "id"::text AS "id"`,
  );
  const owner = admin!.id;
  const category = await db.category.create({
    data: {
      name: "TEST Landing Kurtas",
      slug: "test-landing-kurtas",
      status: "PUBLISHED",
    },
  });
  const sizes = await db.size.findMany({ orderBy: { position: "asc" } });
  const products: string[] = [];
  for (let i = 1; i <= 8; i++) {
    const colour = await db.colour.create({
      data: {
        name: `TEST Landing ${i}`,
        slug: `test-landing-colour-${i}`,
        swatchHex: "#D8C3B5",
      },
    });
    const product = await db.product.create({
      data: {
        name: `TEST Landing Kurta ${i}`,
        slug: `test-landing-kurta-${i}`,
        categoryId: category.id,
        shortDescription: "TEST",
        description: EMPTY,
        status: "PUBLISHED",
        // Seconds, not minutes: newer than anything earlier specs published in
        // the shared database, so New Ins (NEWEST) shows only these.
        publishedAt: new Date(Date.now() - i * 1_000),
        labels: i <= 3 ? ["NEW"] : [],
      },
    });
    for (const size of sizes.slice(0, 3))
      await db.productVariant.create({
        data: {
          productId: product.id,
          colourId: colour.id,
          sizeId: size.id,
          sku: `TEST-LND-${i}-${size.label}`,
          pricePaise: 149_900 + i * 10_000,
          inventory: { create: { onHand: 6 } },
        },
      });
    const image = await placeholder(
      owner,
      `product photograph ${i} (B-06)`,
      4 / 5,
      "#d8c3b5",
    );
    await db.productImage.create({
      data: {
        productId: product.id,
        mediaAssetId: image,
        alt: `TEST placeholder for product ${i}`,
        role: "PRIMARY",
      },
    });
    products.push(product.id);
  }
  const slides = [];
  for (let n = 1; n <= 3; n++) {
    slides.push({
      desktopImageId: await placeholder(
        owner,
        `campaign photograph ${n}, desktop (B-06)`,
        16 / 9,
        "#bfa89a",
      ),
      mobileImageId: await placeholder(
        owner,
        `campaign photograph ${n}, mobile (B-06)`,
        4 / 5,
        "#bfa89a",
      ),
      alt: `TEST placeholder campaign ${n}`,
      campaignLine: `TEST campaign line ${n}`,
      ctaLabel: "TEST Shop the edit",
      ctaTarget: { kind: "CATEGORY", id: category.id },
    });
  }
  const blocks = {
    "home.hero": { type: "HERO_SLIDE", value: { slides } },
    "home.newIns": {
      type: "PRODUCT_ROW",
      value: { title: "New Ins", source: { kind: "NEWEST" }, maxItems: 8 },
    },
    "home.row2": {
      type: "PRODUCT_ROW",
      value: {
        title: "TEST The second row",
        source: { kind: "MANUAL", productIds: products.slice(3, 8) },
        maxItems: 8,
      },
    },
    "home.tabbedGrid": {
      type: "TABBED_GRID",
      value: {
        tabs: [
          {
            label: "TEST Edit A",
            source: { kind: "MANUAL", productIds: products.slice(0, 4) },
          },
          {
            label: "TEST Edit B",
            source: { kind: "MANUAL", productIds: products.slice(4, 8) },
          },
        ],
        maxItems: 8,
      },
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
} finally {
  await db.$disconnect();
}
