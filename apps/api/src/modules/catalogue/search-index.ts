// Keeps `product.search_vector` current (system-design.md §8). The SQL
// function `refresh_product_search` (Phase 8 migration) builds the document;
// callers run these helpers in the same transaction as the change.
import type { Prisma } from "../../generated/prisma/client.ts";

type Tx = Prisma.TransactionClient;

export async function refreshProducts(tx: Tx, ids: readonly string[]) {
  if (ids.length === 0) return;
  await tx.$executeRaw`SELECT refresh_product_search(id) FROM "product" WHERE id = ANY(${[...ids]}::uuid[])`;
}

export async function refreshCategory(tx: Tx, categoryId: string) {
  await tx.$executeRaw`SELECT refresh_product_search(id) FROM "product" WHERE category_id = ${categoryId}::uuid`;
}

export async function refreshCollection(tx: Tx, collectionId: string) {
  await tx.$executeRaw`SELECT refresh_product_search(product_id) FROM "collection_product" WHERE collection_id = ${collectionId}::uuid`;
}

export async function refreshColour(tx: Tx, colourId: string) {
  await tx.$executeRaw`SELECT refresh_product_search(p.id) FROM "product" p WHERE EXISTS (SELECT 1 FROM "product_variant" v WHERE v.product_id = p.id AND v.colour_id = ${colourId}::uuid)`;
}
