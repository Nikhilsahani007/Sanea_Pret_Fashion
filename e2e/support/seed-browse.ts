// Synthetic data for the Phase 13 browse-and-enquire test, in the disposable
// e2e database only (D-059). Everything is marked TEST; no real products,
// photographs, prices, policies or contact details. The WhatsApp number is a
// placeholder that only shows the link working.
//   node e2e/support/seed-browse.ts
import { connect, urlFor } from "../../apps/api/src/db/testing/database.ts";

const db = connect(urlFor("sanea_test_e2e"));
try {
  const category = await db.category.create({
    data: {
      name: "TEST Browse Kurtas",
      slug: "test-browse-kurtas",
      status: "PUBLISHED",
    },
  });
  const chart = await db.sizeChart.create({
    data: {
      name: "TEST Kurta chart",
      unit: "CM",
      rows: [
        { size: "M", measurements: { Bust: 96, Length: 112 } },
        { size: "L", measurements: { Bust: 101, Length: 114 } },
      ],
    },
  });
  const colours = await Promise.all(
    [
      ["TEST Rose", "test-browse-rose", "#D8C3B5"],
      ["TEST Ivory", "test-browse-ivory", "#F8F4E9"],
    ].map(([name, slug, swatchHex]) =>
      db.colour.create({
        data: { name: name!, slug: slug!, swatchHex: swatchHex! },
      }),
    ),
  );
  const sizes = await db.size.findMany({
    where: { label: { in: ["M", "L"] } },
    orderBy: { position: "asc" },
  });
  const products = [
    { n: 1, price: 189_900 },
    { n: 2, price: 249_900 },
    { n: 3, price: 99_900 },
  ];
  const collection = await db.collection.create({
    data: {
      name: "TEST Browse Edit",
      slug: "test-browse-edit",
      description: "TEST synthetic collection.",
      status: "PUBLISHED",
    },
  });
  for (const { n, price } of products) {
    const product = await db.product.create({
      data: {
        name: `TEST Browse Kurta ${n}`,
        slug: `test-browse-kurta-${n}`,
        categoryId: category.id,
        sizeChartId: chart.id,
        shortDescription: "TEST synthetic product.",
        description: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "TEST synthetic description." }],
            },
          ],
        },
        fabric: "TEST fabric",
        care: "TEST care",
        status: "PUBLISHED",
        publishedAt: new Date(Date.now() - n * 1_000),
      },
    });
    for (const [c, colour] of colours.entries()) {
      // Product 1 only in rose; its L is sold out.
      if (n === 1 && c > 0) continue;
      for (const size of sizes)
        await db.productVariant.create({
          data: {
            productId: product.id,
            colourId: colour.id,
            sizeId: size.id,
            sku: `TEST-BR-${n}-${c}-${size.label}`,
            pricePaise: price,
            inventory: {
              create: { onHand: n === 1 && size.label === "L" ? 0 : 5 },
            },
          },
        });
    }
    if (n <= 2)
      await db.collectionProduct.create({
        data: {
          collectionId: collection.id,
          productId: product.id,
          position: n,
        },
      });
  }
  await db.storeSetting.upsert({
    where: { key: "contact.whatsapp" },
    create: {
      key: "contact.whatsapp",
      value: { number: "+919000000000", hours: "TEST hours" },
    },
    update: { value: { number: "+919000000000", hours: "TEST hours" } },
  });
} finally {
  await db.$disconnect();
}
