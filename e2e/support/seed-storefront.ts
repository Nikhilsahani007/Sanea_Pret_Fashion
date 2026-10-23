// Synthetic storefront data for the Phase 11 end-to-end test, in the
// disposable e2e database only (D-059). Everything is marked TEST; no real
// products, photographs, prices or brand claims.
//   node e2e/support/seed-storefront.ts
import { connect, urlFor } from "../../apps/api/src/db/testing/database.ts";

// The same database as reset-db.ts (importing that file would run it).
const db = connect(urlFor("sanea_test_e2e"));
const EMPTY = { type: "doc", content: [] };

try {
  const category = await db.category.create({
    data: {
      name: "TEST Storefront Kurtas",
      slug: "test-storefront-kurtas",
      status: "PUBLISHED",
    },
  });
  const colour = await db.colour.create({
    data: {
      name: "TEST Ivory",
      slug: "test-storefront-ivory",
      swatchHex: "#F8F4E9",
    },
  });
  const product = await db.product.create({
    data: {
      name: "TEST Storefront Kurta",
      slug: "test-storefront-kurta",
      categoryId: category.id,
      shortDescription: "TEST",
      description: EMPTY,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  const stock = { S: 0, M: 2, L: 8 } as const;
  for (const [label, onHand] of Object.entries(stock)) {
    const size = await db.size.findUniqueOrThrow({ where: { label } });
    await db.productVariant.create({
      data: {
        productId: product.id,
        colourId: colour.id,
        sizeId: size.id,
        sku: `TEST-SF-${label}`,
        pricePaise: 129_900,
        inventory: { create: { onHand } },
      },
    });
  }
  const page = await db.page.create({
    data: {
      slug: "test-storefront-help",
      title: "TEST Help",
      draftBody: EMPTY,
      publishedBody: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "TEST synthetic help text." }],
          },
        ],
      },
      status: "PUBLISHED",
    },
  });
  // Menus replaced whole, as the admin does.
  for (const menu of ["HEADER", "CATEGORY_PILLS", "FOOTER_HELP"] as const)
    await db.navigationItem.deleteMany({ where: { menu } });
  await db.navigationItem.createMany({
    data: [
      {
        menu: "HEADER",
        label: "TEST Kurtas",
        position: 0,
        targetType: "CATEGORY",
        targetId: category.id,
      },
      {
        menu: "CATEGORY_PILLS",
        label: "TEST Kurtas",
        position: 0,
        targetType: "CATEGORY",
        targetId: category.id,
      },
      {
        menu: "FOOTER_HELP",
        label: "TEST Help",
        position: 0,
        targetType: "PAGE",
        targetId: page.id,
      },
    ],
  });
  const announcement = { text: "TEST announcement" };
  await db.contentBlock.upsert({
    where: { key: "site.announcement" },
    create: {
      key: "site.announcement",
      type: "ANNOUNCEMENT_BAR",
      draft: announcement,
      published: announcement,
      publishedAt: new Date(),
    },
    update: {
      draft: announcement,
      published: announcement,
      publishedAt: new Date(),
    },
  });
} finally {
  await db.$disconnect();
}
