// Admin categories, collections, colours, sizes and size charts
// (api-specification.md §4; colours, sizes and size charts are additive
// routes that variants and products need). O M C may edit; all roles may read.
import { slugify } from "@sanea/shared";
import { Router, type Response } from "express";
import type { z } from "zod";

import type { Prisma } from "../../generated/prisma/client.ts";
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
import type { ModuleDeps } from "../deps.ts";
import {
  categoryBody,
  collectionBody,
  collectionProductsBody,
  colourBody,
  idParams,
  sizeChartBody,
  updateCategoryBody,
  updateCollectionBody,
  updateColourBody,
  updateSizeChartBody,
} from "./schemas.ts";
import {
  refreshCategory,
  refreshCollection,
  refreshColour,
  refreshProducts,
} from "./search-index.ts";

const ADMIN = "/api/v1/admin";
type Tx = Prisma.TransactionClient;

function requireSlug(slug: string | undefined, name: string): string {
  const value = slug ?? slugify(name);
  if (!value)
    throw new AppError("VALIDATION_FAILED", [
      { path: "body.slug", code: "REQUIRED", message: "Enter a slug." },
    ]);
  return value;
}

const nullish = <T>(v: T | undefined) => (v === undefined ? null : v);

/** True if making `parentId` the parent of `id` would create a cycle. */
async function createsCycle(
  tx: Tx,
  id: string,
  parentId: string,
): Promise<boolean> {
  let current: string | null = parentId;
  for (let depth = 0; current && depth < 50; depth++) {
    if (current === id) return true;
    const row: { parentId: string | null } | null =
      await tx.category.findUnique({
        where: { id: current },
        select: { parentId: true },
      });
    current = row?.parentId ?? null;
  }
  return false;
}

export function adminTaxonomyRouter(deps: ModuleDeps): Router {
  const router = Router();
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
  const view = requirePermission("products.view");
  const edit = requirePermission("products.editContent");
  for (const p of [
    "categories",
    "collections",
    "colours",
    "sizes",
    "size-charts",
  ])
    router.use(`${ADMIN}/${p}`, noStore);

  // ── Categories ────────────────────────────────────────────────────────────
  router.get(
    `${ADMIN}/categories`,
    view,
    handle(async (_req, res) => {
      const categories = await deps.db.category.findMany({
        orderBy: [{ position: "asc" }, { name: "asc" }],
        include: { _count: { select: { products: true, children: true } } },
      });
      res.json({
        categories: categories.map(({ _count, ...c }) => ({
          ...c,
          productCount: _count.products,
          childCount: _count.children,
        })),
      });
    }),
  );

  router.post(
    `${ADMIN}/categories`,
    edit,
    validate({ body: categoryBody }),
    handle(async (req, res) => {
      const { body } = input<z.infer<typeof categoryBody>>(res);
      const category = await deps.db
        .$transaction(async (tx) => {
          const created = await tx.category.create({
            data: {
              name: body.name,
              slug: requireSlug(body.slug, body.name),
              parentId: nullish(body.parentId),
              position: body.position ?? 0,
              status: body.status ?? "DRAFT",
              seoTitle: nullish(body.seoTitle),
              seoDescription: nullish(body.seoDescription),
            },
          });
          await audit(tx, req.ip, res, {
            action: "category.created",
            entityType: "category",
            entityId: created.id,
            after: {
              name: created.name,
              slug: created.slug,
              status: created.status,
            },
          });
          return created;
        })
        .catch(mapDbError);
      res.status(201).json({ category });
    }),
  );

  router.patch(
    `${ADMIN}/categories/:id`,
    edit,
    validate({ params: idParams, body: updateCategoryBody }),
    handle(async (req, res) => {
      const { params, body } = input<
        z.infer<typeof updateCategoryBody>,
        z.infer<typeof idParams>
      >(res);
      const category = await deps.db
        .$transaction(async (tx) => {
          const before = await tx.category.findUnique({
            where: { id: params.id },
          });
          if (!before) throw new AppError("NOT_FOUND");
          if (
            body.parentId &&
            (await createsCycle(tx, params.id, body.parentId))
          )
            throw new AppError("CONFLICT", { reason: "CATEGORY_CYCLE" });
          const updated = await tx.category.update({
            where: { id: params.id },
            data: body,
          });
          if (body.name !== undefined) await refreshCategory(tx, params.id);
          await audit(tx, req.ip, res, {
            action: "category.updated",
            entityType: "category",
            entityId: params.id,
            before: {
              name: before.name,
              slug: before.slug,
              status: before.status,
              parentId: before.parentId,
            },
            after: {
              name: updated.name,
              slug: updated.slug,
              status: updated.status,
              parentId: updated.parentId,
            },
          });
          return updated;
        })
        .catch(mapDbError);
      res.json({ category });
    }),
  );

  router.delete(
    `${ADMIN}/categories/:id`,
    edit,
    validate({ params: idParams }),
    handle(async (req, res) => {
      const { params } = input<unknown, z.infer<typeof idParams>>(res);
      await deps.db
        .$transaction(async (tx) => {
          const before = await tx.category.findUnique({
            where: { id: params.id },
          });
          if (!before) throw new AppError("NOT_FOUND");
          // Products and child categories restrict deletion (409 IN_USE).
          await tx.category.delete({ where: { id: params.id } });
          await audit(tx, req.ip, res, {
            action: "category.deleted",
            entityType: "category",
            entityId: params.id,
            before: { name: before.name, slug: before.slug },
          });
        })
        .catch(mapDbError);
      res.status(204).end();
    }),
  );

  // ── Collections ───────────────────────────────────────────────────────────
  router.get(
    `${ADMIN}/collections`,
    view,
    handle(async (_req, res) => {
      const collections = await deps.db.collection.findMany({
        orderBy: { name: "asc" },
        include: { _count: { select: { products: true } } },
      });
      res.json({
        collections: collections.map(({ _count, ...c }) => ({
          ...c,
          productCount: _count.products,
        })),
      });
    }),
  );

  router.get(
    `${ADMIN}/collections/:id`,
    view,
    validate({ params: idParams }),
    handle(async (_req, res) => {
      const { params } = input<unknown, z.infer<typeof idParams>>(res);
      const collection = await deps.db.collection.findUnique({
        where: { id: params.id },
        include: {
          products: {
            orderBy: { position: "asc" },
            include: {
              product: {
                select: { id: true, name: true, slug: true, status: true },
              },
            },
          },
        },
      });
      if (!collection) throw new AppError("NOT_FOUND");
      const { products, ...rest } = collection;
      res.json({
        collection: { ...rest, products: products.map((p) => p.product) },
      });
    }),
  );

  router.post(
    `${ADMIN}/collections`,
    edit,
    validate({ body: collectionBody }),
    handle(async (req, res) => {
      const { body } = input<z.infer<typeof collectionBody>>(res);
      const collection = await deps.db
        .$transaction(async (tx) => {
          const created = await tx.collection.create({
            data: {
              name: body.name,
              slug: requireSlug(body.slug, body.name),
              description: nullish(body.description),
              heroImageId: nullish(body.heroImageId),
              status: body.status ?? "DRAFT",
              startsAt: body.startsAt ? new Date(body.startsAt) : null,
              endsAt: body.endsAt ? new Date(body.endsAt) : null,
              seoTitle: nullish(body.seoTitle),
              seoDescription: nullish(body.seoDescription),
            },
          });
          await audit(tx, req.ip, res, {
            action: "collection.created",
            entityType: "collection",
            entityId: created.id,
            after: {
              name: created.name,
              slug: created.slug,
              status: created.status,
            },
          });
          return created;
        })
        .catch(mapDbError);
      res.status(201).json({ collection });
    }),
  );

  router.patch(
    `${ADMIN}/collections/:id`,
    edit,
    validate({ params: idParams, body: updateCollectionBody }),
    handle(async (req, res) => {
      const { params, body } = input<
        z.infer<typeof updateCollectionBody>,
        z.infer<typeof idParams>
      >(res);
      const collection = await deps.db
        .$transaction(async (tx) => {
          const before = await tx.collection.findUnique({
            where: { id: params.id },
          });
          if (!before) throw new AppError("NOT_FOUND");
          const { startsAt, endsAt, ...rest } = body;
          const data: Prisma.CollectionUncheckedUpdateInput = {
            ...rest,
            ...(startsAt !== undefined
              ? { startsAt: startsAt ? new Date(startsAt) : null }
              : {}),
            ...(endsAt !== undefined
              ? { endsAt: endsAt ? new Date(endsAt) : null }
              : {}),
          };
          const s =
            data.startsAt !== undefined
              ? (data.startsAt as Date | null)
              : before.startsAt;
          const e =
            data.endsAt !== undefined
              ? (data.endsAt as Date | null)
              : before.endsAt;
          if (s && e && e <= s)
            throw new AppError("VALIDATION_FAILED", [
              {
                path: "body.endsAt",
                code: "INVALID",
                message: "The end must be after the start.",
              },
            ]);
          const updated = await tx.collection.update({
            where: { id: params.id },
            data,
          });
          if (body.name !== undefined) await refreshCollection(tx, params.id);
          await audit(tx, req.ip, res, {
            action: "collection.updated",
            entityType: "collection",
            entityId: params.id,
            before: {
              name: before.name,
              slug: before.slug,
              status: before.status,
            },
            after: {
              name: updated.name,
              slug: updated.slug,
              status: updated.status,
            },
          });
          return updated;
        })
        .catch(mapDbError);
      res.json({ collection });
    }),
  );

  router.delete(
    `${ADMIN}/collections/:id`,
    edit,
    validate({ params: idParams }),
    handle(async (req, res) => {
      const { params } = input<unknown, z.infer<typeof idParams>>(res);
      await deps.db
        .$transaction(async (tx) => {
          const before = await tx.collection.findUnique({
            where: { id: params.id },
            include: { products: { select: { productId: true } } },
          });
          if (!before) throw new AppError("NOT_FOUND");
          await tx.collection.delete({ where: { id: params.id } });
          await refreshProducts(
            tx,
            before.products.map((p) => p.productId),
          );
          await audit(tx, req.ip, res, {
            action: "collection.deleted",
            entityType: "collection",
            entityId: params.id,
            before: { name: before.name, slug: before.slug },
          });
        })
        .catch(mapDbError);
      res.status(204).end();
    }),
  );

  router.put(
    `${ADMIN}/collections/:id/products`,
    edit,
    validate({ params: idParams, body: collectionProductsBody }),
    handle(async (req, res) => {
      const { params, body } = input<
        z.infer<typeof collectionProductsBody>,
        z.infer<typeof idParams>
      >(res);
      const ids = [...new Set(body.productIds)];
      await deps.db
        .$transaction(async (tx) => {
          const before = await tx.collectionProduct.findMany({
            where: { collectionId: params.id },
          });
          if (
            !(await tx.collection.findUnique({
              where: { id: params.id },
              select: { id: true },
            }))
          )
            throw new AppError("NOT_FOUND");
          await tx.collectionProduct.deleteMany({
            where: { collectionId: params.id },
          });
          await tx.collectionProduct.createMany({
            data: ids.map((productId, position) => ({
              collectionId: params.id,
              productId,
              position,
            })),
          });
          await refreshProducts(tx, [
            ...new Set([...before.map((b) => b.productId), ...ids]),
          ]);
          await audit(tx, req.ip, res, {
            action: "collection.products_replaced",
            entityType: "collection",
            entityId: params.id,
            before: { productIds: before.map((b) => b.productId) },
            after: { productIds: ids },
          });
        })
        .catch(mapDbError);
      res.status(204).end();
    }),
  );

  // ── Colours ───────────────────────────────────────────────────────────────
  router.get(
    `${ADMIN}/colours`,
    view,
    handle(async (_req, res) => {
      res.json({
        colours: await deps.db.colour.findMany({
          orderBy: [{ position: "asc" }, { name: "asc" }],
        }),
      });
    }),
  );

  router.post(
    `${ADMIN}/colours`,
    edit,
    validate({ body: colourBody }),
    handle(async (req, res) => {
      const { body } = input<z.infer<typeof colourBody>>(res);
      const colour = await deps.db
        .$transaction(async (tx) => {
          const created = await tx.colour.create({
            data: {
              name: body.name,
              slug: requireSlug(body.slug, body.name),
              swatchHex: body.swatchHex.toUpperCase(),
              position: body.position ?? 0,
            },
          });
          await audit(tx, req.ip, res, {
            action: "colour.created",
            entityType: "colour",
            entityId: created.id,
            after: { name: created.name, swatchHex: created.swatchHex },
          });
          return created;
        })
        .catch(mapDbError);
      res.status(201).json({ colour });
    }),
  );

  router.patch(
    `${ADMIN}/colours/:id`,
    edit,
    validate({ params: idParams, body: updateColourBody }),
    handle(async (req, res) => {
      const { params, body } = input<
        z.infer<typeof updateColourBody>,
        z.infer<typeof idParams>
      >(res);
      const colour = await deps.db
        .$transaction(async (tx) => {
          const before = await tx.colour.findUnique({
            where: { id: params.id },
          });
          if (!before) throw new AppError("NOT_FOUND");
          const updated = await tx.colour.update({
            where: { id: params.id },
            data: {
              ...body,
              ...(body.swatchHex
                ? { swatchHex: body.swatchHex.toUpperCase() }
                : {}),
            },
          });
          if (body.name !== undefined) await refreshColour(tx, params.id);
          await audit(tx, req.ip, res, {
            action: "colour.updated",
            entityType: "colour",
            entityId: params.id,
            before: { name: before.name, swatchHex: before.swatchHex },
            after: { name: updated.name, swatchHex: updated.swatchHex },
          });
          return updated;
        })
        .catch(mapDbError);
      res.json({ colour });
    }),
  );

  // ── Sizes (reference data, read-only) and size charts ─────────────────────
  router.get(
    `${ADMIN}/sizes`,
    view,
    handle(async (_req, res) => {
      res.json({
        sizes: await deps.db.size.findMany({ orderBy: { position: "asc" } }),
      });
    }),
  );

  router.get(
    `${ADMIN}/size-charts`,
    view,
    handle(async (_req, res) => {
      res.json({
        sizeCharts: await deps.db.sizeChart.findMany({
          orderBy: { name: "asc" },
        }),
      });
    }),
  );

  router.post(
    `${ADMIN}/size-charts`,
    edit,
    validate({ body: sizeChartBody }),
    handle(async (req, res) => {
      const { body } = input<z.infer<typeof sizeChartBody>>(res);
      const sizeChart = await deps.db.$transaction(async (tx) => {
        const created = await tx.sizeChart.create({ data: body });
        await audit(tx, req.ip, res, {
          action: "size_chart.created",
          entityType: "size_chart",
          entityId: created.id,
          after: { name: created.name, unit: created.unit },
        });
        return created;
      });
      res.status(201).json({ sizeChart });
    }),
  );

  router.patch(
    `${ADMIN}/size-charts/:id`,
    edit,
    validate({ params: idParams, body: updateSizeChartBody }),
    handle(async (req, res) => {
      const { params, body } = input<
        z.infer<typeof updateSizeChartBody>,
        z.infer<typeof idParams>
      >(res);
      const sizeChart = await deps.db.$transaction(async (tx) => {
        const before = await tx.sizeChart.findUnique({
          where: { id: params.id },
        });
        if (!before) throw new AppError("NOT_FOUND");
        const updated = await tx.sizeChart.update({
          where: { id: params.id },
          data: body,
        });
        await audit(tx, req.ip, res, {
          action: "size_chart.updated",
          entityType: "size_chart",
          entityId: params.id,
          before: {
            name: before.name,
            unit: before.unit,
            rows: before.rows as Prisma.InputJsonValue,
          },
          after: {
            name: updated.name,
            unit: updated.unit,
            rows: updated.rows as Prisma.InputJsonValue,
          },
        });
        return updated;
      });
      res.json({ sizeChart });
    }),
  );

  return router;
}
