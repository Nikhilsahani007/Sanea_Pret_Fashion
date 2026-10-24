// Development and end-to-end demo data: a small catalogue, stock, published
// homepage content and placeholder pages, so the storefront can be built,
// tested and screenshotted before real products and photographs exist (B-06).
//
// Everything is obviously fake: names start with "TEST", SKUs with "TEST-",
// and every image is a generated grey card reading "TEST PLACEHOLDER — not a
// product photograph". No stock photography, no generated garments. Never
// for production (assertSeedAllowed), and the landing gate cannot pass on it
// (D-120).
//
//   DATABASE_URL=… MEDIA_DIR=var/media npm run db:seed:demo
import { PrismaPg } from "@prisma/adapter-pg";
import sharp from "sharp";

import { PrismaClient, type Prisma } from "../generated/prisma/client.ts";
import { processImage } from "../modules/media/image.ts";
import {
  localMediaStorage,
  type StoredVariant,
} from "../modules/media/storage.ts";
import { assertSeedAllowed } from "./seed.ts";

type Db = PrismaClient;

const COLOURS = [
  {
    name: "TEST Pearl",
    slug: "test-demo-pearl",
    swatchHex: "#EFE7D6",
    tone: { r: 226, g: 219, b: 204 },
  },
  {
    name: "TEST Charcoal",
    slug: "test-demo-charcoal",
    swatchHex: "#2A2723",
    tone: { r: 92, g: 88, b: 82 },
  },
  {
    name: "TEST Blush",
    slug: "test-demo-blush",
    swatchHex: "#C9A3A0",
    tone: { r: 196, g: 178, b: 174 },
  },
] as const;

const CATEGORIES = ["Kurtas", "Co-ord sets", "Suits", "Dupattas"] as const;

/** Twelve sample products: name suffix, category index, price in paise, sizes, colours. */
const PRODUCTS: {
  n: string;
  cat: number;
  price: number;
  compare?: number;
  sizes: string[];
  colours: number[];
  label?: "NEW";
  stock: number[];
}[] = [
  {
    n: "Kurta A",
    cat: 0,
    price: 349_900,
    sizes: ["S", "M", "L", "XL"],
    colours: [0, 2],
    label: "NEW",
    stock: [4, 6, 3, 1],
  },
  {
    n: "Kurta B",
    cat: 0,
    price: 429_900,
    sizes: ["S", "M", "L"],
    colours: [1],
    label: "NEW",
    stock: [2, 2, 0],
  },
  {
    n: "Kurta C",
    cat: 0,
    price: 289_900,
    compare: 359_900,
    sizes: ["M", "L", "XL", "XXL"],
    colours: [0],
    stock: [5, 5, 5, 2],
  },
  {
    n: "Co-ord Set A",
    cat: 1,
    price: 589_900,
    sizes: ["S", "M", "L"],
    colours: [2],
    label: "NEW",
    stock: [3, 3, 3],
  },
  {
    n: "Co-ord Set B",
    cat: 1,
    price: 649_900,
    sizes: ["M", "L"],
    colours: [0, 1],
    stock: [1, 0],
  },
  {
    n: "Suit A",
    cat: 2,
    price: 899_900,
    sizes: ["S", "M", "L", "XL"],
    colours: [1],
    label: "NEW",
    stock: [2, 4, 4, 2],
  },
  {
    n: "Suit B",
    cat: 2,
    price: 1_249_900,
    sizes: ["M", "L"],
    colours: [0],
    stock: [0, 0],
  },
  {
    n: "Suit C",
    cat: 2,
    price: 749_900,
    sizes: ["S", "M", "L"],
    colours: [2, 0],
    stock: [3, 2, 1],
  },
  {
    n: "Dupatta A",
    cat: 3,
    price: 189_900,
    sizes: ["Free Size"],
    colours: [0, 2],
    label: "NEW",
    stock: [8],
  },
  {
    n: "Dupatta B",
    cat: 3,
    price: 159_900,
    sizes: ["Free Size"],
    colours: [1],
    stock: [6],
  },
  {
    n: "Kurta D",
    cat: 0,
    price: 319_900,
    sizes: ["S", "M", "L"],
    colours: [2],
    stock: [2, 3, 2],
  },
  {
    n: "Co-ord Set C",
    cat: 1,
    price: 529_900,
    sizes: ["S", "M", "L", "XL"],
    colours: [1],
    label: "NEW",
    stock: [1, 2, 2, 1],
  },
];

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const para = (text: string) => ({ blocks: [{ type: "paragraph", text }] });

/** A flat grey card with the placeholder notice; never mistaken for a product photograph. */
async function placeholder(
  width: number,
  height: number,
  tone: { r: number; g: number; b: number },
  title: string,
) {
  const size = Math.round(width / 22);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <text x="50%" y="46%" font-family="sans-serif" font-size="${size}" font-weight="700" text-anchor="middle" fill="#1c1a17">TEST PLACEHOLDER</text>
    <text x="50%" y="${46 + 6}%" font-family="sans-serif" font-size="${Math.round(size * 0.55)}" text-anchor="middle" fill="#1c1a17">not a product photograph · ${title.replace(/[<&>]/g, "")}</text>
  </svg>`;
  return sharp({ create: { width, height, channels: 3, background: tone } })
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toBuffer();
}

async function upload(
  db: Db,
  mediaDir: string,
  adminId: string,
  data: Buffer,
  name: string,
) {
  const storage = localMediaStorage(mediaDir);
  const processed = await processImage(data);
  const key = storage.newKey();
  await storage.putOriginal(key, "png", data);
  const variants: StoredVariant[] = [];
  for (const d of processed.derivatives) {
    const path = `${key}/${d.width}.${d.format}`;
    await storage.putPublic(path, d.data);
    variants.push({ format: d.format, width: d.width, height: d.height, path });
  }
  return db.mediaAsset.create({
    data: {
      storageKey: key,
      originalFilename: name,
      mimeType: processed.mimeType,
      width: processed.width,
      height: processed.height,
      bytes: data.length,
      variants,
      uploadedByAdminId: adminId,
    },
  });
}

export async function seedDemo(
  db: Db,
  mediaDir: string,
): Promise<{ created: boolean; products: number }> {
  if (await db.product.count({ where: { slug: { startsWith: "test-demo-" } } }))
    return { created: false, products: 0 };
  const admin = await db.adminUser.findFirst({
    where: { role: "OWNER" },
    orderBy: { createdAt: "asc" },
  });
  if (!admin)
    throw new Error(
      "demo seed needs an Owner (npm run admin:create-owner) to own the uploads",
    );
  const sizes = new Map((await db.size.findMany()).map((s) => [s.label, s.id]));

  const categories = [];
  for (const [i, name] of CATEGORIES.entries())
    categories.push(
      await db.category.create({
        data: {
          name: `TEST ${name}`,
          slug: `test-demo-${slug(name)}`,
          position: i,
          status: "PUBLISHED",
        },
      }),
    );
  const colours = [];
  for (const [i, c] of COLOURS.entries())
    colours.push(
      await db.colour.create({
        data: {
          name: c.name,
          slug: c.slug,
          swatchHex: c.swatchHex,
          position: i,
        },
      }),
    );

  const heroDesktop = await upload(
    db,
    mediaDir,
    admin.id,
    await placeholder(2400, 1350, { r: 186, g: 178, b: 166 }, "hero, desktop"),
    "test-hero-desktop.png",
  );
  const heroMobile = await upload(
    db,
    mediaDir,
    admin.id,
    await placeholder(1080, 1350, { r: 186, g: 178, b: 166 }, "hero, mobile"),
    "test-hero-mobile.png",
  );
  const heroDesktop2 = await upload(
    db,
    mediaDir,
    admin.id,
    await placeholder(
      2400,
      1350,
      { r: 160, g: 152, b: 142 },
      "hero 2, desktop",
    ),
    "test-hero-2-desktop.png",
  );

  const now = Date.now();
  const collection = await db.collection.create({
    data: {
      name: "TEST New Season",
      slug: "test-demo-new-season",
      status: "PUBLISHED",
    },
  });
  const created: string[] = [];
  for (const [i, p] of PRODUCTS.entries()) {
    const product = await db.product.create({
      data: {
        name: `TEST ${p.n}`,
        slug: `test-demo-${slug(p.n)}`,
        categoryId: categories[p.cat]!.id,
        shortDescription: "TEST data. Not a real product.",
        description: para(
          "TEST description. Real product copy, fabric and care details come from the brand team.",
        ),
        fabric: "TEST fabric, to be confirmed",
        care: "TEST care, to be confirmed",
        status: "PUBLISHED",
        publishedAt: new Date(now - i * 3_600_000),
        labels: p.label ? [p.label] : [],
      },
    });
    created.push(product.id);
    for (const ci of p.colours)
      for (const [si, label] of p.sizes.entries()) {
        const v = await db.productVariant.create({
          data: {
            productId: product.id,
            colourId: colours[ci]!.id,
            sizeId: sizes.get(label)!,
            sku: `TEST-D${String(i + 1).padStart(2, "0")}-${COLOURS[ci]!.slug.slice(10, 12).toUpperCase()}-${label.replace(" ", "")}`,
            pricePaise: p.price,
            compareAtPricePaise: p.compare ?? null,
            inventory: {
              create: {
                onHand: Math.max(0, (p.stock[si] ?? 0) - (ci > 0 ? 1 : 0)),
              },
            },
          },
        });
        const onHand = Math.max(0, (p.stock[si] ?? 0) - (ci > 0 ? 1 : 0));
        if (onHand > 0)
          await db.stockMovement.create({
            data: {
              variantId: v.id,
              type: "RECEIVED",
              onHandDelta: onHand,
              reason: "TEST demo seed",
            },
          });
      }
    const images: Prisma.ProductImageCreateManyInput[] = [];
    for (const [k, ci] of p.colours.entries()) {
      const tone = COLOURS[ci]!.tone;
      const front = await upload(
        db,
        mediaDir,
        admin.id,
        await placeholder(1200, 1500, tone, `${p.n}, front`),
        `test-${slug(p.n)}-${ci}-front.png`,
      );
      const back = await upload(
        db,
        mediaDir,
        admin.id,
        await placeholder(
          1200,
          1500,
          { r: tone.r - 14, g: tone.g - 14, b: tone.b - 14 },
          `${p.n}, back`,
        ),
        `test-${slug(p.n)}-${ci}-back.png`,
      );
      const colourId = k === 0 ? null : colours[ci]!.id;
      images.push(
        {
          productId: product.id,
          mediaAssetId: front.id,
          colourId,
          alt: `TEST placeholder for ${p.n}, front`,
          role: "PRIMARY",
          position: images.length,
        },
        {
          productId: product.id,
          mediaAssetId: back.id,
          colourId,
          alt: `TEST placeholder for ${p.n}, back`,
          role: "HOVER",
          position: images.length + 1,
        },
      );
    }
    await db.productImage.createMany({ data: images });
    if (p.label === "NEW")
      await db.collectionProduct.create({
        data: {
          collectionId: collection.id,
          productId: product.id,
          position: i,
        },
      });
  }
  await db.$executeRaw`SELECT refresh_product_search(id) FROM "product" WHERE slug LIKE 'test-demo-%'`;

  const at = new Date();
  const block = (
    key: string,
    type: Prisma.ContentBlockCreateInput["type"],
    value: Prisma.InputJsonValue,
  ) =>
    db.contentBlock.upsert({
      where: { key },
      create: {
        key,
        type,
        draft: value,
        published: value,
        publishedAt: at,
        publishedByAdminId: admin.id,
      },
      update: {
        draft: value,
        published: value,
        publishedAt: at,
        publishedByAdminId: admin.id,
      },
    });
  await block("home.announcement", "ANNOUNCEMENT_BAR", {
    text: "TEST announcement, replace with real store news",
  });
  await block("home.hero", "HERO_SLIDE", {
    slides: [
      {
        desktopImageId: heroDesktop.id,
        mobileImageId: heroMobile.id,
        alt: "TEST placeholder in place of the campaign photograph",
        campaignLine: "TEST campaign line, replace with the real campaign",
        ctaLabel: "Shop the edit",
        ctaTarget: { type: "COLLECTION", slug: "test-demo-new-season" },
        focalX: 50,
        focalY: 40,
      },
      {
        desktopImageId: heroDesktop2.id,
        mobileImageId: heroMobile.id,
        alt: "TEST placeholder for a second campaign photograph",
        campaignLine: "TEST second campaign line",
        ctaLabel: "Shop kurtas",
        ctaTarget: { type: "CATEGORY", slug: "test-demo-kurtas" },
        focalX: 50,
        focalY: 50,
      },
    ],
  });
  await block("home.pills", "CATEGORY_PILLS", {
    pills: [
      ...CATEGORIES.map((c) => ({
        label: c,
        target: { type: "CATEGORY", slug: `test-demo-${slug(c)}` },
      })),
      {
        label: "New season",
        target: { type: "COLLECTION", slug: "test-demo-new-season" },
      },
    ],
  });
  await block("home.new-ins", "PRODUCT_ROW", {
    title: "New Ins",
    source: { type: "NEWEST" },
    maxItems: 10,
    viewAll: { type: "URL", href: "/new-in" },
  });
  await block("home.row-2", "PRODUCT_ROW", {
    title: "Suits",
    source: { type: "CATEGORY", slug: "test-demo-suits" },
    maxItems: 8,
    viewAll: { type: "CATEGORY", slug: "test-demo-suits" },
  });
  await block("home.tabbed", "TABBED_GRID", {
    title: "Shop by piece",
    tabs: [
      {
        label: "Kurtas",
        source: { type: "CATEGORY", slug: "test-demo-kurtas" },
      },
      {
        label: "Co-ord sets",
        source: { type: "CATEGORY", slug: "test-demo-co-ord-sets" },
      },
      {
        label: "Dupattas",
        source: { type: "CATEGORY", slug: "test-demo-dupattas" },
      },
    ],
    maxItems: 8,
  });
  for (const [s, title] of [
    ["about", "About"],
    ["policy-returns", "Returns and exchanges"],
    ["policy-shipping", "Shipping"],
    ["policy-privacy", "Privacy"],
    ["policy-terms", "Terms"],
  ] as const)
    await db.page.create({
      data: {
        slug: s,
        title,
        status: "PUBLISHED",
        draftBody: para(
          `TEST placeholder. The real ${title.toLowerCase()} text must come from Sanéa Pret${s.startsWith("policy") ? " and its legal adviser" : ""}.`,
        ),
        publishedBody: para(
          `TEST placeholder. The real ${title.toLowerCase()} text must come from Sanéa Pret${s.startsWith("policy") ? " and its legal adviser" : ""}.`,
        ),
      },
    });
  await block("site.footer", "FOOTER", {
    groups: [
      {
        title: "Shop",
        links: CATEGORIES.map((c) => ({
          label: c,
          target: { type: "CATEGORY", slug: `test-demo-${slug(c)}` },
        })),
      },
      {
        title: "Help",
        links: [
          {
            label: "Shipping",
            target: { type: "PAGE", slug: "policy-shipping" },
          },
          {
            label: "Returns",
            target: { type: "PAGE", slug: "policy-returns" },
          },
          {
            label: "Privacy",
            target: { type: "PAGE", slug: "policy-privacy" },
          },
          { label: "Terms", target: { type: "PAGE", slug: "policy-terms" } },
        ],
      },
      {
        title: "Sanéa Pret",
        links: [{ label: "About", target: { type: "PAGE", slug: "about" } }],
      },
    ],
    social: [],
  });
  const header = [
    { label: "New in", url: "/new-in" },
    { label: "Shop", url: "/shop" },
    { label: "Collections", url: "/collections" },
  ];
  await db.navigationItem.createMany({
    data: header.map((h, position) => ({
      menu: "HEADER",
      label: h.label,
      targetType: "URL" as const,
      url: h.url,
      position,
    })),
  });
  return { created: true, products: created.length };
}

if (import.meta.main) {
  let url: string;
  try {
    url = assertSeedAllowed(process.env);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  }
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  try {
    const result = await seedDemo(db, process.env.MEDIA_DIR ?? "var/media");
    process.stdout.write(
      result.created
        ? `seeded ${result.products} TEST demo products with placeholder images\n`
        : "demo data already present; nothing changed\n",
    );
  } finally {
    await db.$disconnect();
  }
}
