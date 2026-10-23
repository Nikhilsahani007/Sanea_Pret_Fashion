// Content rules: Rehma Foundation verification guard (D-010), block
// publishing pairs and navigation targets, enforced by PostgreSQL.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.ts";
import { createTestDatabase } from "./testing/database.ts";
import {
  SQLSTATE,
  expectAccepted,
  expectCheck,
  expectCode,
} from "./testing/expect.ts";
import * as fx from "./testing/fixtures.ts";

let db: PrismaClient;
let drop: () => Promise<void>;
let owner: string;

beforeAll(async () => {
  ({ db, drop } = await createTestDatabase());
  owner = await fx.admin(db);
});
afterAll(() => drop());

const pageSql = (slug: string, cols: Record<string, string> = {}) => {
  const all = {
    slug: `'${slug}'`,
    title: "'TEST'",
    draft_body: "'{}'",
    updated_at: "now()",
    ...cols,
  };
  return `INSERT INTO "page" (${Object.keys(all)
    .map((k) => `"${k}"`)
    .join(", ")}) VALUES (${Object.values(all).join(", ")})`;
};
const rehma = (set: string) =>
  `UPDATE "page" SET ${set} WHERE "slug" = 'rehma-foundation'`;

describe("Rehma Foundation page", () => {
  it("cannot be created without the verification requirement", () =>
    expectCheck(
      db,
      pageSql("rehma-foundation"),
      "page_rehma_requires_verification_check",
    ));

  it("cannot be created already published and unverified", () =>
    expectCheck(
      db,
      pageSql("rehma-foundation", {
        requires_verification: "true",
        status: "'PUBLISHED'",
      }),
      "page_verification_required_check",
    ));

  it("exists as the migration's draft, with the requirement (Q10-9)", async () => {
    const rows = await db.$queryRawUnsafe<
      { status: string; rv: boolean; published: boolean; verified: boolean }[]
    >(
      `SELECT "status"::text AS "status", "requires_verification" AS "rv",
        "published_body" IS NOT NULL AS "published", "verified_at" IS NOT NULL AS "verified"
       FROM "page" WHERE "slug" = 'rehma-foundation'`,
    );
    expect(rows).toEqual([
      { status: "DRAFT", rv: true, published: false, verified: false },
    ]);
  });

  it("cannot be published before verification", () =>
    expectCheck(
      db,
      rehma(`"status" = 'PUBLISHED'`),
      "page_verification_required_check",
    ));

  it("cannot have its protection switched off, alone or while publishing", async () => {
    await expectCheck(
      db,
      rehma(`"requires_verification" = false`),
      "page_rehma_requires_verification_check",
    );
    await expectCheck(
      db,
      rehma(`"requires_verification" = false, "status" = 'PUBLISHED'`),
      "page_rehma_requires_verification_check",
    );
  });

  it("cannot be renamed away from the guard and then published (slug is checked too)", async () => {
    // Renaming keeps requires_verification = true, so publishing still needs verification.
    await expectCheck(
      db,
      rehma(`"slug" = 'rehma-foundation-x', "status" = 'PUBLISHED'`),
      "page_verification_required_check",
    );
  });

  it("requires verifier and verification time together", async () => {
    await expectCheck(
      db,
      rehma(`"verified_at" = now()`),
      "page_verified_by_check",
    );
    await expectCheck(
      db,
      rehma(`"verified_by_admin_id" = '${owner}'`),
      "page_verified_by_check",
    );
  });

  it("can be published once verified", async () => {
    await expectAccepted(
      db,
      rehma(`"verified_at" = now(), "verified_by_admin_id" = '${owner}'`),
    );
    await expectAccepted(
      db,
      rehma(`"status" = 'PUBLISHED', "published_body" = '{}'`),
    );
  });

  it("cannot drop verification while published", () =>
    expectCheck(
      db,
      rehma(`"verified_at" = NULL, "verified_by_admin_id" = NULL`),
      "page_verification_required_check",
    ));

  it("an ordinary page publishes without verification", () =>
    expectAccepted(db, pageSql("about", { status: "'PUBLISHED'" })));

  it("an ordinary page that opts in is guarded the same way", () =>
    expectCheck(
      db,
      pageSql("test-guarded", {
        requires_verification: "true",
        status: "'PUBLISHED'",
      }),
      "page_verification_required_check",
    ));
});

describe("content blocks", () => {
  const block = (published: string, publishedAt: string) =>
    `INSERT INTO "content_block" ("key", "type", "draft", "published", "published_at", "updated_at")
     VALUES ('test.' || gen_random_uuid(), 'ANNOUNCEMENT_BAR', '{}', ${published}, ${publishedAt}, now())`;

  it("rejects a published version without a publication time", () =>
    expectCheck(db, block("'{}'", "NULL"), "content_block_published_check"));

  it("rejects a publication time without a published version", () =>
    expectCheck(db, block("NULL", "now()"), "content_block_published_check"));

  it("accepts a draft-only block and a published one", async () => {
    await expectAccepted(db, block("NULL", "NULL"));
    await expectAccepted(db, block("'{}'", "now()"));
  });

  it("rejects an unknown block type", () =>
    expectCode(
      db,
      `INSERT INTO "content_block" ("key", "type", "draft", "updated_at") VALUES ('test.raw', 'RAW_HTML', '{}', now())`,
      SQLSTATE.INVALID_ENUM,
    ));
});

describe("navigation items", () => {
  const nav = (type: string, targetId: string, url: string) =>
    `INSERT INTO "navigation_item" ("menu", "label", "target_type", "target_id", "url", "updated_at")
     VALUES ('HEADER', 'TEST', '${type}', ${targetId}, ${url}, now())`;

  it.each([
    ["a URL item without a url", "URL", "NULL", "NULL"],
    [
      "a URL item with a target id",
      "URL",
      "uuidv7()",
      "'https://example.test'",
    ],
    ["an internal item without a target id", "CATEGORY", "NULL", "NULL"],
    [
      "an internal item with a url",
      "PAGE",
      "uuidv7()",
      "'https://example.test'",
    ],
  ])("rejects %s", (_name, type, targetId, url) =>
    expectCheck(db, nav(type, targetId, url), "navigation_item_target_check"),
  );

  it.each([
    ["a URL item", "URL", "NULL", "'https://example.test'"],
    ["an internal item", "COLLECTION", "uuidv7()", "NULL"],
  ])("accepts %s", (_name, type, targetId, url) =>
    expectAccepted(db, nav(type, targetId, url)),
  );
});
