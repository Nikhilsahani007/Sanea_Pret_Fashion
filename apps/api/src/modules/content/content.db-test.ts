// Content management against real PostgreSQL (phase-10-plan.md §7; D-093).
// The gate cases T-GATE-1 to T-GATE-10 each write a `[P10-GATE]` line for your
// review. All text here is synthetic test text in a disposable database.
import { AdminRole, EMPTY_RICH_TEXT } from "@sanea/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ADMIN } from "../../platform/testing.ts";
import { adminHarness, type Harness, type Session } from "../auth/testing.ts";

let h: Harness;
const s = new Map<AdminRole, Session>();
let ownerId: string;
const as = (role: AdminRole) => s.get(role)!;
const A = "/api/v1/admin/content";
const P = "/api/v1/content";
/** Planted only in drafts; must never appear in a public response. */
const MARKER = "DRAFTMARKER7F3A";
const report = (line: string) => process.stdout.write(`[P10-GATE] ${line}\n`);

beforeAll(async () => {
  h = await adminHarness();
  for (const role of Object.values(AdminRole)) {
    const admin = await h.createAdmin(role);
    if (role === AdminRole.OWNER) ownerId = admin.id;
    s.set(role, await h.signIn(admin));
  }
}, 120_000);
afterAll(async () => h.drop());

function send(
  method: "put" | "post" | "patch",
  path: string,
  body: object | undefined,
  session: Session,
) {
  const r = request(h.app)
    [method](path)
    .set("Origin", ADMIN)
    .set("Cookie", session.cookie)
    .set("X-CSRF-Token", session.csrfToken);
  return body === undefined ? r : r.send(body);
}
const pub = (path: string) => request(h.app).get(path);

let n = 0;
/** A visible product (published, published category, active variant) and an invisible one. */
async function catalogue() {
  const i = ++n;
  const category = await h.db.category.create({
    data: {
      name: `TEST cat ${i}`,
      slug: `test-ccat-${i}`,
      status: "PUBLISHED",
    },
  });
  const draftCategory = await h.db.category.create({
    data: {
      name: `TEST draft cat ${i}`,
      slug: `test-ccat-d-${i}`,
      status: "DRAFT",
    },
  });
  const colour = await h.db.colour.create({
    data: { name: `TEST ${i}`, slug: `test-ccol-${i}`, swatchHex: "#000000" },
  });
  const size = await h.db.size.findUniqueOrThrow({ where: { label: "S" } });
  const product = async (
    slug: string,
    status: "PUBLISHED" | "DRAFT" | "ARCHIVED",
    withVariant = true,
  ) => {
    const p = await h.db.product.create({
      data: {
        name: `TEST ${slug}`,
        slug,
        categoryId: category.id,
        shortDescription: "TEST",
        description: EMPTY_RICH_TEXT,
        status,
        publishedAt: status === "DRAFT" ? null : new Date(),
      },
    });
    if (withVariant)
      await h.db.productVariant.create({
        data: {
          productId: p.id,
          colourId: colour.id,
          sizeId: size.id,
          sku: `TEST-C-${slug}`.toUpperCase().slice(0, 40),
          pricePaise: 100_000,
          inventory: { create: {} },
        },
      });
    return p;
  };
  return {
    category,
    draftCategory,
    visible: await product(`test-vis-${i}`, "PUBLISHED"),
    draft: await product(`test-draft-${i}`, "DRAFT"),
    archived: await product(`test-arch-${i}`, "ARCHIVED"),
    noVariant: await product(`test-novar-${i}`, "PUBLISHED", false),
  };
}

async function asset() {
  const key = `${(++n).toString(16).padStart(32, "0")}`;
  return h.db.mediaAsset.create({
    data: {
      storageKey: `master/${key}.jpg`,
      originalFilename: "TEST.jpg",
      mimeType: "image/jpeg",
      width: 2400,
      height: 1350,
      bytes: 1000,
      uploadedByAdminId: ownerId,
      variants: [480, 960, 1440, 2048].flatMap((w) =>
        ["avif", "webp"].map((f) => ({
          key: `${key}/${w}.${f}`,
          format: f,
          width: w,
          height: Math.round(w * 0.5625),
        })),
      ),
    },
  });
}

/** Every public route's body, as text, for the marker scan. */
async function publicText(slugs: string[]): Promise<string> {
  const paths = [
    `${P}/home`,
    `${P}/navigation`,
    ...slugs.map((slug) => `${P}/pages/${slug}`),
    "/api/v1/catalogue/categories",
    "/api/v1/catalogue/collections",
    "/api/v1/catalogue/products",
    `/api/v1/search?q=${MARKER}`,
    `/api/v1/search/suggest?q=${MARKER}`,
  ];
  const bodies = await Promise.all(
    paths.map(async (p) => JSON.stringify((await pub(p)).body)),
  );
  return bodies.join("\n");
}

const doc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

describe("the Phase 10 gate", () => {
  it("T-GATE-1, T-GATE-2: drafts never appear publicly, before or after publishing", async () => {
    const c = await catalogue();
    const page = await send(
      "post",
      `${A}/pages`,
      { slug: "test-about", title: "TEST About" },
      as(AdminRole.CATALOGUE_EDITOR),
    );
    expect(page.status).toBe(201);
    expect(
      (
        await send(
          "patch",
          `${A}/pages/test-about`,
          { draftBody: doc(`Published words. ${MARKER}`) },
          as(AdminRole.CATALOGUE_EDITOR),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await send(
          "put",
          `${A}/blocks/site.announcement`,
          { text: `Sale ${MARKER}` },
          as(AdminRole.CATALOGUE_EDITOR),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await send(
          "put",
          `${A}/blocks/home.row2`,
          {
            title: `Row ${MARKER}`,
            source: { kind: "CATEGORY", id: c.category.id },
            maxItems: 4,
          },
          as(AdminRole.MANAGER),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await send(
          "patch",
          `${A}/pages/rehma-foundation`,
          { draftBody: doc(`Unverified ${MARKER}`) },
          as(AdminRole.MANAGER),
        )
      ).status,
    ).toBe(200);
    expect(await publicText(["test-about", "rehma-foundation"])).not.toContain(
      MARKER,
    );

    // Publish the clean versions, then put the marker back into the drafts only.
    await send(
      "patch",
      `${A}/pages/test-about`,
      { draftBody: doc("Published words.") },
      as(AdminRole.CATALOGUE_EDITOR),
    );
    await send(
      "post",
      `${A}/pages/test-about/publish`,
      {},
      as(AdminRole.CATALOGUE_EDITOR),
    );
    await send(
      "put",
      `${A}/blocks/site.announcement`,
      { text: "Free shipping" },
      as(AdminRole.CATALOGUE_EDITOR),
    );
    expect(
      (
        await send(
          "post",
          `${A}/blocks/site.announcement/publish`,
          undefined,
          as(AdminRole.CATALOGUE_EDITOR),
        )
      ).status,
    ).toBe(200);
    await send(
      "patch",
      `${A}/pages/test-about`,
      { draftBody: doc(`Next draft ${MARKER}`) },
      as(AdminRole.CATALOGUE_EDITOR),
    );
    await send(
      "put",
      `${A}/blocks/site.announcement`,
      { text: `Next ${MARKER}` },
      as(AdminRole.CATALOGUE_EDITOR),
    );

    const text = await publicText(["test-about", "rehma-foundation"]);
    expect(text).not.toContain(MARKER);
    expect(text).toContain("Published words.");
    expect(text).toContain("Free shipping");
    const admin = await h.get(
      `${A}/blocks/site.announcement`,
      as(AdminRole.CATALOGUE_EDITOR),
    );
    expect(admin.body).toMatchObject({
      unpublishedChanges: true,
      published: { text: "Free shipping" },
    });
    report(
      "T-GATE-1/2 marker planted in 4 drafts (page, announcement, product row, Rehma): absent from 9 public routes, before and after publishing; published versions served",
    );
  });

  it("T-GATE-3: unpublished and archived content disappears at once; 404s are not cached", async () => {
    await send(
      "post",
      `${A}/pages`,
      { slug: "test-policy", title: "TEST Policy" },
      as(AdminRole.MANAGER),
    );
    await send(
      "patch",
      `${A}/pages/test-policy`,
      { draftBody: doc("TEST policy text") },
      as(AdminRole.MANAGER),
    );
    await send(
      "post",
      `${A}/pages/test-policy/publish`,
      {},
      as(AdminRole.MANAGER),
    );
    const live = await pub(`${P}/pages/test-policy`);
    expect(live.status).toBe(200);
    expect(live.headers["cache-control"]).toBe("public, max-age=60");
    expect(
      (
        await send(
          "post",
          `${A}/pages/test-policy/unpublish`,
          undefined,
          as(AdminRole.MANAGER),
        )
      ).body.status,
    ).toBe("ARCHIVED");
    const gone = await pub(`${P}/pages/test-policy`);
    expect(gone.status).toBe(404);
    expect(gone.headers["cache-control"]).toBe("no-store");
    await send(
      "post",
      `${A}/blocks/site.announcement/unpublish`,
      undefined,
      as(AdminRole.MANAGER),
    );
    expect((await pub(`${P}/home`)).body.announcement).toBeNull();
    report(
      "T-GATE-3 unpublished page: 200 then 404 (no-store) immediately; unpublished announcement: absent from /content/home",
    );
  });

  it("T-GATE-4: the Rehma page is a 404 identical to an unknown slug while unpublished", async () => {
    const row = await h.db.page.findUniqueOrThrow({
      where: { slug: "rehma-foundation" },
    });
    expect(row).toMatchObject({
      status: "DRAFT",
      requiresVerification: true,
      verifiedAt: null,
      publishedBody: null,
    });
    const rehma = await pub(`${P}/pages/rehma-foundation`);
    const unknown = await pub(`${P}/pages/no-such-page-anywhere`);
    expect(rehma.status).toBe(404);
    expect(unknown.status).toBe(404);
    const shape = (r: typeof rehma) => ({
      status: r.status,
      cache: r.headers["cache-control"],
      type: r.headers["content-type"],
      code: r.body.error.code,
      message: r.body.error.message,
    });
    expect(shape(rehma)).toEqual(shape(unknown));
    report(
      "T-GATE-4 rehma-foundation (migration row: DRAFT, requires verification, unverified): 404 identical to an unknown slug in status, code, message and headers",
    );
  });

  it("T-GATE-5: only the Owner may publish it; Managers and catalogue editors get 403", async () => {
    const draftVersion = (
      await h.get(`${A}/pages/rehma-foundation`, as(AdminRole.MANAGER))
    ).body.draftVersion;
    for (const role of [AdminRole.MANAGER, AdminRole.CATALOGUE_EDITOR])
      expect(
        (
          await send(
            "post",
            `${A}/pages/rehma-foundation/publish`,
            { verified: true, draftVersion },
            as(role),
          )
        ).status,
        role,
      ).toBe(403);
    expect(
      (
        await send(
          "post",
          `${A}/pages/rehma-foundation/publish`,
          { verified: true, draftVersion },
          as(AdminRole.FULFILMENT),
        )
      ).status,
    ).toBe(403);
    // Catalogue editors cannot even edit it.
    expect(
      (
        await send(
          "patch",
          `${A}/pages/rehma-foundation`,
          { title: "TEST" },
          as(AdminRole.CATALOGUE_EDITOR),
        )
      ).status,
    ).toBe(403);
    expect((await pub(`${P}/pages/rehma-foundation`)).status).toBe(404);
    report(
      "T-GATE-5 Rehma publish by Manager, catalogue editor and fulfilment: 403; catalogue editor edit: 403; public still 404",
    );
  });

  it("T-GATE-6: the Owner must verify the exact draft reviewed", async () => {
    await send(
      "patch",
      `${A}/pages/rehma-foundation`,
      { draftBody: doc("TEST verified wording, synthetic.") },
      as(AdminRole.MANAGER),
    );
    const reviewed = (
      await h.get(`${A}/pages/rehma-foundation`, as(AdminRole.OWNER))
    ).body.draftVersion;
    const owner = as(AdminRole.OWNER);
    const noFlag = await send(
      "post",
      `${A}/pages/rehma-foundation/publish`,
      { draftVersion: reviewed },
      owner,
    );
    const falseFlag = await send(
      "post",
      `${A}/pages/rehma-foundation/publish`,
      { verified: false, draftVersion: reviewed },
      owner,
    );
    expect([noFlag.status, falseFlag.status]).toEqual([400, 400]);
    // A Manager changes the draft after the Owner reviewed it.
    await new Promise((r) => setTimeout(r, 5));
    await send(
      "patch",
      `${A}/pages/rehma-foundation`,
      { draftBody: doc("TEST changed after review, synthetic.") },
      as(AdminRole.MANAGER),
    );
    const stale = await send(
      "post",
      `${A}/pages/rehma-foundation/publish`,
      { verified: true, draftVersion: reviewed },
      owner,
    );
    expect(stale.status).toBe(409);
    expect(stale.body.error.details[0].code).toBe("DRAFT_CHANGED");
    expect((await pub(`${P}/pages/rehma-foundation`)).status).toBe(404);
    report(
      "T-GATE-6 Owner without verified:true: 400; verified:false: 400; stale draft version: 409 DRAFT_CHANGED; public still 404",
    );
  });

  it("T-GATE-7: the database and the API refuse to bypass verification", async () => {
    const sqlState = (p: Promise<unknown>) =>
      p.then(
        () => "accepted",
        (e: unknown) =>
          /check constraint "([a-z_]+)"/.exec(
            String((e as Error).message),
          )?.[1] ?? String(e),
      );
    const publishRaw = await sqlState(
      h.db.$executeRawUnsafe(
        `UPDATE "page" SET "status" = 'PUBLISHED', "published_body" = "draft_body" WHERE "slug" = 'rehma-foundation'`,
      ),
    );
    const clearFlag = await sqlState(
      h.db.$executeRawUnsafe(
        `UPDATE "page" SET "requires_verification" = false WHERE "slug" = 'rehma-foundation'`,
      ),
    );
    expect(publishRaw).toBe("page_verification_required_check");
    expect(clearFlag).toBe("page_rehma_requires_verification_check");
    const owner = as(AdminRole.OWNER);
    expect(
      (
        await send(
          "patch",
          `${A}/pages/rehma-foundation`,
          { slug: "renamed" },
          owner,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await send(
          "patch",
          `${A}/pages/rehma-foundation`,
          { requiresVerification: false },
          owner,
        )
      ).status,
    ).toBe(400);
    expect((await pub(`${P}/pages/rehma-foundation`)).status).toBe(404);
    report(
      "T-GATE-7 direct SQL publish without verification and clearing the flag: rejected by CHECKs; API slug or flag change: 400",
    );
  });

  it("T-GATE-8: the Owner verifies and publishes; audited with the body hash; then 200", async () => {
    const owner = as(AdminRole.OWNER);
    const page = (await h.get(`${A}/pages/rehma-foundation`, owner)).body;
    const r = await send(
      "post",
      `${A}/pages/rehma-foundation/publish`,
      { verified: true, draftVersion: page.draftVersion },
      owner,
    );
    expect(r.status).toBe(200);
    const row = await h.db.page.findUniqueOrThrow({
      where: { slug: "rehma-foundation" },
    });
    expect(row.status).toBe("PUBLISHED");
    expect(row.verifiedByAdminId).toBe(ownerId);
    expect(row.publishedBody).toEqual(page.draftBody);
    const audit = await h.db.auditLog.findFirstOrThrow({
      where: { entityId: row.id, action: "content.page_verified_published" },
    });
    expect(audit.after).toMatchObject({
      verified: true,
      draftVersion: page.draftVersion,
      status: "PUBLISHED",
    });
    expect(JSON.stringify(audit)).not.toContain("synthetic");
    const live = await pub(`${P}/pages/rehma-foundation`);
    expect(live.status).toBe(200);
    expect(JSON.stringify(live.body)).toContain(
      "TEST changed after review, synthetic.",
    );
    // Unpublishing is the Owner's too; then it is a 404 again.
    expect(
      (
        await send(
          "post",
          `${A}/pages/rehma-foundation/unpublish`,
          undefined,
          as(AdminRole.MANAGER),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await send(
          "post",
          `${A}/pages/rehma-foundation/unpublish`,
          undefined,
          owner,
        )
      ).status,
    ).toBe(200);
    expect((await pub(`${P}/pages/rehma-foundation`)).status).toBe(404);
    report(
      "T-GATE-8 Owner verify-and-publish with the reviewed version: 200; verified_by and verified_at set; audit has the body hash, no text; public 200; Manager unpublish 403; Owner unpublish then 404",
    );
  });

  it("T-GATE-9: navigation hides links whose target is not public", async () => {
    const c = await catalogue();
    await send(
      "post",
      `${A}/pages`,
      { slug: "test-hidden", title: "TEST hidden" },
      as(AdminRole.MANAGER),
    );
    const hidden = await h.db.page.findUniqueOrThrow({
      where: { slug: "test-hidden" },
    });
    const rehma = await h.db.page.findUniqueOrThrow({
      where: { slug: "rehma-foundation" },
    });
    const put = await send(
      "put",
      `${A}/navigation/FOOTER_ABOUT`,
      {
        items: [
          {
            label: "TEST shop",
            target: { kind: "CATEGORY", id: c.category.id },
          },
          {
            label: "TEST draft category",
            target: { kind: "CATEGORY", id: c.draftCategory.id },
          },
          { label: "TEST draft page", target: { kind: "PAGE", id: hidden.id } },
          { label: "TEST rehma", target: { kind: "PAGE", id: rehma.id } },
          { label: "TEST search", target: { kind: "URL", url: "/search" } },
        ],
      },
      as(AdminRole.CATALOGUE_EDITOR),
    );
    expect(put.status).toBe(200);
    const nav = await pub(`${P}/navigation`);
    expect(
      nav.body.menus.FOOTER_ABOUT.map((i: { label: string }) => i.label),
    ).toEqual(["TEST shop", "TEST search"]);
    const admin = await h.get(
      `${A}/navigation/FOOTER_ABOUT`,
      as(AdminRole.CATALOGUE_EDITOR),
    );
    expect(admin.body.items.map((i: { hidden: boolean }) => i.hidden)).toEqual([
      false,
      true,
      true,
      true,
      false,
    ]);
    report(
      "T-GATE-9 menu of 5: draft category, draft page and unpublished Rehma page hidden publicly (marked hidden in admin); 2 public links served",
    );
  });

  it("T-GATE-10: product rows contain only products the catalogue shows", async () => {
    const c = await catalogue();
    const ids = [c.visible.id, c.draft.id, c.archived.id, c.noVariant.id];
    await send(
      "put",
      `${A}/blocks/home.row2`,
      {
        title: "TEST row",
        source: { kind: "MANUAL", productIds: ids },
        maxItems: 8,
      },
      as(AdminRole.CATALOGUE_EDITOR),
    );
    await send(
      "post",
      `${A}/blocks/home.row2/publish`,
      undefined,
      as(AdminRole.CATALOGUE_EDITOR),
    );
    const home = await pub(`${P}/home`);
    expect(home.body.row2.items.map((i: { slug: string }) => i.slug)).toEqual([
      c.visible.slug,
    ]);
    report(
      "T-GATE-10 manual row of 4 (visible, draft, archived, no active variant): only the visible product served",
    );
  });
});

describe("blocks", () => {
  it("refuses unknown keys, invalid payloads and missing targets; publish re-checks", async () => {
    const e = as(AdminRole.CATALOGUE_EDITOR);
    expect(
      (await send("put", `${A}/blocks/home.pills`, { items: [] }, e)).status,
    ).toBe(404);
    const bad = await send(
      "put",
      `${A}/blocks/site.announcement`,
      { text: "<b>x</b>" },
      e,
    );
    expect(bad.status).toBe(400);
    expect(bad.body.error.details[0]).toMatchObject({
      path: "body.text",
      code: "INVALID",
    });
    const missing = await send(
      "put",
      `${A}/blocks/site.announcement`,
      {
        text: "x",
        link: { kind: "PAGE", id: "0192f0e2-0000-7000-8000-00000000abcd" },
      },
      e,
    );
    expect(missing.status).toBe(400);
    expect(missing.body.error.details[0]).toMatchObject({
      path: "body.link",
      code: "TARGET_NOT_FOUND",
    });
    expect(
      (await send("post", `${A}/blocks/home.tabbedGrid/publish`, undefined, e))
        .status,
    ).toBe(409);
    expect(
      (await send("post", `${A}/blocks/home.tabbedGrid/discard`, undefined, e))
        .status,
    ).toBe(409);
  });

  it("publishes a hero with derivative images only, and drops slides whose target is not public", async () => {
    const c = await catalogue();
    const [img1, img2] = [await asset(), await asset()];
    const slide = (target: object) => ({
      desktopImageId: img1.id,
      mobileImageId: img2.id,
      alt: "TEST alt",
      ctaLabel: "Shop",
      ctaTarget: target,
    });
    const r = await send(
      "put",
      `${A}/blocks/home.hero`,
      {
        slides: [
          slide({ kind: "CATEGORY", id: c.category.id }),
          slide({ kind: "PRODUCT", id: c.draft.id }),
        ],
      },
      as(AdminRole.MANAGER),
    );
    expect(r.status).toBe(200);
    await send(
      "post",
      `${A}/blocks/home.hero/publish`,
      undefined,
      as(AdminRole.MANAGER),
    );
    const home = await pub(`${P}/home`);
    expect(home.body.hero.slides).toHaveLength(1);
    expect(home.body.hero.slides[0]).toMatchObject({
      href: `/categories/${c.category.slug}`,
      ctaLabel: "Shop",
    });
    expect(home.body.hero.slides[0].desktopImage.url).toMatch(/\/1440\.webp$/);
    expect(JSON.stringify(home.body)).not.toContain("master/");
  });

  it("discard restores the published version; the editorial band is never on /content/home (OD-23)", async () => {
    const e = as(AdminRole.CATALOGUE_EDITOR);
    await send(
      "put",
      `${A}/blocks/site.announcement`,
      { text: "TEST published" },
      e,
    );
    await send("post", `${A}/blocks/site.announcement/publish`, undefined, e);
    await send(
      "put",
      `${A}/blocks/site.announcement`,
      { text: "TEST draft" },
      e,
    );
    const discarded = await send(
      "post",
      `${A}/blocks/site.announcement/discard`,
      undefined,
      e,
    );
    expect(discarded.body).toMatchObject({
      draft: { text: "TEST published" },
      unpublishedChanges: false,
    });
    const img = await asset();
    await send(
      "put",
      `${A}/blocks/home.editorial`,
      { images: [{ mediaAssetId: img.id, alt: "TEST" }], heading: "TEST band" },
      e,
    );
    await send("post", `${A}/blocks/home.editorial/publish`, undefined, e);
    expect(JSON.stringify((await pub(`${P}/home`)).body)).not.toContain(
      "TEST band",
    );
  });

  it("hides announcements and slides outside their active dates", async () => {
    const e = as(AdminRole.CATALOGUE_EDITOR);
    await send(
      "put",
      `${A}/blocks/site.announcement`,
      { text: "TEST future", startsAt: "2099-01-01T00:00:00Z" },
      e,
    );
    await send("post", `${A}/blocks/site.announcement/publish`, undefined, e);
    expect((await pub(`${P}/home`)).body.announcement).toBeNull();
    await send(
      "put",
      `${A}/blocks/site.announcement`,
      {
        text: "TEST now",
        startsAt: "2020-01-01T00:00:00Z",
        endsAt: "2099-01-01T00:00:00Z",
      },
      e,
    );
    await send("post", `${A}/blocks/site.announcement/publish`, undefined, e);
    expect((await pub(`${P}/home`)).body.announcement).toMatchObject({
      text: "TEST now",
    });
  });
});

describe("pages, navigation and permissions", () => {
  it("fulfilment has no content routes; unauthenticated 401; CSRF required", async () => {
    expect((await h.get(`${A}/blocks`, as(AdminRole.FULFILMENT))).status).toBe(
      403,
    );
    expect((await h.get(`${A}/blocks`)).status).toBe(401);
    const noCsrf = await request(h.app)
      .put(`${A}/blocks/site.announcement`)
      .set("Origin", ADMIN)
      .set("Cookie", as(AdminRole.OWNER).cookie)
      .send({ text: "x" });
    expect(noCsrf.status).toBe(403);
    expect(
      (await h.get(`${A}/blocks`, as(AdminRole.CATALOGUE_EDITOR))).headers[
        "cache-control"
      ],
    ).toBe("no-store");
  });

  it("pages: empty pages cannot be published; slugs are unique; discard needs a published version; every write is audited", async () => {
    const m = as(AdminRole.MANAGER);
    expect(
      (
        await send(
          "post",
          `${A}/pages`,
          { slug: "test-empty", title: "TEST" },
          m,
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await send(
          "post",
          `${A}/pages`,
          { slug: "test-empty", title: "TEST" },
          m,
        )
      ).status,
    ).toBe(409);
    const empty = await send("post", `${A}/pages/test-empty/publish`, {}, m);
    expect(empty.status).toBe(409);
    expect(empty.body.error.details[0].code).toBe("PAGE_EMPTY");
    expect(
      (await send("post", `${A}/pages/test-empty/discard`, undefined, m))
        .status,
    ).toBe(409);
    expect(
      (await send("post", `${A}/pages`, { slug: "Bad Slug", title: "TEST" }, m))
        .status,
    ).toBe(400);
    const page = await h.db.page.findUniqueOrThrow({
      where: { slug: "test-empty" },
    });
    expect(
      await h.db.auditLog.count({
        where: { entityId: page.id, action: "content.page_created" },
      }),
    ).toBe(1);
  });

  it("page images: published as derivatives; a missing asset is refused on save", async () => {
    const m = as(AdminRole.MANAGER);
    const img = await asset();
    await send("post", `${A}/pages`, { slug: "test-images", title: "TEST" }, m);
    const missing = await send(
      "patch",
      `${A}/pages/test-images`,
      {
        draftBody: {
          type: "doc",
          content: [
            {
              type: "image",
              mediaAssetId: "0192f0e2-0000-7000-8000-00000000abcd",
              alt: "x",
            },
          ],
        },
      },
      m,
    );
    expect(missing.status).toBe(400);
    await send(
      "patch",
      `${A}/pages/test-images`,
      {
        draftBody: {
          type: "doc",
          content: [{ type: "image", mediaAssetId: img.id, alt: "TEST image" }],
        },
      },
      m,
    );
    await send("post", `${A}/pages/test-images/publish`, {}, m);
    const live = await pub(`${P}/pages/test-images`);
    expect(live.body.body.content[0]).toMatchObject({
      type: "image",
      image: { alt: "TEST image" },
    });
    expect(JSON.stringify(live.body)).not.toContain(img.id);
  });

  it("navigation: allow-listed menus only; external links refused", async () => {
    const e = as(AdminRole.CATALOGUE_EDITOR);
    expect(
      (await send("put", `${A}/navigation/SIDEBAR`, { items: [] }, e)).status,
    ).toBe(404);
    const ext = await send(
      "put",
      `${A}/navigation/HEADER`,
      {
        items: [
          { label: "x", target: { kind: "URL", url: "https://evil.example" } },
        ],
      },
      e,
    );
    expect(ext.status).toBe(400);
    expect(
      await h.db.auditLog.count({
        where: { action: "content.navigation_replaced" },
      }),
    ).toBeGreaterThan(0);
  });
});
