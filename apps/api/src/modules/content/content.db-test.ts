// Phase 10 verification (index): drafts are never served publicly; the Rehma
// Foundation page returns 404 until the Owner publishes it with verification;
// rich text cannot carry markup; publishing is audited and clears the cache.
import { AdminRole } from "@sanea/shared";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { STOREFRONT } from "../../platform/testing.ts";
import { adminHarness, type Harness, type Session } from "../auth/testing.ts";
import { invalidateContent } from "./cache.ts";

let h: Harness;
let owner: Session;
let manager: Session;
let editor: Session;
let fulfilment: Session;
const C = "/api/v1/admin/content";
const pub = (path: string) =>
  request(h.app).get(`/api/v1${path}`).set("Origin", STOREFRONT);
const body = (text: string) => ({ blocks: [{ type: "paragraph", text }] });

beforeAll(async () => {
  h = await adminHarness();
  owner = await h.signIn(await h.createAdmin(AdminRole.OWNER));
  manager = await h.signIn(await h.createAdmin(AdminRole.MANAGER));
  editor = await h.signIn(await h.createAdmin(AdminRole.CATALOGUE_EDITOR));
  fulfilment = await h.signIn(await h.createAdmin(AdminRole.FULFILMENT));
  invalidateContent();
});
afterAll(() => h.drop());

describe("blocks", () => {
  it("saves a validated draft that the storefront does not see", async () => {
    const res = await h.put(
      `${C}/blocks/home.announcement`,
      { draft: { text: "TEST announcement" } },
      editor,
    );
    expect(res.status).toBe(200);
    const home = await pub("/content/home");
    expect(home.status).toBe(200);
    expect(home.body.announcement).toBeNull();
    expect(home.headers["cache-control"]).toBe("public, max-age=60");
  });

  it("rejects invalid drafts with field paths, and unknown keys", async () => {
    const res = await h.put(
      `${C}/blocks/home.announcement`,
      { draft: { text: "x".repeat(91) } },
      editor,
    );
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe("body.draft.text");
    expect(
      (await h.put(`${C}/blocks/home.anything`, { draft: {} }, editor)).status,
    ).toBe(400);
    const html = await h.put(
      `${C}/blocks/home.announcement`,
      { draft: { text: "Hi", html: "<script>x</script>" } },
      editor,
    );
    expect(html.status).toBe(400);
  });

  it("publishes, audits and serves the published version only", async () => {
    expect(
      (await h.post(`${C}/blocks/home.announcement/publish`, {}, editor))
        .status,
    ).toBe(204);
    // A later draft does not change what shoppers see.
    await h.put(
      `${C}/blocks/home.announcement`,
      { draft: { text: "TEST newer draft" } },
      editor,
    );
    expect((await pub("/content/home")).body.announcement).toEqual({
      text: "TEST announcement",
      href: null,
    });
    const audit = await h.db.auditLog.findFirst({
      where: {
        action: "content.block_published",
        entityId: "home.announcement",
      },
    });
    expect(audit?.after).toEqual({ text: "TEST announcement" });
    const list = await h.get(`${C}/blocks`, editor);
    expect(
      list.body.blocks.find(
        (b: { key: string }) => b.key === "home.announcement",
      ).hasUnpublishedChanges,
    ).toBe(true);
  });

  it("respects the schedule", async () => {
    await h.put(
      `${C}/blocks/home.announcement`,
      { draft: { text: "TEST later", startsAt: "2099-01-01T00:00:00.000Z" } },
      editor,
    );
    await h.post(`${C}/blocks/home.announcement/publish`, {}, editor);
    expect((await pub("/content/home")).body.announcement).toBeNull();
  });

  it("unpublishes", async () => {
    await h.put(
      `${C}/blocks/home.announcement`,
      { draft: { text: "TEST again" } },
      editor,
    );
    await h.post(`${C}/blocks/home.announcement/publish`, {}, editor);
    expect((await pub("/content/home")).body.announcement).not.toBeNull();
    expect(
      (await h.post(`${C}/blocks/home.announcement/unpublish`, {}, editor))
        .status,
    ).toBe(204);
    expect((await pub("/content/home")).body.announcement).toBeNull();
  });

  it("refuses fulfilment staff", async () => {
    expect(
      (
        await h.put(
          `${C}/blocks/home.announcement`,
          { draft: { text: "x" } },
          fulfilment,
        )
      ).status,
    ).toBe(403);
    expect((await h.get(`${C}/blocks`, fulfilment)).status).toBe(403);
  });

  it("resolves hero images, drops links to hidden pages, and keeps the editorial band off", async () => {
    const png = await sharp({
      create: {
        width: 2400,
        height: 1350,
        channels: 3,
        background: { r: 200, g: 200, b: 200 },
      },
    })
      .png()
      .toBuffer();
    const asset = (await h.upload(png, "image/png", editor)).body.asset;
    const hero = {
      slides: [
        {
          desktopImageId: asset.id,
          alt: "TEST placeholder",
          campaignLine: "TEST campaign line",
          ctaLabel: "TEST",
          ctaTarget: { type: "PAGE", slug: "about" },
        },
        {
          desktopImageId: "01920000-0000-7000-8000-000000000000",
          alt: "Missing",
          campaignLine: "x",
          ctaLabel: "x",
          ctaTarget: { type: "URL", href: "/" },
        },
      ],
    };
    expect(
      (await h.put(`${C}/blocks/home.hero`, { draft: hero }, editor)).status,
    ).toBe(200);
    await h.post(`${C}/blocks/home.hero/publish`, {}, editor);
    await h.put(
      `${C}/blocks/home.editorial`,
      {
        draft: {
          heading: "TEST",
          text: "TEST",
          images: [{ imageId: asset.id, alt: "TEST" }],
        },
      },
      editor,
    );
    await h.post(`${C}/blocks/home.editorial/publish`, {}, editor);
    const home = (await pub("/content/home")).body;
    expect(home.hero).toHaveLength(1);
    expect(home.hero[0]).toMatchObject({
      alt: "TEST placeholder",
      ctaHref: null,
      focalX: 50,
    });
    expect(home.hero[0].desktop.webpSrcset).toContain("2048w");
    expect(home).not.toHaveProperty("editorial");
  });
});

describe("pages", () => {
  it("serves a page only after publishing, never the draft", async () => {
    expect(
      (
        await h.post(
          `${C}/pages`,
          { slug: "about", title: "About", body: body("TEST draft one") },
          editor,
        )
      ).status,
    ).toBe(201);
    expect((await pub("/content/pages/about")).status).toBe(404);
    await h.post(`${C}/pages/about/publish`, {}, editor);
    await h.patch(`${C}/pages/about`, { body: body("TEST draft two") }, editor);
    const res = await pub("/content/pages/about");
    expect(res.status).toBe(200);
    expect(res.body.page.body.blocks).toEqual([
      { type: "paragraph", text: "TEST draft one" },
    ]);
  });

  it("rejects HTML-like blocks and unsafe links", async () => {
    const bad = await h.patch(
      `${C}/pages/about`,
      {
        body: {
          blocks: [{ type: "link", text: "x", href: "javascript:alert(1)" }],
        },
      },
      editor,
    );
    expect(bad.status).toBe(400);
  });

  it("links to a published page now resolve on the homepage", async () => {
    invalidateContent();
    expect((await pub("/content/home")).body.hero[0].ctaHref).toBe("/about");
  });
});

describe("Rehma Foundation", () => {
  it("cannot be created or edited by a catalogue editor", async () => {
    const res = await h.post(
      `${C}/pages`,
      {
        slug: "rehma-foundation",
        title: "Rehma Foundation",
        body: body("TEST placeholder"),
      },
      editor,
    );
    expect(res.status).toBe(403);
  });

  it("is created with verification required and returns 404 while unpublished", async () => {
    const res = await h.post(
      `${C}/pages`,
      {
        slug: "rehma-foundation",
        title: "Rehma Foundation",
        body: body("TEST placeholder, to be confirmed by the Owner"),
      },
      manager,
    );
    expect(res.status).toBe(201);
    expect(res.body.page.requiresVerification).toBe(true);
    expect((await pub("/content/pages/rehma-foundation")).status).toBe(404);
  });

  it("only the Owner can publish, and only with verified: true", async () => {
    const path = `${C}/pages/rehma-foundation/publish`;
    expect((await h.post(path, { verified: true }, manager)).status).toBe(403);
    expect((await h.post(path, { verified: true }, editor)).status).toBe(403);
    const unverified = await h.post(path, {}, owner);
    expect(unverified.status).toBe(409);
    expect(unverified.body.error.details).toEqual({
      reason: "VERIFICATION_REQUIRED",
    });
    expect((await pub("/content/pages/rehma-foundation")).status).toBe(404);
    const ok = await h.post(path, { verified: true }, owner);
    expect(ok.status).toBe(200);
    expect(ok.body.page.verifiedAt).not.toBeNull();
    expect((await pub("/content/pages/rehma-foundation")).status).toBe(200);
    expect(
      await h.db.auditLog.count({
        where: { action: "page.published_verified" },
      }),
    ).toBe(1);
  });

  it("the database itself refuses an unverified published Rehma page", async () => {
    await expect(
      h.db.$executeRawUnsafe(
        `UPDATE "page" SET "verified_at" = NULL, "verified_by_admin_id" = NULL WHERE "slug" = 'rehma-foundation'`,
      ),
    ).rejects.toThrow(/page_verification_required_check/);
  });
});

describe("navigation and settings", () => {
  it("stores menus by target and drops targets that are not live", async () => {
    const res = await h.put(
      `${C}/navigation/FOOTER_HELP`,
      {
        items: [
          { label: "About", target: { type: "PAGE", slug: "about" } },
          {
            label: "Instagram",
            target: { type: "URL", href: "https://instagram.com/example" },
          },
        ],
      },
      editor,
    );
    expect(res.status).toBe(200);
    const missing = await h.put(
      `${C}/navigation/HEADER`,
      {
        items: [
          { label: "Nope", target: { type: "CATEGORY", slug: "no-such" } },
        ],
      },
      editor,
    );
    expect(missing.status).toBe(400);
    const nav = (await pub("/content/navigation")).body.menus;
    expect(nav.FOOTER_HELP).toEqual([
      { label: "About", href: "/about" },
      { label: "Instagram", href: "https://instagram.com/example" },
    ]);
  });

  it("store settings start empty and only O M can change them", async () => {
    expect((await pub("/content/settings/public")).body).toEqual({
      whatsappNumber: null,
      contactEmail: null,
      contactPhone: null,
      businessAddress: null,
    });
    expect(
      (
        await h.put(
          "/api/v1/admin/settings/store",
          { whatsappNumber: "+919876543210" },
          editor,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await h.put(
          "/api/v1/admin/settings/store",
          { whatsappNumber: "98765" },
          manager,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await h.put(
          "/api/v1/admin/settings/store",
          { whatsappNumber: "+919876543210" },
          manager,
        )
      ).status,
    ).toBe(200);
    expect((await pub("/content/settings/public")).body.whatsappNumber).toBe(
      "+919876543210",
    );
  });
});
