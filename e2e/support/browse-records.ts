// Prints, as JSON, the enquiries and WhatsApp clicks stored for the Phase 13
// test product, so the browse spec can check what the API kept.
//   node e2e/support/browse-records.ts
import { connect, urlFor } from "../../apps/api/src/db/testing/database.ts";

const db = connect(urlFor("sanea_test_e2e"));
try {
  const product = await db.product.findUniqueOrThrow({
    where: { slug: "test-browse-kurta-1" },
    select: { id: true },
  });
  const enquiries = await db.enquiry.findMany({
    where: { productId: product.id },
    select: {
      name: true,
      phone: true,
      email: true,
      variantId: true,
      consentToContact: true,
      ipHash: true,
      sourcePath: true,
    },
  });
  const clicks = await db.whatsAppClick.findMany({
    where: { productId: product.id },
  });
  process.stdout.write(
    JSON.stringify({
      enquiries: enquiries.map((e) => ({ ...e, ipHash: e.ipHash !== null })),
      clicks: clicks.map((c) => Object.keys(c).sort()),
    }),
  );
} finally {
  await db.$disconnect();
}
