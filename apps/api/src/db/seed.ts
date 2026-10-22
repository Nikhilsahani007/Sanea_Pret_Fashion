// Development seed: obviously fake catalogue and stock (project-requirements.md:
// "Sample …" names, `TEST-` SKUs). Never for production.
//
//   npm run db:seed   (needs DATABASE_URL to a local database)
//
// Idempotent: if the sample data is already there it does nothing, because
// stock movements are append-only and cannot be deleted to re-seed.
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client.ts";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

export class SeedRefused extends Error {}

/** Refuses production and anything but a loopback database. */
export function assertSeedAllowed(env: NodeJS.ProcessEnv): string {
  if (env.NODE_ENV === "production")
    throw new SeedRefused("refusing to seed: NODE_ENV is production");
  const raw = env.DATABASE_URL;
  if (!raw) throw new SeedRefused("refusing to seed: DATABASE_URL is not set");
  let host: string;
  try {
    host = new URL(raw).hostname;
  } catch {
    throw new SeedRefused("refusing to seed: DATABASE_URL is not a URL");
  }
  if (!LOOPBACK.has(host))
    throw new SeedRefused(
      "refusing to seed: DATABASE_URL must point at 127.0.0.1 or localhost",
    );
  return raw;
}

// Canonical rich text (Q8-10; words under `text`, R2).
const DESCRIPTION = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "TEST data. Not a real product." }],
    },
  ],
};

type SampleProduct = {
  code: string;
  name: string;
  category: "a" | "b";
  sizes: readonly string[];
  pricePaise: number;
  compareAtPricePaise?: number;
  published: boolean;
  /** Stock per variant, in size order; colour B gets one less (never below 0). */
  stock: readonly number[];
};

const STANDARD = ["S", "M", "L", "XL", "XXL"] as const;

export const SAMPLE_PRODUCTS: readonly SampleProduct[] = [
  {
    code: "SKA",
    name: "Sample Kurta A",
    category: "a",
    sizes: STANDARD,
    pricePaise: 129900,
    published: true,
    stock: [3, 5, 5, 2, 0],
  },
  {
    code: "SKB",
    name: "Sample Kurta B",
    category: "a",
    sizes: STANDARD,
    pricePaise: 159900,
    compareAtPricePaise: 189900,
    published: true,
    stock: [1, 1, 0, 1, 1],
  },
  {
    code: "SSC",
    name: "Sample Set C",
    category: "b",
    sizes: ["Free Size"],
    pricePaise: 249900,
    published: false,
    stock: [4],
  },
];

export type SeedResult = {
  created: boolean;
  products: number;
  variants: number;
};

export async function seedDevelopment(db: PrismaClient): Promise<SeedResult> {
  const existing = await db.product.count({
    where: { slug: { startsWith: "sample-" } },
  });
  if (existing > 0) return { created: false, products: existing, variants: 0 };

  return db.$transaction(async (tx) => {
    const sizes = new Map(
      (await tx.size.findMany()).map((s) => [s.label, s.id]),
    );
    const categories = {
      a: await tx.category.create({
        data: { name: "Sample Category A", slug: "sample-category-a" },
      }),
      b: await tx.category.create({
        data: { name: "Sample Category B", slug: "sample-category-b" },
      }),
    };
    const colours = [
      await tx.colour.create({
        data: {
          name: "Sample Colour A",
          slug: "sample-colour-a",
          swatchHex: "#D9D9D9",
          position: 1,
        },
      }),
      await tx.colour.create({
        data: {
          name: "Sample Colour B",
          slug: "sample-colour-b",
          swatchHex: "#595959",
          position: 2,
        },
      }),
    ];

    let variants = 0;
    for (const sample of SAMPLE_PRODUCTS) {
      const product = await tx.product.create({
        data: {
          name: sample.name,
          slug: sample.name.toLowerCase().replaceAll(" ", "-"),
          categoryId: categories[sample.category].id,
          shortDescription: "TEST data. Not a real product.",
          description: DESCRIPTION,
          status: sample.published ? "PUBLISHED" : "DRAFT",
          publishedAt: sample.published ? new Date() : null,
        },
      });
      for (const [c, colour] of colours.entries()) {
        for (const [i, label] of sample.sizes.entries()) {
          const sizeId = sizes.get(label);
          if (!sizeId) throw new Error(`size ${label} missing from migration`);
          const onHand = Math.max(0, (sample.stock[i] ?? 0) - c);
          const variant = await tx.productVariant.create({
            data: {
              productId: product.id,
              colourId: colour.id,
              sizeId,
              sku: `TEST-${sample.code}-${c === 0 ? "A" : "B"}-${label.replace(" ", "")}`,
              pricePaise: sample.pricePaise,
              compareAtPricePaise: sample.compareAtPricePaise ?? null,
              inventory: { create: { onHand } },
            },
          });
          if (onHand > 0)
            await tx.stockMovement.create({
              data: {
                variantId: variant.id,
                type: "RECEIVED",
                onHandDelta: onHand,
                reason: "TEST seed",
              },
            });
          variants++;
        }
      }
    }
    return { created: true, products: SAMPLE_PRODUCTS.length, variants };
  });
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
    const result = await seedDevelopment(db);
    process.stdout.write(
      result.created
        ? `seeded ${result.products} sample products, ${result.variants} variants\n`
        : "sample data already present; nothing changed\n",
    );
  } finally {
    await db.$disconnect();
  }
}
