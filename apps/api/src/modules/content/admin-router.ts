// /api/v1/admin/content (phase-10-plan.md §3.1 to §3.6, §3.8; D-093).
// Blocks: fixed registry, draft then publish, unpublish, discard. Pages: draft
// and publish; pages that need verification (the Rehma Foundation page) are
// edited by O M only and published or unpublished by the Owner only, with
// `verified: true` bound to the draft version reviewed. Navigation: allow-listed
// menus replaced whole. Every write is audited with hashes, never texts.
import { createHash } from "node:crypto";

import {
  AdminRole,
  CONTENT_BLOCKS,
  CONTENT_BLOCK_KEYS,
  NAV_MENUS,
  can,
  isContentBlockKey,
  isNavMenu,
  navMenuSchema,
  pageRichTextSchema,
  slugSchema,
  toFieldErrors,
  type NavItem,
} from "@sanea/shared";
import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { Prisma } from "../../generated/prisma/client.ts";
import { adminContext } from "../../platform/http/admin-context.ts";
import { AppError } from "../../platform/http/errors.ts";
import { validate } from "../../platform/http/validate.ts";
import { recordAudit } from "../audit/record.ts";
import type { AuthDeps } from "../auth/deps.ts";
import { requirePermission } from "../auth/middleware.ts";
import { db as guarded, handle, input, noStore } from "../catalogue/common.ts";
import { blockRefs, navRefs, pageRefs, type Ref } from "./refs.ts";
import { hrefOf, missingRefs, publicHrefs } from "./visibility.ts";

const BASE = "/api/v1/admin/content";
type Tx = Prisma.TransactionClient;

/** SHA-256 of a JSON value: the audit log records what changed, not the text. */
export const hashOf = (value: unknown) =>
  value === null || value === undefined
    ? null
    : createHash("sha256").update(JSON.stringify(value)).digest("hex");

const invalid = (error: z.ZodError, prefix = "body") =>
  new AppError(
    "VALIDATION_FAILED",
    toFieldErrors(error).map((e) => ({
      ...e,
      path: e.path ? `${prefix}.${e.path}` : prefix,
    })),
  );

const refProblems = (
  missing: { path: string; kind: string }[],
  prefix: string,
) =>
  missing.map((m) => ({
    path: `${prefix}.${m.path}`,
    code: "TARGET_NOT_FOUND",
    message: `This ${m.kind.toLowerCase().replace("_", " ")} no longer exists.`,
  }));

const pageCreate = z.strictObject({
  slug: slugSchema,
  title: z.string().trim().min(1).max(120),
  seoTitle: z.string().trim().max(70).nullable().optional(),
  seoDescription: z.string().trim().max(160).nullable().optional(),
});
// Slugs and `requiresVerification` are never editable (phase-10-plan.md §3.4).
const pageUpdate = z
  .strictObject({
    title: z.string().trim().min(1).max(120).optional(),
    draftBody: pageRichTextSchema.optional(),
    seoTitle: z.string().trim().max(70).nullable().optional(),
    seoDescription: z.string().trim().max(160).nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, {
    error: "Send at least one field",
  });
const slugParams = z.strictObject({ slug: slugSchema });
const verifiedPublish = z.strictObject({
  verified: z.literal(true),
  draftVersion: z.iso.datetime({ offset: true }),
});

export function contentAdminRouter(deps: AuthDeps): Router {
  const router = Router();
  router.use(BASE, noStore, requirePermission("content.edit"));
  const actor = (res: Response) => adminContext(res)!.admin;
  const tx = <T>(fn: (t: Tx) => Promise<T>) =>
    guarded(() => deps.db.$transaction(fn));
  const audit = (
    t: Tx,
    req: Request,
    res: Response,
    action: string,
    entityType: string,
    entityId: string | null,
    before?: object,
    after?: object,
  ) =>
    recordAudit(t, deps.config.ipHashKey, {
      actorAdminId: actor(res).id,
      action,
      entityType,
      entityId,
      ...(before ? { before: before as Prisma.InputJsonValue } : {}),
      ...(after ? { after: after as Prisma.InputJsonValue } : {}),
      ip: req.ip,
    });
  const keyParam = (req: Request) => {
    const key = String(req.params.key);
    if (!isContentBlockKey(key)) throw new AppError("NOT_FOUND");
    return key;
  };
  const view = (
    key: string,
    row: {
      draft: unknown;
      published: unknown;
      publishedAt: Date | null;
      updatedAt: Date;
    } | null,
  ) => ({
    key,
    type: CONTENT_BLOCKS[key as keyof typeof CONTENT_BLOCKS].type,
    draft: row?.draft ?? null,
    published: row?.published ?? null,
    publishedAt: row?.publishedAt ?? null,
    updatedAt: row?.updatedAt ?? null,
    unpublishedChanges: row
      ? hashOf(row.draft) !== hashOf(row.published)
      : false,
  });
  const checkRefs = async (
    refs: Ref[],
    status: "VALIDATION_FAILED" | "CONFLICT",
    prefix: string,
  ) => {
    const missing = await missingRefs(deps.db, refs);
    if (missing.length)
      throw new AppError(status, refProblems(missing, prefix));
  };

  // ── Blocks (Q10-1, Q10-2, Q10-5) ────────────────────────────────────────
  router.get(
    `${BASE}/blocks`,
    handle(async (_req, res) => {
      const rows = await deps.db.contentBlock.findMany({
        where: { key: { in: CONTENT_BLOCK_KEYS } },
      });
      res.json({
        items: CONTENT_BLOCK_KEYS.map((k) =>
          view(k, rows.find((r) => r.key === k) ?? null),
        ),
      });
    }),
  );

  router.get(
    `${BASE}/blocks/:key`,
    handle(async (req, res) => {
      const key = keyParam(req);
      res.json(
        view(key, await deps.db.contentBlock.findUnique({ where: { key } })),
      );
    }),
  );

  router.put(
    `${BASE}/blocks/:key`,
    handle(async (req, res) => {
      const key = keyParam(req);
      const parsed = CONTENT_BLOCKS[key].schema.safeParse(req.body);
      if (!parsed.success) throw invalid(parsed.error);
      await checkRefs(
        blockRefs(key, parsed.data as Record<string, unknown>),
        "VALIDATION_FAILED",
        "body",
      );
      const row = await tx(async (t) => {
        const before = await t.contentBlock.findUnique({ where: { key } });
        const saved = await t.contentBlock.upsert({
          where: { key },
          create: {
            key,
            type: CONTENT_BLOCKS[key].type,
            draft: parsed.data as Prisma.InputJsonValue,
          },
          update: { draft: parsed.data as Prisma.InputJsonValue },
        });
        await audit(
          t,
          req,
          res,
          "content.block_saved",
          "content_block",
          saved.id,
          { draft: hashOf(before?.draft) },
          { draft: hashOf(saved.draft) },
        );
        return saved;
      });
      res.json(view(key, row));
    }),
  );

  router.post(
    `${BASE}/blocks/:key/publish`,
    handle(async (req, res) => {
      const key = keyParam(req);
      const row = await tx(async (t) => {
        const current = await t.contentBlock.findUnique({ where: { key } });
        if (!current)
          throw new AppError("CONFLICT", [
            {
              path: "",
              code: "NOTHING_TO_PUBLISH",
              message: "Save a draft first.",
            },
          ]);
        // The draft is validated again: rules or targets may have changed.
        const parsed = CONTENT_BLOCKS[key].schema.safeParse(current.draft);
        if (!parsed.success) throw invalid(parsed.error, "draft");
        await checkRefs(
          blockRefs(key, parsed.data as Record<string, unknown>),
          "CONFLICT",
          "draft",
        );
        const saved = await t.contentBlock.update({
          where: { key },
          data: {
            published: current.draft as Prisma.InputJsonValue,
            publishedAt: new Date(),
            publishedByAdminId: actor(res).id,
          },
        });
        await audit(
          t,
          req,
          res,
          "content.block_published",
          "content_block",
          saved.id,
          { published: hashOf(current.published) },
          { published: hashOf(saved.published) },
        );
        return saved;
      });
      res.json(view(key, row));
    }),
  );

  router.post(
    `${BASE}/blocks/:key/unpublish`,
    handle(async (req, res) => {
      const key = keyParam(req);
      const row = await tx(async (t) => {
        const current = await t.contentBlock.findUnique({ where: { key } });
        if (!current) throw new AppError("NOT_FOUND");
        const saved = await t.contentBlock.update({
          where: { key },
          data: {
            published: Prisma.DbNull,
            publishedAt: null,
            publishedByAdminId: null,
          },
        });
        await audit(
          t,
          req,
          res,
          "content.block_unpublished",
          "content_block",
          saved.id,
          { published: hashOf(current.published) },
          { published: null },
        );
        return saved;
      });
      res.json(view(key, row));
    }),
  );

  router.post(
    `${BASE}/blocks/:key/discard`,
    handle(async (req, res) => {
      const key = keyParam(req);
      const row = await tx(async (t) => {
        const current = await t.contentBlock.findUnique({ where: { key } });
        if (!current?.published)
          throw new AppError("CONFLICT", [
            {
              path: "",
              code: "NOTHING_PUBLISHED",
              message: "There is no published version to go back to.",
            },
          ]);
        const saved = await t.contentBlock.update({
          where: { key },
          data: { draft: current.published as Prisma.InputJsonValue },
        });
        await audit(
          t,
          req,
          res,
          "content.block_discarded",
          "content_block",
          saved.id,
          { draft: hashOf(current.draft) },
          { draft: hashOf(saved.draft) },
        );
        return saved;
      });
      res.json(view(key, row));
    }),
  );

  // ── Pages (Q10-5 to Q10-8) ───────────────────────────────────────────────
  const pageView = (p: {
    id: string;
    slug: string;
    title: string;
    draftBody: unknown;
    publishedBody: unknown;
    status: string;
    requiresVerification: boolean;
    verifiedAt: Date | null;
    seoTitle: string | null;
    seoDescription: string | null;
    updatedAt: Date;
  }) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    draftBody: p.draftBody,
    publishedBody: p.publishedBody,
    status: p.status,
    requiresVerification: p.requiresVerification,
    verifiedAt: p.verifiedAt,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    // The version the Owner reviews before verifying (Q10-8).
    draftVersion: p.updatedAt.toISOString(),
    unpublishedChanges: hashOf(p.draftBody) !== hashOf(p.publishedBody),
  });
  /** Pages that need verification: O M edit; publishing is the Owner's. */
  const canEditPage = (res: Response, p: { requiresVerification: boolean }) =>
    !p.requiresVerification ||
    [AdminRole.OWNER, AdminRole.MANAGER].includes(actor(res).role as never);
  const loadPage = async (
    t: Tx | AuthDeps["db"],
    slug: string,
    lock = false,
  ) => {
    if (lock)
      await (t as Tx)
        .$queryRaw`SELECT 1 FROM "page" WHERE "slug" = ${slug} FOR UPDATE`;
    const p = await t.page.findUnique({ where: { slug } });
    if (!p) throw new AppError("NOT_FOUND");
    return p;
  };

  router.get(
    `${BASE}/pages`,
    handle(async (_req, res) => {
      const rows = await deps.db.page.findMany({ orderBy: { title: "asc" } });
      res.json({
        items: rows.map((p) => ({
          ...pageView(p),
          draftBody: undefined,
          publishedBody: undefined,
        })),
      });
    }),
  );

  router.post(
    `${BASE}/pages`,
    validate({ body: pageCreate }),
    handle(async (req, res) => {
      const { body } = input<z.infer<typeof pageCreate>>(res);
      const page = await tx(async (t) => {
        const created = await t.page.create({
          data: {
            slug: body.slug,
            title: body.title,
            draftBody: { type: "doc", content: [] },
            seoTitle: body.seoTitle ?? null,
            seoDescription: body.seoDescription ?? null,
            requiresVerification: body.slug === "rehma-foundation",
          },
        });
        await audit(
          t,
          req,
          res,
          "content.page_created",
          "page",
          created.id,
          undefined,
          { slug: created.slug },
        );
        return created;
      });
      res.status(201).json(pageView(page));
    }),
  );

  router.get(
    `${BASE}/pages/:slug`,
    validate({ params: slugParams }),
    handle(async (_req, res) => {
      const { params } = input<unknown, z.infer<typeof slugParams>>(res);
      res.json(pageView(await loadPage(deps.db, params.slug)));
    }),
  );

  router.patch(
    `${BASE}/pages/:slug`,
    validate({ params: slugParams, body: pageUpdate }),
    handle(async (req, res) => {
      const { body, params } = input<
        z.infer<typeof pageUpdate>,
        z.infer<typeof slugParams>
      >(res);
      if (body.draftBody)
        await checkRefs(
          pageRefs(body.draftBody as never),
          "VALIDATION_FAILED",
          "body",
        );
      const page = await tx(async (t) => {
        const before = await loadPage(t, params.slug, true);
        if (!canEditPage(res, before)) throw new AppError("FORBIDDEN");
        const saved = await t.page.update({
          where: { id: before.id },
          data: {
            ...(body.title !== undefined ? { title: body.title } : {}),
            ...(body.draftBody !== undefined
              ? { draftBody: body.draftBody as Prisma.InputJsonValue }
              : {}),
            ...(body.seoTitle !== undefined ? { seoTitle: body.seoTitle } : {}),
            ...(body.seoDescription !== undefined
              ? { seoDescription: body.seoDescription }
              : {}),
          },
        });
        await audit(
          t,
          req,
          res,
          "content.page_saved",
          "page",
          saved.id,
          { draftBody: hashOf(before.draftBody) },
          { draftBody: hashOf(saved.draftBody) },
        );
        return saved;
      });
      res.json(pageView(page));
    }),
  );

  router.post(
    `${BASE}/pages/:slug/publish`,
    validate({ params: slugParams }),
    handle(async (req, res) => {
      const { params } = input<unknown, z.infer<typeof slugParams>>(res);
      const page = await tx(async (t) => {
        const p = await loadPage(t, params.slug, true);
        let verification: z.infer<typeof verifiedPublish> | null = null;
        if (p.requiresVerification) {
          // The Owner only, confirming the exact draft reviewed (D-010, Q10-8).
          if (!can(actor(res).role, "content.publishRehma"))
            throw new AppError("FORBIDDEN");
          const parsed = verifiedPublish.safeParse(req.body ?? {});
          if (!parsed.success) throw invalid(parsed.error);
          verification = parsed.data;
          if (
            new Date(verification.draftVersion).getTime() !==
            p.updatedAt.getTime()
          )
            throw new AppError("CONFLICT", [
              {
                path: "body.draftVersion",
                code: "DRAFT_CHANGED",
                message:
                  "The draft changed after you reviewed it. Review it again before verifying.",
              },
            ]);
        } else if (req.body && Object.keys(req.body as object).length > 0) {
          throw new AppError("VALIDATION_FAILED", [
            {
              path: "body",
              code: "UNKNOWN_FIELD",
              message: "This page takes no options when publishing.",
            },
          ]);
        }
        const body = pageRichTextSchema.safeParse(p.draftBody);
        if (!body.success) throw invalid(body.error, "draftBody");
        if (body.data.content.length === 0)
          throw new AppError("CONFLICT", [
            {
              path: "draftBody",
              code: "PAGE_EMPTY",
              message: "Add some content before publishing.",
            },
          ]);
        await checkRefs(pageRefs(body.data as never), "CONFLICT", "page");
        const now = new Date();
        const saved = await t.page.update({
          where: { id: p.id },
          data: {
            publishedBody: p.draftBody as Prisma.InputJsonValue,
            status: "PUBLISHED",
            ...(verification
              ? { verifiedByAdminId: actor(res).id, verifiedAt: now }
              : {}),
          },
        });
        await audit(
          t,
          req,
          res,
          verification
            ? "content.page_verified_published"
            : "content.page_published",
          "page",
          saved.id,
          { status: p.status, publishedBody: hashOf(p.publishedBody) },
          {
            status: saved.status,
            publishedBody: hashOf(saved.publishedBody),
            ...(verification
              ? { verified: true, draftVersion: verification.draftVersion }
              : {}),
          },
        );
        return saved;
      });
      res.json(pageView(page));
    }),
  );

  router.post(
    `${BASE}/pages/:slug/unpublish`,
    validate({ params: slugParams }),
    handle(async (req, res) => {
      const { params } = input<unknown, z.infer<typeof slugParams>>(res);
      const page = await tx(async (t) => {
        const p = await loadPage(t, params.slug, true);
        if (
          p.requiresVerification &&
          !can(actor(res).role, "content.publishRehma")
        )
          throw new AppError("FORBIDDEN");
        const saved = await t.page.update({
          where: { id: p.id },
          data: { status: "ARCHIVED" },
        });
        await audit(
          t,
          req,
          res,
          "content.page_unpublished",
          "page",
          saved.id,
          { status: p.status },
          { status: saved.status },
        );
        return saved;
      });
      res.json(pageView(page));
    }),
  );

  router.post(
    `${BASE}/pages/:slug/discard`,
    validate({ params: slugParams }),
    handle(async (req, res) => {
      const { params } = input<unknown, z.infer<typeof slugParams>>(res);
      const page = await tx(async (t) => {
        const p = await loadPage(t, params.slug, true);
        if (!canEditPage(res, p)) throw new AppError("FORBIDDEN");
        if (!p.publishedBody)
          throw new AppError("CONFLICT", [
            {
              path: "",
              code: "NOTHING_PUBLISHED",
              message: "There is no published version to go back to.",
            },
          ]);
        const saved = await t.page.update({
          where: { id: p.id },
          data: { draftBody: p.publishedBody as Prisma.InputJsonValue },
        });
        await audit(
          t,
          req,
          res,
          "content.page_discarded",
          "page",
          saved.id,
          { draftBody: hashOf(p.draftBody) },
          { draftBody: hashOf(saved.draftBody) },
        );
        return saved;
      });
      res.json(pageView(page));
    }),
  );

  // ── Navigation (Q10-3) ───────────────────────────────────────────────────
  const menuParam = (req: Request) => {
    const menu = String(req.params.menu);
    if (!isNavMenu(menu)) throw new AppError("NOT_FOUND");
    return menu;
  };
  const toItem = (r: {
    label: string;
    targetType: string;
    targetId: string | null;
    url: string | null;
  }): NavItem =>
    ({
      label: r.label,
      target:
        r.targetType === "URL"
          ? { kind: "URL", url: r.url! }
          : { kind: r.targetType, id: r.targetId! },
    }) as NavItem;

  router.get(
    `${BASE}/navigation/:menu`,
    handle(async (req, res) => {
      const menu = menuParam(req);
      const rows = await deps.db.navigationItem.findMany({
        where: { menu },
        orderBy: { position: "asc" },
      });
      const items = rows.map(toItem);
      const hrefs = await publicHrefs(
        deps.db,
        items.map((i) => i.target),
        new Date(),
      );
      res.json({
        menu,
        maxItems: NAV_MENUS[menu],
        items: items.map((i) => ({
          ...i,
          href: hrefOf(hrefs, i.target),
          hidden: hrefOf(hrefs, i.target) === null,
        })),
      });
    }),
  );

  router.put(
    `${BASE}/navigation/:menu`,
    handle(async (req, res) => {
      const menu = menuParam(req);
      const parsed = navMenuSchema(menu).safeParse(req.body);
      if (!parsed.success) throw invalid(parsed.error);
      await checkRefs(navRefs(parsed.data.items), "VALIDATION_FAILED", "body");
      await tx(async (t) => {
        const before = await t.navigationItem.findMany({
          where: { menu },
          orderBy: { position: "asc" },
        });
        await t.navigationItem.deleteMany({ where: { menu } });
        await t.navigationItem.createMany({
          data: parsed.data.items.map((item, position) => ({
            menu,
            label: item.label,
            position,
            targetType: item.target.kind,
            targetId: item.target.kind === "URL" ? null : item.target.id,
            url: item.target.kind === "URL" ? item.target.url : null,
          })),
        });
        await audit(
          t,
          req,
          res,
          "content.navigation_replaced",
          "navigation_menu",
          null,
          { items: hashOf(before.map(toItem)) },
          { menu, items: hashOf(parsed.data.items) },
        );
      });
      res.json({ menu, items: parsed.data.items });
    }),
  );

  return router;
}
