// /api/v1/admin/products (api-specification.md §4): products, their variants
// and images, publishing and archiving. Every write is audited and keeps the
// search document current, in one transaction. Price fields need
// `products.editPrices` (Owner, Manager); other edits `products.editContent`.
import { slugify } from "@sanea/shared";
import { Router, type RequestHandler } from "express";
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
import { can } from "../auth/permissions.ts";
import type { ModuleDeps } from "../deps.ts";
import { assetView } from "../media/router.ts";
import {
  createProductBody,
  createVariantBody,
  idParams,
  imagesBody,
  productListQuery,
  updateProductBody,
  updateVariantBody,
  variantParams,
} from "./schemas.ts";
import { refreshProducts } from "./search-index.ts";

export const PRODUCTS_PATH = "/api/v1/admin/products";

type Tx = Prisma.TransactionClient;

const PRICE_FIELDS = ["pricePaise", "compareAtPricePaise"] as const;

/** Rejects a request that changes prices unless the role may edit prices. */
const priceGuard: RequestHandler = (_req, res, next) => {
  const body = (res.locals.input as { body: Record<string, unknown> }).body;
  const touchesPrice = PRICE_FIELDS.some((f) => body[f] !== undefined);
  if (
    touchesPrice &&
    !can(adminContext(res)!.admin.role, "products.editPrices")
  )
    return next(new AppError("FORBIDDEN"));
  next();
};

async function loadProduct(tx: Tx | ModuleDeps["db"], id: string) {
  const product = await tx.product.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true, slug: true, status: true } },
      sizeChart: { select: { id: true, name: true } },
      variants: {
        orderBy: [
          { colour: { position: "asc" } },
          { size: { position: "asc" } },
        ],
        include: {
          colour: { select: { id: true, name: true, swatchHex: true } },
          size: { select: { id: true, label: true } },
          inventory: true,
        },
      },
      images: { orderBy: { position: "asc" }, include: { mediaAsset: true } },
      collections: {
        include: {
          collection: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });
  if (!product) throw new AppError("NOT_FOUND");
  return product;
}

function productView(
  baseUrl: string,
  p: Awaited<ReturnType<typeof loadProduct>>,
) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    status: p.status,
    publishedAt: p.publishedAt,
    category: p.category,
    shortDescription: p.shortDescription,
    description: p.description,
    fabric: p.fabric,
    care: p.care,
    fit: p.fit,
    hsnCode: p.hsnCode,
    sizeChart: p.sizeChart,
    labels: p.labels,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    variants: p.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      colour: v.colour,
      size: v.size,
      pricePaise: v.pricePaise,
      compareAtPricePaise: v.compareAtPricePaise,
      isActive: v.isActive,
      stock: v.inventory
        ? {
            onHand: v.inventory.onHand,
            reserved: v.inventory.reserved,
            lowStockThreshold: v.inventory.lowStockThreshold,
          }
        : null,
    })),
    images: p.images.map((i) => ({
      id: i.id,
      colourId: i.colourId,
      alt: i.alt,
      role: i.role,
      position: i.position,
      asset: assetView(baseUrl, i.mediaAsset),
    })),
    collections: p.collections.map((c) => c.collection),
  };
}

/** Reasons a product cannot be published yet; empty when it can. */
async function publishProblems(tx: Tx, id: string): Promise<string[]> {
  const p = await tx.product.findUnique({
    where: { id },
    include: {
      category: { select: { status: true } },
      variants: { where: { isActive: true }, select: { id: true } },
      images: { where: { role: "PRIMARY" }, select: { id: true } },
    },
  });
  if (!p) throw new AppError("NOT_FOUND");
  const problems: string[] = [];
  if (p.category.status !== "PUBLISHED")
    problems.push("CATEGORY_NOT_PUBLISHED");
  if (p.variants.length === 0) problems.push("NO_ACTIVE_VARIANT");
  if (p.images.length === 0) problems.push("NO_PRIMARY_IMAGE");
  return problems;
}

export function adminProductsRouter(deps: ModuleDeps): Router {
  const router = Router();
  const base = deps.config.mediaPublicBaseUrl;
  const audit = (
    tx: Tx,
    req: { ip?: string | undefined },
    res: Parameters<RequestHandler>[1],
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
      ip: req.ip,
    });

  router.use(PRODUCTS_PATH, noStore);

  router.get(
    PRODUCTS_PATH,
    requirePermission("products.view"),
    validate({ query: productListQuery }),
    handle(async (_req, res) => {
      const { query } = input<
        unknown,
        unknown,
        z.infer<typeof productListQuery>
      >(res);
      const where: Prisma.ProductWhereInput = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.q
          ? {
              OR: [
                { name: { contains: query.q, mode: "insensitive" } },
                {
                  variants: {
                    some: { sku: { contains: query.q, mode: "insensitive" } },
                  },
                },
              ],
            }
          : {}),
        ...(query.before ? { id: { lt: query.before } } : {}),
      };
      const rows = await deps.db.product.findMany({
        where,
        orderBy: { id: "desc" },
        take: query.limit,
        include: {
          category: { select: { id: true, name: true } },
          _count: { select: { variants: true } },
          images: {
            where: { role: "PRIMARY" },
            take: 1,
            include: { mediaAsset: true },
          },
        },
      });
      res.json({
        products: rows.map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          status: p.status,
          category: p.category,
          variantCount: p._count.variants,
          updatedAt: p.updatedAt,
          primaryImage: p.images[0]
            ? {
                alt: p.images[0].alt,
                asset: assetView(base, p.images[0].mediaAsset),
              }
            : null,
        })),
        nextBefore: rows.length === query.limit ? rows.at(-1)!.id : null,
      });
    }),
  );

  router.post(
    PRODUCTS_PATH,
    requirePermission("products.editContent"),
    validate({ body: createProductBody }),
    handle(async (req, res) => {
      const { body } = input<z.infer<typeof createProductBody>>(res);
      const slug = body.slug ?? slugify(body.name);
      if (!slug)
        throw new AppError("VALIDATION_FAILED", [
          { path: "body.slug", code: "REQUIRED", message: "Enter a slug." },
        ]);
      const id = await deps.db
        .$transaction(async (tx) => {
          const created = await tx.product.create({
            data: {
              name: body.name,
              slug,
              categoryId: body.categoryId,
              shortDescription: body.shortDescription,
              description: body.description,
              fabric: body.fabric ?? null,
              care: body.care ?? null,
              fit: body.fit ?? null,
              hsnCode: body.hsnCode ?? null,
              sizeChartId: body.sizeChartId ?? null,
              labels: body.labels ?? [],
              seoTitle: body.seoTitle ?? null,
              seoDescription: body.seoDescription ?? null,
            },
          });
          await refreshProducts(tx, [created.id]);
          await audit(tx, req, res, {
            action: "product.created",
            entityType: "product",
            entityId: created.id,
            after: {
              name: created.name,
              slug: created.slug,
              categoryId: created.categoryId,
            },
          });
          return created.id;
        })
        .catch(mapDbError);
      res
        .status(201)
        .json({ product: productView(base, await loadProduct(deps.db, id)) });
    }),
  );

  router.get(
    `${PRODUCTS_PATH}/:id`,
    requirePermission("products.view"),
    validate({ params: idParams }),
    handle(async (_req, res) => {
      const { params } = input<unknown, z.infer<typeof idParams>>(res);
      res.json({
        product: productView(base, await loadProduct(deps.db, params.id)),
      });
    }),
  );

  router.patch(
    `${PRODUCTS_PATH}/:id`,
    requirePermission("products.editContent"),
    validate({ params: idParams, body: updateProductBody }),
    handle(async (req, res) => {
      const { params, body } = input<
        z.infer<typeof updateProductBody>,
        z.infer<typeof idParams>
      >(res);
      await deps.db
        .$transaction(async (tx) => {
          const before = await tx.product.findUnique({
            where: { id: params.id },
          });
          if (!before) throw new AppError("NOT_FOUND");
          const data: Prisma.ProductUncheckedUpdateInput = { ...body };
          await tx.product.update({ where: { id: params.id }, data });
          await refreshProducts(tx, [params.id]);
          const changed = Object.keys(body) as (keyof typeof body)[];
          await audit(tx, req, res, {
            action: "product.updated",
            entityType: "product",
            entityId: params.id,
            before: pick(before, changed),
            after: pick(body, changed),
          });
        })
        .catch(mapDbError);
      res.json({
        product: productView(base, await loadProduct(deps.db, params.id)),
      });
    }),
  );

  for (const action of ["publish", "archive"] as const) {
    router.post(
      `${PRODUCTS_PATH}/:id/${action}`,
      requirePermission("products.publish"),
      validate({ params: idParams }),
      handle(async (req, res) => {
        const { params } = input<unknown, z.infer<typeof idParams>>(res);
        await deps.db.$transaction(async (tx) => {
          const before = await tx.product.findUnique({
            where: { id: params.id },
          });
          if (!before) throw new AppError("NOT_FOUND");
          if (action === "publish") {
            const problems = await publishProblems(tx, params.id);
            if (problems.length > 0)
              throw new AppError("CONFLICT", { reasons: problems });
          }
          const status = action === "publish" ? "PUBLISHED" : "ARCHIVED";
          if (before.status === status) return;
          await tx.product.update({
            where: { id: params.id },
            data: {
              status,
              ...(action === "publish"
                ? { publishedAt: before.publishedAt ?? deps.now() }
                : {}),
            },
          });
          await audit(tx, req, res, {
            action: `product.${action === "publish" ? "published" : "archived"}`,
            entityType: "product",
            entityId: params.id,
            before: { status: before.status },
            after: { status },
          });
        });
        res.json({
          product: productView(base, await loadProduct(deps.db, params.id)),
        });
      }),
    );
  }

  // Variants. Creating one sets its price, so it needs the price permission.
  router.post(
    `${PRODUCTS_PATH}/:id/variants`,
    requirePermission("products.editContent"),
    requirePermission("products.editPrices"),
    validate({ params: idParams, body: createVariantBody }),
    handle(async (req, res) => {
      const { params, body } = input<
        z.infer<typeof createVariantBody>,
        z.infer<typeof idParams>
      >(res);
      const variantId = await deps.db
        .$transaction(async (tx) => {
          if (
            !(await tx.product.findUnique({
              where: { id: params.id },
              select: { id: true },
            }))
          )
            throw new AppError("NOT_FOUND");
          const v = await tx.productVariant.create({
            data: {
              productId: params.id,
              colourId: body.colourId,
              sizeId: body.sizeId,
              sku: body.sku,
              pricePaise: body.pricePaise,
              compareAtPricePaise: body.compareAtPricePaise ?? null,
              isActive: body.isActive ?? true,
              // Stock starts at zero; it changes only through inventory (Phase 9).
              inventory: { create: {} },
            },
          });
          await refreshProducts(tx, [params.id]);
          await audit(tx, req, res, {
            action: "variant.created",
            entityType: "product_variant",
            entityId: v.id,
            after: {
              productId: params.id,
              sku: v.sku,
              colourId: v.colourId,
              sizeId: v.sizeId,
              pricePaise: v.pricePaise,
              compareAtPricePaise: v.compareAtPricePaise,
            },
          });
          return v.id;
        })
        .catch(mapDbError);
      const product = productView(base, await loadProduct(deps.db, params.id));
      res
        .status(201)
        .json({ variant: product.variants.find((v) => v.id === variantId) });
    }),
  );

  router.patch(
    `${PRODUCTS_PATH}/:id/variants/:variantId`,
    requirePermission("products.editContent"),
    validate({ params: variantParams, body: updateVariantBody }),
    priceGuard,
    handle(async (req, res) => {
      const { params, body } = input<
        z.infer<typeof updateVariantBody>,
        z.infer<typeof variantParams>
      >(res);
      await deps.db
        .$transaction(async (tx) => {
          const before = await tx.productVariant.findFirst({
            where: { id: params.variantId, productId: params.id },
          });
          if (!before) throw new AppError("NOT_FOUND");
          const price = body.pricePaise ?? before.pricePaise;
          const compare =
            body.compareAtPricePaise === undefined
              ? before.compareAtPricePaise
              : body.compareAtPricePaise;
          if (compare !== null && compare <= price)
            throw new AppError("VALIDATION_FAILED", [
              {
                path: "body.compareAtPricePaise",
                code: "INVALID",
                message: "The compare-at price must be higher than the price.",
              },
            ]);
          await tx.productVariant.update({
            where: { id: before.id },
            data: body,
          });
          const changed = Object.keys(body) as (keyof typeof body)[];
          await audit(tx, req, res, {
            action: PRICE_FIELDS.some((f) => body[f] !== undefined)
              ? "variant.price_changed"
              : "variant.updated",
            entityType: "product_variant",
            entityId: before.id,
            before: pick(before, changed),
            after: pick(body, changed),
          });
        })
        .catch(mapDbError);
      const product = productView(base, await loadProduct(deps.db, params.id));
      res.json({
        variant: product.variants.find((v) => v.id === params.variantId),
      });
    }),
  );

  // Images: the whole ordered list is replaced. At most one PRIMARY and one
  // HOVER image per colour (or for all colours), and the colour must be one
  // the product is sold in.
  router.put(
    `${PRODUCTS_PATH}/:id/images`,
    requirePermission("products.editContent"),
    validate({ params: idParams, body: imagesBody }),
    handle(async (req, res) => {
      const { params, body } = input<
        z.infer<typeof imagesBody>,
        z.infer<typeof idParams>
      >(res);
      const seen = new Set<string>();
      body.images.forEach((img, i) => {
        if (img.role === "GALLERY") return;
        const key = `${img.role}:${img.colourId ?? "all"}`;
        if (seen.has(key))
          throw new AppError("VALIDATION_FAILED", [
            {
              path: `body.images.${i}.role`,
              code: "INVALID",
              message: "Only one image per role and colour.",
            },
          ]);
        seen.add(key);
      });
      await deps.db
        .$transaction(async (tx) => {
          const product = await tx.product.findUnique({
            where: { id: params.id },
            include: { variants: { select: { colourId: true } }, images: true },
          });
          if (!product) throw new AppError("NOT_FOUND");
          const colours = new Set(product.variants.map((v) => v.colourId));
          body.images.forEach((img, i) => {
            if (img.colourId && !colours.has(img.colourId))
              throw new AppError("VALIDATION_FAILED", [
                {
                  path: `body.images.${i}.colourId`,
                  code: "INVALID",
                  message: "Add a variant in this colour first.",
                },
              ]);
          });
          await tx.productImage.deleteMany({ where: { productId: params.id } });
          await tx.productImage.createMany({
            data: body.images.map((img, position) => ({
              productId: params.id,
              mediaAssetId: img.mediaAssetId,
              colourId: img.colourId ?? null,
              alt: img.alt,
              role: img.role,
              position,
            })),
          });
          // A published product keeps a primary image.
          if (
            product.status === "PUBLISHED" &&
            !body.images.some((i) => i.role === "PRIMARY")
          )
            throw new AppError("CONFLICT", { reasons: ["NO_PRIMARY_IMAGE"] });
          await audit(tx, req, res, {
            action: "product.images_replaced",
            entityType: "product",
            entityId: params.id,
            before: { count: product.images.length },
            after: {
              count: body.images.length,
              mediaAssetIds: body.images.map((i) => i.mediaAssetId),
            },
          });
        })
        .catch(mapDbError);
      res.json({
        product: productView(base, await loadProduct(deps.db, params.id)),
      });
    }),
  );

  return router;
}

function pick<T extends object>(
  source: T,
  keys: readonly PropertyKey[],
): Prisma.InputJsonValue {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const value = (source as Record<PropertyKey, unknown>)[k];
    out[String(k)] = value === undefined ? null : value;
  }
  return out as Prisma.InputJsonValue;
}
