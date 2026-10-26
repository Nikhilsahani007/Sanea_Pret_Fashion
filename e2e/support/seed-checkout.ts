// Synthetic data for the Phase 15 checkout test, in the disposable e2e
// database only (D-059). Everything is marked TEST; no real products, prices
// or policies. The category pill replaces the pills menu, as the admin does.
//   node e2e/support/seed-checkout.ts
import { connect, urlFor } from "../../apps/api/src/db/testing/database.ts";

const db = connect(urlFor("sanea_test_e2e"));

try {
  const category = await db.category.create({
    data: {
      name: "TEST Checkout Kurtas",
      slug: "test-checkout-kurtas",
      status: "PUBLISHED",
    },
  });
  const colour = await db.colour.create({
    data: {
      name: "TEST Checkout Rose",
      slug: "test-checkout-rose",
      swatchHex: "#D8C3B5",
    },
  });
  const product = await db.product.create({
    data: {
      name: "TEST Checkout Kurta",
      slug: "test-checkout-kurta",
      categoryId: category.id,
      shortDescription: "TEST synthetic product.",
      description: { type: "doc", content: [] },
      status: "PUBLISHED",
      publishedAt: new Date(Date.now() - 60_000),
    },
  });
  for (const label of ["M", "L"]) {
    const size = await db.size.findUniqueOrThrow({ where: { label } });
    await db.productVariant.create({
      data: {
        productId: product.id,
        colourId: colour.id,
        sizeId: size.id,
        sku: `TEST-CO-${label}`,
        pricePaise: 249_900,
        inventory: { create: { onHand: 50 } },
      },
    });
  }
  await db.navigationItem.deleteMany({ where: { menu: "CATEGORY_PILLS" } });
  await db.navigationItem.create({
    data: {
      menu: "CATEGORY_PILLS",
      label: "TEST Checkout Kurtas",
      position: 0,
      targetType: "CATEGORY",
      targetId: category.id,
    },
  });
} finally {
  await db.$disconnect();
}
