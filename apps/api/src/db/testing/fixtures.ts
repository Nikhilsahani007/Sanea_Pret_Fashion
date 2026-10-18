// Minimal rows for integration tests, inserted with plain SQL. All values are
// obviously fake (`TEST-`).
import type { PrismaClient } from "../../generated/prisma/client.ts";

async function one(db: PrismaClient, sql: string): Promise<string> {
  const rows = await db.$queryRawUnsafe<{ id: string }[]>(sql);
  const id = rows[0]?.id;
  if (!id) throw new Error(`fixture insert returned no id: ${sql}`);
  return id;
}

let n = 0;
const next = () => ++n;

export function admin(db: PrismaClient, role = "OWNER"): Promise<string> {
  const i = next();
  return one(
    db,
    `INSERT INTO "admin_user" ("email", "name", "password_hash", "role", "updated_at")
     VALUES ('test-admin-${i}@example.test', 'TEST Admin ${i}', 'TEST-hash', '${role}', now()) RETURNING "id"`,
  );
}

export function category(db: PrismaClient): Promise<string> {
  const i = next();
  return one(
    db,
    `INSERT INTO "category" ("name", "slug", "updated_at")
     VALUES ('TEST Category ${i}', 'test-category-${i}', now()) RETURNING "id"`,
  );
}

export function colour(db: PrismaClient): Promise<string> {
  const i = next();
  return one(
    db,
    `INSERT INTO "colour" ("name", "slug", "swatch_hex")
     VALUES ('TEST Colour ${i}', 'test-colour-${i}', '#A1B2C3') RETURNING "id"`,
  );
}

export function size(db: PrismaClient, label: string): Promise<string> {
  return one(db, `SELECT "id" FROM "size" WHERE "label" = '${label}'`);
}

export async function product(
  db: PrismaClient,
  categoryId?: string,
): Promise<string> {
  const i = next();
  const cat = categoryId ?? (await category(db));
  return one(
    db,
    `INSERT INTO "product" ("name", "slug", "category_id", "short_description", "description", "updated_at")
     VALUES ('Sample Kurta ${i}', 'test-product-${i}', '${cat}', 'TEST', '{}', now()) RETURNING "id"`,
  );
}

export async function variant(
  db: PrismaClient,
  productId?: string,
): Promise<string> {
  const i = next();
  const p = productId ?? (await product(db));
  const c = await colour(db);
  const s = await size(db, "M");
  return one(
    db,
    `INSERT INTO "product_variant" ("product_id", "colour_id", "size_id", "sku", "price_paise", "updated_at")
     VALUES ('${p}', '${c}', '${s}', 'TEST-SKU-${i}', 129900, now()) RETURNING "id"`,
  );
}

export async function media(db: PrismaClient): Promise<string> {
  const i = next();
  const a = await admin(db);
  return one(
    db,
    `INSERT INTO "media_asset" ("storage_key", "original_filename", "mime_type", "width", "height", "bytes", "uploaded_by_admin_id")
     VALUES ('test/${i}.jpg', 'TEST-${i}.jpg', 'image/jpeg', 800, 1000, 1234, '${a}') RETURNING "id"`,
  );
}
