// /api/v1/admin catalogue routes (api-specification.md §4, phase-8-plan.md
// §5.2): categories, collections and their product order, colours, size
// charts, products, variants, images, publish and archive. The permission
// table is the authority (security-design.md §4); every write is audited
// with before and after values (no secrets or personal data).
import type { Request, RequestHandler, Response } from "express";
import { Router } from "express";
import type { z } from "zod";

import { EMPTY_RICH_TEXT } from "@sanea/shared";

import type { Prisma } from "../../generated/prisma/client.ts";
import { adminContext } from "../../platform/http/admin-context.ts";
import { AppError } from "../../platform/http/errors.ts";
import { validate } from "../../platform/http/validate.ts";
import { recordAudit } from "../audit/record.ts";
import type { AuthDeps } from "../auth/deps.ts";
import { requirePermission } from "../auth/middleware.ts";
import { can } from "../auth/permissions.ts";
import type { MediaStorage } from "../media/storage.ts";
import { db as guarded, handle, imageView, input, noStore } from "./common.ts";
import { publishProblems, publishedAtFor, slugLocked } from "./publishing.ts";
import * as s from "./schemas.ts";

export const ADMIN = "/api/v1/admin";
type Tx = Prisma.TransactionClient;

export function catalogueAdminRouter(
  deps: AuthDeps,
  storage: MediaStorage,
): Router {
  const router = Router();
  for (const path of [
    "categories",
    "collections",
    "colours",
    "size-charts",
    "products",
  ])
    router.use(`${ADMIN}/${path}`, noStore);

  const view = requirePermission("products.view");
  const edit = requirePermission("products.editContent");
  const prices = requirePermission("products.editPrices");
  const publish = requirePermission("products.publish");

  const actor = (res: Response) => adminContext(res)!.admin.id;
  const audit = (
    tx: Tx,
    req: Request,
    res: Response,
    action: string,
    entityType: string,
    entityId: string,
    before?: unknown,
    after?: unknown,
  ) =>
    recordAudit(tx, deps.config.ipHashKey, {
      actorAdminId: actor(res),
      action,
      entityType,
      entityId,
      ...(before === undefined ? {} : { before: json(before) }),
      ...(after === undefined ? {} : { after: json(after) }),
      ip: req.ip,
    });
  const tx = <T>(fn: (t: Tx) => Promise<T>) =>
    guarded(() => deps.db.$transaction(fn));

  // ── Categories ──────────────────────────────────────────────────────────
  router.get(
    `${ADMIN}/categories`,
    edit, // api-specification.md §4: O M C
    handle(async (_req, res) => {
      res.json({
        items: await deps.db.category.findMany({
          orderBy: [{ position: "asc" }, { name: "asc" }],
        }),
      });
    }),
  );

  router.post(
    `${ADMIN}/categories`,
    edit,
    validate({ body: s.categoryCreate }),
    handle(async (req, res) => {
      const { body } = input<z.infer<typeof s.categoryCreate>>(res);
      const created = await tx(async (t) => {
        if (body.parentId)
          await assertExists(
            t.category.findUnique({ where: { id: body.parentId } }),
          );
        const row = await t.category.create({ data: clean(body) });
        await audit(
          t,
          req,
          res,
          "category.created",
          "category",
          row.id,
          undefined,
          row,
        );
        return row;
      });
      res.status(201).json(created);
    }),
  );

  router.patch(
    `${ADMIN}/categories/:id`,
    edit,
    validate({ params: s.idParams, body: s.categoryUpdate }),
    handle(async (req, res) => {
      const { body, params } = input<
        z.infer<typeof s.categoryUpdate>,
        z.infer<typeof s.idParams>
      >(res);
      const updated = await tx(async (t) => {
        const before = await assertExists(
          t.category.findUnique({ where: { id: params.id } }),
        );
        if (body.parentId) await assertNoCycle(t, params.id, body.parentId);
        const row = await t.category.update({
          where: { id: params.id },
          data: clean(body),
        });
        await audit(
          t,
          req,
          res,
          "category.updated",
          "category",
          row.id,
          pick(before, body),
          pick(row, body),
        );
        return row;
      });
      res.json(updated);
    }),
  );

  router.delete(
    `${ADMIN}/categories/:id`,
    edit,
    validate({ params: s.idParams }),
    handle(async (req, res) => {
      const { params } = input<unknown, z.infer<typeof s.idParams>>(res);
      await tx(async (t) => {
        const before = await assertExists(
          t.category.findUnique({ where: { id: params.id } }),
        );
        const [products, children] = await Promise.all([
          t.product.count({ where: { categoryId: params.id } }),
          t.category.count({ where: { parentId: params.id } }),
        ]);
        // Archive instead; a category in use cannot be deleted (phase-8-plan.md §5.2).
        if (products > 0 || children > 0) throw new AppError("CONFLICT");
        await t.category.delete({ where: { id: params.id } });
        await audit(
          t,
          req,
          res,
          "category.deleted",
          "category",
          params.id,
          before,
        );
      });
      res.status(204).end();
    }),
  );

  // ── Collections ─────────────────────────────────────────────────────────
  router.get(
    `${ADMIN}/collections`,
    edit, // api-specification.md §4: O M C
    handle(async (_req, res) => {
      const items = await deps.db.collection.findMany({
        orderBy: { name: "asc" },
        include: { _count: { select: { products: true } } },
      });
      res.json({
        items: items.map(({ _count, ...c }) => ({
          ...c,
          productCount: _count.products,
        })),
      });
    }),
  );

  router.get(
    `${ADMIN}/collections/:id`,
    edit, // api-specification.md §4: O M C
    validate({ params: s.idParams }),
    handle(async (_req, res) => {
      const { params } = input<unknown, z.infer<typeof s.idParams>>(res);
      const c = await assertExists(
        deps.db.collection.findUnique({
          where: { id: params.id },
          include: {
            products: {
              orderBy: { position: "asc" },
              select: { productId: true, position: true },
            },
          },
        }),
      );
      res.json(c);
    }),
  );

  router.post(
    `${ADMIN}/collections`,
    edit,
    validate({ body: s.collectionCreate }),
    handle(async (req, res) => {
      const { body } = input<z.infer<typeof s.collectionCreate>>(res);
      const created = await tx(async (t) => {
        const row = await t.collection.create({ data: dates(clean(body)) });
        await audit(
          t,
          req,
          res,
          "collection.created",
          "collection",
          row.id,
          undefined,
          row,
        );
        return row;
      });
      res.status(201).json(created);
    }),
  );

  router.patch(
    `${ADMIN}/collections/:id`,
    edit,
    validate({ params: s.idParams, body: s.collectionUpdate }),
    handle(async (req, res) => {
      const { body, params } = input<
        z.infer<typeof s.collectionUpdate>,
        z.infer<typeof s.idParams>
      >(res);
      const updated = await tx(async (t) => {
        const before = await assertExists(
          t.collection.findUnique({ where: { id: params.id } }),
        );
        const row = await t.collection.update({
          where: { id: params.id },
          data: dates(clean(body)),
        });
        await audit(
          t,
          req,
          res,
          "collection.updated",
          "collection",
          row.id,
          pick(before, body),
          pick(row, body),
        );
        return row;
      });
      res.json(updated);
    }),
  );

  router.delete(
    `${ADMIN}/collections/:id`,
    edit,
    validate({ params: s.idParams }),
    handle(async (req, res) => {
      const { params } = input<unknown, z.infer<typeof s.idParams>>(res);
      await tx(async (t) => {
        const before = await assertExists(
          t.collection.findUnique({ where: { id: params.id } }),
        );
        await t.collection.delete({ where: { id: params.id } });
        await audit(
          t,
          req,
          res,
          "collection.deleted",
          "collection",
          params.id,
          before,
        );
      });
      res.status(204).end();
    }),
  );

  router.put(
    `${ADMIN}/collections/:id/products`,
    edit,
    validate({ params: s.idParams, body: s.collectionProducts }),
    handle(async (req, res) => {
      const { body, params } = input<
        z.infer<typeof s.collectionProducts>,
        z.infer<typeof s.idParams>
      >(res);
      await tx(async (t) => {
        await assertExists(
          t.collection.findUnique({ where: { id: params.id } }),
        );
        const found = await t.product.count({
          where: { id: { in: body.productIds } },
        });
        if (found !== body.productIds.length) throw new AppError("NOT_FOUND");
        const before = await t.collectionProduct.findMany({
          where: { collectionId: params.id },
          orderBy: { position: "asc" },
          select: { productId: true },
        });
        await t.collectionProduct.deleteMany({
          where: { collectionId: params.id },
        });
        await t.collectionProduct.createMany({
          data: body.productIds.map((productId, position) => ({
            collectionId: params.id,
            productId,
            position,
          })),
        });
        await audit(
          t,
          req,
          res,
          "collection.products_set",
          "collection",
          params.id,
          { productIds: before.map((b) => b.productId) },
          { productIds: body.productIds },
        );
      });
      res.status(204).end();
    }),
  );

  // ── Colours and size charts (Q8-3) ──────────────────────────────────────
  router.get(
    `${ADMIN}/colours`,
    edit, // api-specification.md §4: O M C
    handle(async (_req, res) => {
      res.json({
        items: await deps.db.colour.findMany({
          orderBy: [{ position: "asc" }, { name: "asc" }],
        }),
      });
    }),
  );
  router.post(
    `${ADMIN}/colours`,
    edit,
    validate({ body: s.colourCreate }),
    handle(async (req, res) => {
      const { body } = input<z.infer<typeof s.colourCreate>>(res);
      const created = await tx(async (t) => {
        const row = await t.colour.create({ data: clean(body) });
        await audit(
          t,
          req,
          res,
          "colour.created",
          "colour",
          row.id,
          undefined,
          row,
        );
        return row;
      });
      res.status(201).json(created);
    }),
  );
  router.patch(
    `${ADMIN}/colours/:id`,
    edit,
    validate({ params: s.idParams, body: s.colourUpdate }),
    handle(async (req, res) => {
      const { body, params } = input<
        z.infer<typeof s.colourUpdate>,
        z.infer<typeof s.idParams>
      >(res);
      const updated = await tx(async (t) => {
        const before = await assertExists(
          t.colour.findUnique({ where: { id: params.id } }),
        );
        const row = await t.colour.update({
          where: { id: params.id },
          data: clean(body),
        });
        await audit(
          t,
          req,
          res,
          "colour.updated",
          "colour",
          row.id,
          pick(before, body),
          pick(row, body),
        );
        return row;
      });
      res.json(updated);
    }),
  );

  router.get(
    `${ADMIN}/size-charts`,
    edit, // api-specification.md §4: O M C
    handle(async (_req, res) => {
      res.json({
        items: await deps.db.sizeChart.findMany({ orderBy: { name: "asc" } }),
      });
    }),
  );
  router.post(
    `${ADMIN}/size-charts`,
    edit,
    validate({ body: s.sizeChartCreate }),
    handle(async (req, res) => {
      const { body } = input<z.infer<typeof s.sizeChartCreate>>(res);
      const created = await tx(async (t) => {
        const row = await t.sizeChart.create({ data: body });
        await audit(
          t,
          req,
          res,
          "size_chart.created",
          "size_chart",
          row.id,
          undefined,
          row,
        );
        return row;
      });
      res.status(201).json(created);
    }),
  );
  router.patch(
    `${ADMIN}/size-charts/:id`,
    edit,
    validate({ params: s.idParams, body: s.sizeChartUpdate }),
    handle(async (req, res) => {
      const { body, params } = input<
        z.infer<typeof s.sizeChartUpdate>,
        z.infer<typeof s.idParams>
      >(res);
      const updated = await tx(async (t) => {
        const before = await assertExists(
          t.sizeChart.findUnique({ where: { id: params.id } }),
        );
        const row = await t.sizeChart.update({
          where: { id: params.id },
          data: clean(body),
        });
        await audit(
          t,
          req,
          res,
          "size_chart.updated",
          "size_chart",
          row.id,
          pick(before, body),
          pick(row, body),
        );
        return row;
      });
      res.json(updated);
    }),
  );

  // ── Products ────────────────────────────────────────────────────────────
  router.get(
    `${ADMIN}/products`,
    view,
    validate({ query: s.adminProductQuery }),
    handle(async (_req, res) => {
      const { query } = input<
        unknown,
        unknown,
        z.infer<typeof s.adminProductQuery>
      >(res);
      const rows = await deps.db.product.findMany({
        where: {
          ...(query.status ? { status: query.status } : {}),
          ...(query.categoryId ? { categoryId: query.categoryId } : {}),
          ...(query.cursor ? { id: { lt: query.cursor } } : {}),
        },
        orderBy: { id: "desc" },
        take: query.limit + 1,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          publishedAt: true,
          categoryId: true,
          labels: true,
          updatedAt: true,
          _count: { select: { variants: true, images: true } },
        },
      });
      const page = rows.slice(0, query.limit);
      res.json({
        items: page.map(({ _count, ...p }) => ({
          ...p,
          variantCount: _count.variants,
          imageCount: _count.images,
        })),
        nextCursor:
          rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
      });
    }),
  );

  router.get(
    `${ADMIN}/products/:id`,
    view,
    validate({ params: s.idParams }),
    handle(async (_req, res) => {
      const { params } = input<unknown, z.infer<typeof s.idParams>>(res);
      const p = await assertExists(
        // The search column is Unsupported("tsvector"): Prisma never returns it.
        deps.db.product.findUnique({
          where: { id: params.id },
          include: {
            variants: { orderBy: { sku: "asc" }, include: { inventory: true } },
            images: {
              orderBy: { position: "asc" },
              include: { mediaAsset: true },
            },
            collections: { select: { collectionId: true, position: true } },
          },
        }),
      );
      const { images, ...rest } = p;
      res.json({
        ...rest,
        images: images.map((i) => ({
          id: i.id,
          mediaAssetId: i.mediaAssetId,
          ...imageView(i, storage),
        })),
      });
    }),
  );

  router.post(
    `${ADMIN}/products`,
    edit,
    validate({ body: s.productCreate }),
    handle(async (req, res) => {
      const { body } = input<z.infer<typeof s.productCreate>>(res);
      const created = await tx(async (t) => {
        const row = await t.product.create({
          data: {
            ...clean(body),
            description: body.description ?? EMPTY_RICH_TEXT,
          },
          select: productSelect,
        });
        await audit(
          t,
          req,
          res,
          "product.created",
          "product",
          row.id,
          undefined,
          row,
        );
        return row;
      });
      res.status(201).json(created);
    }),
  );

  router.patch(
    `${ADMIN}/products/:id`,
    edit,
    validate({ params: s.idParams, body: s.productUpdate }),
    handle(async (req, res) => {
      const { body, params } = input<
        z.infer<typeof s.productUpdate>,
        z.infer<typeof s.idParams>
      >(res);
      const updated = await tx(async (t) => {
        const before = await assertExists(
          t.product.findUnique({
            where: { id: params.id },
            select: productSelect,
          }),
        );
        if (
          body.slug !== undefined &&
          body.slug !== before.slug &&
          slugLocked(before.publishedAt)
        )
          throw new AppError("CONFLICT", [
            {
              path: "body.slug",
              code: "INVALID",
              message:
                "The slug cannot change after the product was first published.",
            },
          ]);
        const row = await t.product.update({
          where: { id: params.id },
          data: clean(body),
          select: productSelect,
        });
        await audit(
          t,
          req,
          res,
          "product.updated",
          "product",
          row.id,
          pick(before, body),
          pick(row, body),
        );
        return row;
      });
      res.json(updated);
    }),
  );

  router.post(
    `${ADMIN}/products/:id/publish`,
    publish,
    validate({ params: s.idParams }),
    handle(async (req, res) => {
      const { params } = input<unknown, z.infer<typeof s.idParams>>(res);
      const updated = await tx(async (t) => {
        const p = await assertExists(
          t.product.findUnique({
            where: { id: params.id },
            select: {
              ...productSelect,
              category: { select: { status: true } },
            },
          }),
        );
        const [activeVariants, primaryImages] = await Promise.all([
          t.productVariant.count({
            where: { productId: p.id, isActive: true },
          }),
          t.productImage.count({ where: { productId: p.id, role: "PRIMARY" } }),
        ]);
        const problems = publishProblems({
          categoryStatus: p.category.status,
          activeVariants,
          primaryImages,
        });
        if (problems.length > 0)
          throw new AppError(
            "CONFLICT",
            problems.map((code) => ({
              path: "",
              code,
              message: PROBLEM_TEXT[code],
            })),
          );
        const row = await t.product.update({
          where: { id: p.id },
          data: {
            status: "PUBLISHED",
            publishedAt: publishedAtFor(p.publishedAt, deps.now()),
          },
          select: productSelect,
        });
        await audit(
          t,
          req,
          res,
          "product.published",
          "product",
          p.id,
          { status: p.status },
          { status: row.status, publishedAt: row.publishedAt },
        );
        return row;
      });
      res.json(updated);
    }),
  );

  router.post(
    `${ADMIN}/products/:id/archive`,
    publish,
    validate({ params: s.idParams }),
    handle(async (req, res) => {
      const { params } = input<unknown, z.infer<typeof s.idParams>>(res);
      const updated = await tx(async (t) => {
        const before = await assertExists(
          t.product.findUnique({
            where: { id: params.id },
            select: productSelect,
          }),
        );
        const row = await t.product.update({
          where: { id: params.id },
          data: { status: "ARCHIVED" },
          select: productSelect,
        });
        await audit(
          t,
          req,
          res,
          "product.archived",
          "product",
          row.id,
          { status: before.status },
          { status: row.status },
        );
        return row;
      });
      res.json(updated);
    }),
  );

  // ── Variants (Q8-4: creating one needs price rights) ────────────────────
  router.get(
    `${ADMIN}/products/:id/variants`,
    view,
    validate({ params: s.idParams }),
    handle(async (_req, res) => {
      const { params } = input<unknown, z.infer<typeof s.idParams>>(res);
      await assertExists(
        deps.db.product.findUnique({
          where: { id: params.id },
          select: { id: true },
        }),
      );
      res.json({
        items: await deps.db.productVariant.findMany({
          where: { productId: params.id },
          orderBy: { sku: "asc" },
          include: { inventory: true },
        }),
      });
    }),
  );

  router.post(
    `${ADMIN}/products/:id/variants`,
    prices,
    validate({ params: s.idParams, body: s.variantCreate }),
    handle(async (req, res) => {
      const { body, params } = input<
        z.infer<typeof s.variantCreate>,
        z.infer<typeof s.idParams>
      >(res);
      const created = await tx(async (t) => {
        await assertExists(
          t.product.findUnique({
            where: { id: params.id },
            select: { id: true },
          }),
        );
        const row = await t.productVariant.create({
          data: { ...clean(body), productId: params.id },
        });
        // Q8-7: every variant has a stock row from the start (SOLD_OUT until Phase 9 adds stock).
        await t.inventoryLevel.create({ data: { variantId: row.id } });
        await audit(
          t,
          req,
          res,
          "variant.created",
          "product_variant",
          row.id,
          undefined,
          row,
        );
        return row;
      });
      res.status(201).json(created);
    }),
  );

  router.patch(
    `${ADMIN}/products/:id/variants/:variantId`,
    edit,
    validate({ params: s.variantParams, body: s.variantUpdate }),
    priceGuard,
    handle(async (req, res) => {
      const { body, params } = input<
        z.infer<typeof s.variantUpdate>,
        z.infer<typeof s.variantParams>
      >(res);
      const updated = await tx(async (t) => {
        const before = await assertExists(
          t.productVariant.findFirst({
            where: { id: params.variantId, productId: params.id },
          }),
        );
        const next = {
          pricePaise: body.pricePaise ?? before.pricePaise,
          compareAtPricePaise:
            body.compareAtPricePaise === undefined
              ? before.compareAtPricePaise
              : body.compareAtPricePaise,
        };
        if (
          next.compareAtPricePaise !== null &&
          next.compareAtPricePaise <= next.pricePaise
        )
          throw new AppError("VALIDATION_FAILED", [
            {
              path: "body.compareAtPricePaise",
              code: "INVALID",
              message: "The compare-at price must be above the price.",
            },
          ]);
        const row = await t.productVariant.update({
          where: { id: before.id },
          data: clean(body),
        });
        await audit(
          t,
          req,
          res,
          "variant.updated",
          "product_variant",
          row.id,
          pick(before, body),
          pick(row, body),
        );
        return row;
      });
      res.json(updated);
    }),
  );

  // ── Product images ──────────────────────────────────────────────────────
  router.post(
    `${ADMIN}/products/:id/images`,
    edit,
    validate({ params: s.idParams, body: s.imageCreate }),
    handle(async (req, res) => {
      const { body, params } = input<
        z.infer<typeof s.imageCreate>,
        z.infer<typeof s.idParams>
      >(res);
      const created = await tx(async (t) => {
        await assertExists(
          t.product.findUnique({
            where: { id: params.id },
            select: { id: true },
          }),
        );
        await assertExists(
          t.mediaAsset.findUnique({
            where: { id: body.mediaAssetId },
            select: { id: true },
          }),
        );
        const row = await t.productImage.create({
          data: { ...clean(body), productId: params.id },
          include: { mediaAsset: true },
        });
        await audit(
          t,
          req,
          res,
          "product_image.created",
          "product_image",
          row.id,
          undefined,
          {
            mediaAssetId: row.mediaAssetId,
            role: row.role,
            colourId: row.colourId,
          },
        );
        return row;
      });
      res.status(201).json({
        id: created.id,
        mediaAssetId: created.mediaAssetId,
        ...imageView(created, storage),
      });
    }),
  );

  router.patch(
    `${ADMIN}/products/:id/images/:imageId`,
    edit,
    validate({ params: s.imageParams, body: s.imageUpdate }),
    handle(async (req, res) => {
      const { body, params } = input<
        z.infer<typeof s.imageUpdate>,
        z.infer<typeof s.imageParams>
      >(res);
      const updated = await tx(async (t) => {
        const before = await assertExists(
          t.productImage.findFirst({
            where: { id: params.imageId, productId: params.id },
          }),
        );
        const row = await t.productImage.update({
          where: { id: before.id },
          data: clean(body),
          include: { mediaAsset: true },
        });
        await audit(
          t,
          req,
          res,
          "product_image.updated",
          "product_image",
          row.id,
          pick(before, body),
          pick(row, body),
        );
        return row;
      });
      res.json({
        id: updated.id,
        mediaAssetId: updated.mediaAssetId,
        ...imageView(updated, storage),
      });
    }),
  );

  router.delete(
    `${ADMIN}/products/:id/images/:imageId`,
    edit,
    validate({ params: s.imageParams }),
    handle(async (req, res) => {
      const { params } = input<unknown, z.infer<typeof s.imageParams>>(res);
      await tx(async (t) => {
        const before = await assertExists(
          t.productImage.findFirst({
            where: { id: params.imageId, productId: params.id },
          }),
        );
        await t.productImage.delete({ where: { id: before.id } });
        await audit(
          t,
          req,
          res,
          "product_image.deleted",
          "product_image",
          before.id,
          { mediaAssetId: before.mediaAssetId, role: before.role },
        );
      });
      res.status(204).end();
    }),
  );

  return router;
}

/** Field-level price check: a request with price fields needs `products.editPrices` (whole request refused). */
const priceGuard: RequestHandler = (_req, res, next) => {
  const body =
    (res.locals.input as { body?: Record<string, unknown> }).body ?? {};
  const touchesPrice = s.PRICE_FIELDS.some((f) => f in body);
  if (
    touchesPrice &&
    !can(adminContext(res)!.admin.role, "products.editPrices")
  )
    return next(new AppError("FORBIDDEN"));
  next();
};

const PROBLEM_TEXT: Record<string, string> = {
  CATEGORY_NOT_PUBLISHED: "Publish the product's category first.",
  NO_ACTIVE_VARIANT: "Add at least one active variant.",
  NO_PRIMARY_IMAGE: "Add a primary image with alt text.",
};

const productSelect = {
  id: true,
  name: true,
  slug: true,
  categoryId: true,
  shortDescription: true,
  description: true,
  fabric: true,
  care: true,
  fit: true,
  hsnCode: true,
  sizeChartId: true,
  status: true,
  publishedAt: true,
  labels: true,
  seoTitle: true,
  seoDescription: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function assertExists<T>(p: Promise<T | null>): Promise<T> {
  const row = await p;
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

/** A category cannot become its own ancestor. */
async function assertNoCycle(
  t: Tx,
  id: string,
  parentId: string,
): Promise<void> {
  let current: string | null = parentId;
  for (let depth = 0; current && depth < 50; depth++) {
    if (current === id) throw new AppError("CONFLICT");
    const parent: { parentId: string | null } | null =
      await t.category.findUnique({
        where: { id: current },
        select: { parentId: true },
      });
    if (!parent) throw new AppError("NOT_FOUND");
    current = parent.parentId;
  }
}

/** Drops `undefined` so Prisma leaves those columns alone. */
function clean<T extends object>(
  body: T,
): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(
    Object.entries(body).filter(([, v]) => v !== undefined),
  ) as never;
}

function dates<T extends { startsAt?: string | null; endsAt?: string | null }>(
  body: T,
) {
  return {
    ...body,
    ...(body.startsAt !== undefined
      ? { startsAt: body.startsAt === null ? null : new Date(body.startsAt) }
      : {}),
    ...(body.endsAt !== undefined
      ? { endsAt: body.endsAt === null ? null : new Date(body.endsAt) }
      : {}),
  } as never;
}

/** The audited fields: only those the request changed. */
function pick(row: object, body: object): Record<string, unknown> {
  const r = row as Record<string, unknown>;
  return Object.fromEntries(Object.keys(body).map((k) => [k, r[k] ?? null]));
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
