// /api/v1/admin/content (api-specification.md §4): typed blocks with draft
// and publish (O M C), pages with draft and publish (Rehma Foundation:
// edit O M, publish Owner only with `verified: true`), navigation menus
// (O M C) and store settings (O M). Every write is audited.
import {
  CONTENT_BLOCKS,
  CONTENT_BLOCK_KEYS,
  NAVIGATION_MENUS,
  can,
  navigationItemsSchema,
  richTextSchema,
  slugSchema,
  toFieldErrors,
  type ContentBlockKey,
  type LinkTarget,
} from "@sanea/shared";
import { Router, type Response } from "express";
import { z } from "zod";

import { Prisma } from "../../generated/prisma/client.ts";
import { adminContext } from "../../platform/http/admin-context.ts";
import { AppError } from "../../platform/http/errors.ts";
import {
  handle,
  input,
  mapDbError,
  noStore,
} from "../../platform/http/handle.ts";
import { validate } from "../../platform/http/validate.ts";
import { recordAudit } from "../audit/record.ts";
import { requirePermission } from "../auth/middleware.ts";
import {
  SETTINGS_GROUPS,
  readSettings,
  type SettingsGroup,
} from "../checkout/settings.ts";
import type { ModuleDeps } from "../deps.ts";
import { invalidateContent } from "./cache.ts";

const C = "/api/v1/admin/content";
const S = "/api/v1/admin/settings";
export const REHMA_SLUG = "rehma-foundation";
type Tx = Prisma.TransactionClient;

const keyParams = z.object({
  key: z.enum(CONTENT_BLOCK_KEYS as [ContentBlockKey, ...ContentBlockKey[]]),
});
const slugParams = z.object({ slug: slugSchema });
const menuParams = z.object({ menu: z.enum(NAVIGATION_MENUS) });
const groupParams = z.object({
  group: z.enum(Object.keys(SETTINGS_GROUPS) as [SettingsGroup]),
});

// eslint-disable-next-line no-control-regex -- rejects control characters
const ONE_LINE = /^[^\u0000-\u001f\u007f]*$/;
const pageFields = {
  title: z.string().trim().min(1).max(120).regex(ONE_LINE),
  body: richTextSchema,
  seoTitle: z.string().trim().max(70).nullable().optional(),
  seoDescription: z.string().trim().max(160).nullable().optional(),
};
const createPageBody = z.strictObject({ slug: slugSchema, ...pageFields });
const updatePageBody = z
  .strictObject(pageFields)
  .partial()
  .refine((b) => Object.keys(b).length > 0, {
    error: "Send at least one field",
  });
const publishPageBody = z.strictObject({
  verified: z.literal(true).optional(),
});

/** Blocks validate against their own schema; the body is `{ draft }`. */
const blockBody = z.strictObject({ draft: z.unknown() });

export function contentAdminRouter(deps: ModuleDeps): Router {
  const router = Router();
  router.use(C, noStore);
  router.use(S, noStore);
  const edit = requirePermission("content.edit");
  const audit = (
    tx: Tx,
    ip: string | undefined,
    res: Response,
    entry: {
      action: string;
      entityType: string;
      entityId: string;
      before?: Prisma.InputJsonValue;
      after?: Prisma.InputJsonValue;
    },
  ) =>
    recordAudit(tx, deps.config.ipHashKey, {
      ...entry,
      actorAdminId: adminContext(res)!.admin.id,
      ip,
    });

  // ── Blocks ────────────────────────────────────────────────────────────────
  router.get(
    `${C}/blocks`,
    edit,
    handle(async (_req, res) => {
      const rows = await deps.db.contentBlock.findMany();
      const byKey = new Map(rows.map((r) => [r.key, r]));
      res.json({
        blocks: CONTENT_BLOCK_KEYS.map((key) => {
          const r = byKey.get(key);
          return {
            key,
            type: CONTENT_BLOCKS[key].type,
            draft: r?.draft ?? null,
            published: r?.published ?? null,
            publishedAt: r?.publishedAt ?? null,
            hasUnpublishedChanges: r
              ? JSON.stringify(r.draft) !== JSON.stringify(r.published)
              : false,
          };
        }),
      });
    }),
  );

  router.get(
    `${C}/blocks/:key`,
    edit,
    validate({ params: keyParams }),
    handle(async (_req, res) => {
      const { params } = input<unknown, z.infer<typeof keyParams>>(res);
      const r = await deps.db.contentBlock.findUnique({
        where: { key: params.key },
      });
      res.json({
        block: {
          key: params.key,
          type: CONTENT_BLOCKS[params.key].type,
          draft: r?.draft ?? null,
          published: r?.published ?? null,
          publishedAt: r?.publishedAt ?? null,
        },
      });
    }),
  );

  router.put(
    `${C}/blocks/:key`,
    edit,
    validate({ params: keyParams, body: blockBody }),
    handle(async (req, res) => {
      const { params, body } = input<
        z.infer<typeof blockBody>,
        z.infer<typeof keyParams>
      >(res);
      const def = CONTENT_BLOCKS[params.key];
      const parsed = def.schema.safeParse(body.draft);
      if (!parsed.success)
        throw new AppError(
          "VALIDATION_FAILED",
          toFieldErrors(parsed.error).map((e) => ({
            ...e,
            path: e.path ? `body.draft.${e.path}` : "body.draft",
          })),
        );
      const value = parsed.data as Prisma.InputJsonValue;
      await deps.db.$transaction(async (tx) => {
        const before = await tx.contentBlock.findUnique({
          where: { key: params.key },
        });
        await tx.contentBlock.upsert({
          where: { key: params.key },
          create: { key: params.key, type: def.type, draft: value },
          update: { draft: value },
        });
        await audit(tx, req.ip, res, {
          action: "content.block_draft_saved",
          entityType: "content_block",
          entityId: params.key,
          before: (before?.draft ?? null) as Prisma.InputJsonValue,
          after: value,
        });
      });
      res.json({ block: { key: params.key, draft: value } });
    }),
  );

  router.post(
    `${C}/blocks/:key/publish`,
    edit,
    validate({ params: keyParams }),
    handle(async (req, res) => {
      const { params } = input<unknown, z.infer<typeof keyParams>>(res);
      const now = deps.now();
      await deps.db.$transaction(async (tx) => {
        const row = await tx.contentBlock.findUnique({
          where: { key: params.key },
        });
        if (!row) throw new AppError("NOT_FOUND");
        // Re-validate: the schema may have changed since the draft was saved.
        const parsed = CONTENT_BLOCKS[params.key].schema.safeParse(row.draft);
        if (!parsed.success)
          throw new AppError("CONFLICT", { reason: "DRAFT_INVALID" });
        await tx.contentBlock.update({
          where: { key: params.key },
          data: {
            published: row.draft as Prisma.InputJsonValue,
            publishedAt: now,
            publishedByAdminId: adminContext(res)!.admin.id,
          },
        });
        await audit(tx, req.ip, res, {
          action: "content.block_published",
          entityType: "content_block",
          entityId: params.key,
          before: (row.published ?? null) as Prisma.InputJsonValue,
          after: row.draft as Prisma.InputJsonValue,
        });
      });
      invalidateContent();
      res.status(204).end();
    }),
  );

  router.post(
    `${C}/blocks/:key/unpublish`,
    edit,
    validate({ params: keyParams }),
    handle(async (req, res) => {
      const { params } = input<unknown, z.infer<typeof keyParams>>(res);
      await deps.db.$transaction(async (tx) => {
        const row = await tx.contentBlock.findUnique({
          where: { key: params.key },
        });
        if (!row) throw new AppError("NOT_FOUND");
        await tx.contentBlock.update({
          where: { key: params.key },
          data: {
            published: Prisma.DbNull,
            publishedAt: null,
            publishedByAdminId: null,
          },
        });
        await audit(tx, req.ip, res, {
          action: "content.block_unpublished",
          entityType: "content_block",
          entityId: params.key,
        });
      });
      invalidateContent();
      res.status(204).end();
    }),
  );

  // ── Pages ─────────────────────────────────────────────────────────────────
  // Rehma Foundation content may be edited by O M only (security-design.md §4).
  const guardRehma = (res: Response, slug: string) => {
    if (
      slug === REHMA_SLUG &&
      !["OWNER", "MANAGER"].includes(adminContext(res)!.admin.role)
    )
      throw new AppError("FORBIDDEN");
  };

  router.get(
    `${C}/pages`,
    edit,
    handle(async (_req, res) => {
      const pages = await deps.db.page.findMany({
        orderBy: { slug: "asc" },
        select: {
          id: true,
          slug: true,
          title: true,
          status: true,
          requiresVerification: true,
          verifiedAt: true,
          updatedAt: true,
        },
      });
      res.json({ pages });
    }),
  );

  router.get(
    `${C}/pages/:slug`,
    edit,
    validate({ params: slugParams }),
    handle(async (_req, res) => {
      const { params } = input<unknown, z.infer<typeof slugParams>>(res);
      const page = await deps.db.page.findUnique({
        where: { slug: params.slug },
      });
      if (!page) throw new AppError("NOT_FOUND");
      res.json({ page });
    }),
  );

  router.post(
    `${C}/pages`,
    edit,
    validate({ body: createPageBody }),
    handle(async (req, res) => {
      const { body } = input<z.infer<typeof createPageBody>>(res);
      guardRehma(res, body.slug);
      const page = await deps.db
        .$transaction(async (tx) => {
          const created = await tx.page.create({
            data: {
              slug: body.slug,
              title: body.title,
              draftBody: body.body,
              seoTitle: body.seoTitle ?? null,
              seoDescription: body.seoDescription ?? null,
              requiresVerification: body.slug === REHMA_SLUG,
            },
          });
          await audit(tx, req.ip, res, {
            action: "page.created",
            entityType: "page",
            entityId: created.id,
            after: { slug: created.slug, title: created.title },
          });
          return created;
        })
        .catch(mapDbError);
      res.status(201).json({ page });
    }),
  );

  router.patch(
    `${C}/pages/:slug`,
    edit,
    validate({ params: slugParams, body: updatePageBody }),
    handle(async (req, res) => {
      const { params, body } = input<
        z.infer<typeof updatePageBody>,
        z.infer<typeof slugParams>
      >(res);
      guardRehma(res, params.slug);
      const page = await deps.db.$transaction(async (tx) => {
        const before = await tx.page.findUnique({
          where: { slug: params.slug },
        });
        if (!before) throw new AppError("NOT_FOUND");
        const { body: richBody, ...rest } = body;
        const updated = await tx.page.update({
          where: { slug: params.slug },
          data: { ...rest, ...(richBody ? { draftBody: richBody } : {}) },
        });
        await audit(tx, req.ip, res, {
          action: "page.draft_saved",
          entityType: "page",
          entityId: updated.id,
          before: { title: before.title },
          after: { title: updated.title },
        });
        return updated;
      });
      res.json({ page });
    }),
  );

  router.post(
    `${C}/pages/:slug/publish`,
    edit,
    validate({ params: slugParams, body: publishPageBody }),
    handle(async (req, res) => {
      const { params, body } = input<
        z.infer<typeof publishPageBody>,
        z.infer<typeof slugParams>
      >(res);
      const admin = adminContext(res)!.admin;
      const page = await deps.db.$transaction(async (tx) => {
        const before = await tx.page.findUnique({
          where: { slug: params.slug },
        });
        if (!before) throw new AppError("NOT_FOUND");
        const now = deps.now();
        let verification = {};
        if (before.requiresVerification) {
          // Owner only, and only with an explicit statement that the content is verified (D-010, R7).
          if (!can(admin.role, "content.publishRehma"))
            throw new AppError("FORBIDDEN");
          if (body.verified !== true)
            throw new AppError("CONFLICT", { reason: "VERIFICATION_REQUIRED" });
          verification = { verifiedByAdminId: admin.id, verifiedAt: now };
        }
        const updated = await tx.page.update({
          where: { slug: params.slug },
          data: {
            status: "PUBLISHED",
            publishedBody: before.draftBody as Prisma.InputJsonValue,
            ...verification,
          },
        });
        await audit(tx, req.ip, res, {
          action: before.requiresVerification
            ? "page.published_verified"
            : "page.published",
          entityType: "page",
          entityId: updated.id,
          before: { status: before.status },
          after: { status: "PUBLISHED", verified: before.requiresVerification },
        });
        return updated;
      });
      invalidateContent();
      res.json({ page });
    }),
  );

  router.post(
    `${C}/pages/:slug/unpublish`,
    edit,
    validate({ params: slugParams }),
    handle(async (req, res) => {
      const { params } = input<unknown, z.infer<typeof slugParams>>(res);
      guardRehma(res, params.slug);
      await deps.db.$transaction(async (tx) => {
        const before = await tx.page.findUnique({
          where: { slug: params.slug },
        });
        if (!before) throw new AppError("NOT_FOUND");
        await tx.page.update({
          where: { slug: params.slug },
          data: { status: "DRAFT" },
        });
        await audit(tx, req.ip, res, {
          action: "page.unpublished",
          entityType: "page",
          entityId: before.id,
          before: { status: before.status },
          after: { status: "DRAFT" },
        });
      });
      invalidateContent();
      res.status(204).end();
    }),
  );

  // ── Navigation ────────────────────────────────────────────────────────────
  router.get(
    `${C}/navigation/:menu`,
    edit,
    validate({ params: menuParams }),
    handle(async (_req, res) => {
      const { params } = input<unknown, z.infer<typeof menuParams>>(res);
      res.json({ items: await readMenu(deps, params.menu) });
    }),
  );

  router.put(
    `${C}/navigation/:menu`,
    edit,
    validate({ params: menuParams, body: navigationItemsSchema }),
    handle(async (req, res) => {
      const { params, body } = input<
        z.infer<typeof navigationItemsSchema>,
        z.infer<typeof menuParams>
      >(res);
      await deps.db.$transaction(async (tx) => {
        const rows = await Promise.all(
          body.items.map((item, position) =>
            toRow(tx, params.menu, item.label, item.target, position),
          ),
        );
        const before = await tx.navigationItem.findMany({
          where: { menu: params.menu },
          orderBy: { position: "asc" },
        });
        await tx.navigationItem.deleteMany({ where: { menu: params.menu } });
        await tx.navigationItem.createMany({ data: rows });
        await audit(tx, req.ip, res, {
          action: "navigation.replaced",
          entityType: "navigation_menu",
          entityId: params.menu,
          before: before.map((b) => b.label),
          after: body.items.map((i) => i.label),
        });
      });
      invalidateContent();
      res.json({ items: await readMenu(deps, params.menu) });
    }),
  );

  // ── Settings ──────────────────────────────────────────────────────────────
  // store, shipping and cod (Phase 15): Owner and Manager.
  router.get(
    `${S}/:group`,
    requirePermission("settings.store"),
    validate({ params: groupParams }),
    handle(async (_req, res) => {
      const { params } = input<unknown, { group: SettingsGroup }>(res);
      res.json({ settings: await readSettings(deps.db, params.group) });
    }),
  );

  router.put(
    `${S}/:group`,
    requirePermission("settings.store"),
    validate({ params: groupParams }),
    handle(async (req, res) => {
      const { params } = input<unknown, { group: SettingsGroup }>(res);
      const parsed = SETTINGS_GROUPS[params.group].safeParse(req.body);
      if (!parsed.success)
        throw new AppError(
          "VALIDATION_FAILED",
          toFieldErrors(parsed.error).map((e) => ({
            ...e,
            path: e.path ? `body.${e.path}` : "body",
          })),
        );
      const body = parsed.data as Prisma.InputJsonObject;
      const key = params.group;
      const admin = adminContext(res)!.admin;
      await deps.db.$transaction(async (tx) => {
        const before = await tx.storeSetting.findUnique({ where: { key } });
        await tx.storeSetting.upsert({
          where: { key },
          create: { key, value: body, updatedByAdminId: admin.id },
          update: { value: body, updatedByAdminId: admin.id },
        });
        await audit(tx, req.ip, res, {
          action: `settings.${key}_updated`,
          entityType: "store_setting",
          entityId: key,
          before: (before?.value ?? null) as Prisma.InputJsonValue,
          after: body,
        });
      });
      invalidateContent();
      res.json({ settings: body });
    }),
  );

  return router;
}

/** Stores a slug target as the database's type + id; URLs as `url`. */
async function toRow(
  tx: Tx,
  menu: string,
  label: string,
  target: LinkTarget,
  position: number,
) {
  if (target.type === "URL")
    return {
      menu,
      label,
      targetType: "URL" as const,
      url: target.href,
      targetId: null,
      position,
    };
  const where = { slug: target.slug };
  const found =
    target.type === "CATEGORY"
      ? await tx.category.findUnique({ where, select: { id: true } })
      : target.type === "COLLECTION"
        ? await tx.collection.findUnique({ where, select: { id: true } })
        : target.type === "PRODUCT"
          ? await tx.product.findUnique({ where, select: { id: true } })
          : await tx.page.findUnique({ where, select: { id: true } });
  if (!found)
    throw new AppError("VALIDATION_FAILED", [
      {
        path: "body.items",
        code: "INVALID",
        message: `Nothing found at “${target.slug}”.`,
      },
    ]);
  return {
    menu,
    label,
    targetType: target.type,
    targetId: found.id,
    url: null,
    position,
  };
}

/** Menu items with their current slugs (a renamed slug follows automatically). */
export async function readMenu(
  deps: ModuleDeps,
  menu: string,
): Promise<{ label: string; target: LinkTarget | null }[]> {
  const rows = await deps.db.navigationItem.findMany({
    where: { menu },
    orderBy: { position: "asc" },
  });
  const ids = rows.flatMap((r) => (r.targetId ? [r.targetId] : []));
  const [cats, cols, prods, pages] = await Promise.all([
    deps.db.category.findMany({
      where: { id: { in: ids } },
      select: { id: true, slug: true },
    }),
    deps.db.collection.findMany({
      where: { id: { in: ids } },
      select: { id: true, slug: true },
    }),
    deps.db.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, slug: true },
    }),
    deps.db.page.findMany({
      where: { id: { in: ids } },
      select: { id: true, slug: true },
    }),
  ]);
  const slug = new Map(
    [...cats, ...cols, ...prods, ...pages].map((x) => [x.id, x.slug]),
  );
  return rows.map((r) => {
    if (r.targetType === "URL")
      return { label: r.label, target: { type: "URL", href: r.url! } };
    const s = r.targetId ? slug.get(r.targetId) : undefined;
    return {
      label: r.label,
      target: s ? ({ type: r.targetType, slug: s } as LinkTarget) : null,
    };
  });
}
