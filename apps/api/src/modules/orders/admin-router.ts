// /api/v1/admin/orders (api-specification.md §4). Staff list and read orders
// (O M F), move them through the allowed transitions (cancel: O M by the
// table), add internal notes, record refunds (O M; executed manually in
// release one, project-requirements.md UF-7) and restock returns (SR-13).
// Every write is audited without personal data; emails follow the change.
import {
  can,
  nextStatuses,
  orderStatusSchema,
  type Address,
} from "@sanea/shared";
import { Router, type Response } from "express";
import { z } from "zod";

import type { Prisma } from "../../generated/prisma/client.ts";
import { adminContext } from "../../platform/http/admin-context.ts";
import { AppError } from "../../platform/http/errors.ts";
import { handle, input, noStore } from "../../platform/http/handle.ts";
import { validate } from "../../platform/http/validate.ts";
import { recordAudit } from "../audit/record.ts";
import { requirePermission } from "../auth/middleware.ts";
import type { ModuleDeps } from "../deps.ts";
import { notify, templateFor } from "../notifications/service.ts";
import { lockOrder, transition } from "./service.ts";

export const ORDERS_PATH = "/api/v1/admin/orders";

const orderParams = z.object({
  orderNumber: z.string().regex(/^SP-[0-9]{4}-[0-9]{6}$/),
});
const listQuery = z.strictObject({
  status: orderStatusSchema.optional(),
  method: z.enum(["PREPAID", "COD"]).optional(),
  needsAttention: z.enum(["true"]).optional(),
  q: z.string().trim().min(2).max(100).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  before: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
const oneLine = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    // eslint-disable-next-line no-control-regex -- rejects control characters
    .regex(/^[^\u0000-\u001f\u007f]*$/);
const transitionBody = z.strictObject({
  toStatus: orderStatusSchema,
  note: z.string().trim().max(500).optional(),
  shipment: z
    .strictObject({
      courierName: oneLine(100),
      trackingNumber: oneLine(100),
      trackingUrl: z
        .url({ protocol: /^https$/ })
        .max(500)
        .optional(),
    })
    .optional(),
});
const noteBody = z.strictObject({ body: z.string().trim().min(1).max(2000) });
const refundBody = z.strictObject({
  amountPaise: z.number().int().min(1),
  reason: oneLine(500),
});
const completeBody = z.strictObject({
  outcome: z.enum(["REFUNDED", "FAILED"]),
  /** The bank or gateway reference of the manual refund. */
  reference: oneLine(100).optional(),
});
const refundParams = orderParams.extend({ refundId: z.uuid() });
const restockBody = z.strictObject({
  lines: z
    .array(
      z.strictObject({
        itemId: z.uuid(),
        quantity: z.number().int().min(1).max(10),
      }),
    )
    .min(1)
    .max(50),
});

/** Day boundaries in India time for the date filters. */
const istStart = (d: string) => new Date(`${d}T00:00:00+05:30`);

export function ordersAdminRouter(deps: ModuleDeps): Router {
  const router = Router();
  router.use(ORDERS_PATH, noStore);

  const staff = (res: Response) => adminContext(res)!.admin;
  const audit = (
    tx: Prisma.TransactionClient,
    ip: string | undefined,
    res: Response,
    entry: {
      action: string;
      entityId: string;
      before?: Prisma.InputJsonValue;
      after?: Prisma.InputJsonValue;
    },
  ) =>
    recordAudit(tx, deps.config.ipHashKey, {
      ...entry,
      entityType: "order",
      actorAdminId: staff(res).id,
      ip,
    });

  async function findOrder(orderNumber: string) {
    const o = await deps.db.order.findUnique({ where: { orderNumber } });
    if (!o) throw new AppError("NOT_FOUND");
    return o;
  }

  router.get(
    ORDERS_PATH,
    requirePermission("orders.view"),
    validate({ query: listQuery }),
    handle(async (_req, res) => {
      const { query } = input<unknown, unknown, z.infer<typeof listQuery>>(res);
      const placedAt: Prisma.DateTimeFilter = {};
      if (query.from) placedAt.gte = istStart(query.from);
      if (query.to)
        placedAt.lt = new Date(istStart(query.to).getTime() + 86_400_000);
      const where: Prisma.OrderWhereInput = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.method ? { paymentMethod: query.method } : {}),
        ...(query.needsAttention ? { needsAttention: true } : {}),
        ...(query.from || query.to ? { placedAt } : {}),
        ...(query.q
          ? {
              OR: [
                { orderNumber: { contains: query.q.toUpperCase() } },
                { email: { contains: query.q, mode: "insensitive" } },
                { phone: { contains: query.q.replace(/\s/g, "") } },
              ],
            }
          : {}),
        ...(query.before ? { id: { lt: query.before } } : {}),
      };
      const rows = await deps.db.order.findMany({
        where,
        orderBy: { id: "desc" },
        take: query.limit,
        include: { items: { select: { quantity: true } } },
      });
      res.json({
        orders: rows.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          paymentMethod: o.paymentMethod,
          totalPaise: o.totalPaise,
          itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
          customerName: (o.shippingAddress as Address).fullName,
          city: (o.shippingAddress as Address).city,
          needsAttention: o.needsAttention,
          attentionReason: o.attentionReason,
          placedAt: o.placedAt.toISOString(),
        })),
        nextBefore: rows.length === query.limit ? rows.at(-1)!.id : null,
      });
    }),
  );

  router.get(
    `${ORDERS_PATH}/:orderNumber`,
    requirePermission("orders.view"),
    validate({ params: orderParams }),
    handle(async (_req, res) => {
      const { params } = input<unknown, z.infer<typeof orderParams>>(res);
      const o = await deps.db.order.findUnique({
        where: { orderNumber: params.orderNumber },
        include: {
          items: { orderBy: { id: "asc" } },
          events: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
          payments: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            include: { refunds: { orderBy: { createdAt: "asc" } } },
          },
          shipments: { orderBy: { shippedAt: "asc" } },
          staffNotes: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            include: { admin: { select: { name: true } } },
          },
        },
      });
      if (!o) throw new AppError("NOT_FOUND");
      const actors = await deps.db.adminUser.findMany({
        where: {
          id: { in: o.events.flatMap((e) => (e.actorId ? [e.actorId] : [])) },
        },
        select: { id: true, name: true },
      });
      const restocked = await deps.db.stockMovement.groupBy({
        by: ["variantId"],
        where: { referenceType: "RETURN", referenceId: o.id },
        _sum: { onHandDelta: true },
      });
      res.json({
        order: {
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          paymentMethod: o.paymentMethod,
          needsAttention: o.needsAttention,
          attentionReason: o.attentionReason,
          email: o.email,
          phone: o.phone,
          shippingAddress: o.shippingAddress,
          billingAddress: o.billingAddress,
          customerNote: o.notes,
          subtotalPaise: o.subtotalPaise,
          discountPaise: o.discountPaise,
          shippingPaise: o.shippingPaise,
          codFeePaise: o.codFeePaise,
          taxPaise: o.taxPaise,
          totalPaise: o.totalPaise,
          currency: o.currency,
          placedAt: o.placedAt.toISOString(),
          confirmedAt: o.confirmedAt?.toISOString() ?? null,
          cancelledAt: o.cancelledAt?.toISOString() ?? null,
          items: o.items.map((i) => ({
            ...i,
            restocked:
              restocked.find((r) => r.variantId === i.variantId)?._sum
                .onHandDelta ?? 0,
          })),
          events: o.events.map((e) => ({
            fromStatus: e.fromStatus,
            toStatus: e.toStatus,
            actorType: e.actorType,
            actorName: actors.find((a) => a.id === e.actorId)?.name ?? null,
            note: e.note,
            createdAt: e.createdAt.toISOString(),
          })),
          payments: o.payments.map((p) => ({
            id: p.id,
            method: p.method,
            provider: p.provider,
            status: p.status,
            amountPaise: p.amountPaise,
            failureCode: p.failureCode,
            createdAt: p.createdAt.toISOString(),
            refunds: p.refunds.map((r) => ({
              id: r.id,
              amountPaise: r.amountPaise,
              reason: r.reason,
              status: r.status,
              reference: r.providerRefundId,
              byStaff: r.createdByAdminId !== null,
              createdAt: r.createdAt.toISOString(),
            })),
          })),
          shipments: o.shipments,
          notes: o.staffNotes.map((n) => ({
            id: n.id,
            body: n.body,
            by: n.admin.name,
            createdAt: n.createdAt.toISOString(),
          })),
        },
        nextStatuses: nextStatuses(o.status, staff(res).role),
      });
    }),
  );

  router.post(
    `${ORDERS_PATH}/:orderNumber/transitions`,
    requirePermission("orders.fulfil"),
    validate({ params: orderParams, body: transitionBody }),
    handle(async (req, res) => {
      const { params, body } = input<
        z.infer<typeof transitionBody>,
        z.infer<typeof orderParams>
      >(res);
      const admin = staff(res);
      const o = await findOrder(params.orderNumber);
      const now = deps.now();
      const result = await deps.db.$transaction(async (tx) => {
        const r = await transition(
          tx,
          o.id,
          body.toStatus,
          { type: "ADMIN", adminId: admin.id, role: admin.role },
          {
            note: body.note,
            ...(body.shipment ? { shipment: body.shipment } : {}),
            now,
          },
        );
        // Cancelling a paid order records the refund staff owe (UF-7).
        if (body.toStatus === "CANCELLED")
          await refundCaptured(tx, o.id, admin.id);
        await audit(tx, req.ip, res, {
          action: "order.status_changed",
          entityId: o.id,
          before: { status: r.from },
          after: { status: r.to },
        });
        return r;
      });
      await notify(
        deps,
        o.id,
        templateFor(result.to, o.paymentMethod, result.from),
      );
      res.json({ status: result.to });
    }),
  );

  router.post(
    `${ORDERS_PATH}/:orderNumber/notes`,
    requirePermission("orders.view"),
    validate({ params: orderParams, body: noteBody }),
    handle(async (req, res) => {
      const { params, body } = input<
        z.infer<typeof noteBody>,
        z.infer<typeof orderParams>
      >(res);
      const o = await findOrder(params.orderNumber);
      const note = await deps.db.$transaction(async (tx) => {
        const n = await tx.orderNote.create({
          data: {
            orderId: o.id,
            adminId: staff(res).id,
            body: body.body,
            createdAt: deps.now(),
          },
        });
        await audit(tx, req.ip, res, {
          action: "order.note_added",
          entityId: o.id,
          after: { noteId: n.id },
        });
        return n;
      });
      res.status(201).json({ note: { id: note.id } });
    }),
  );

  router.post(
    `${ORDERS_PATH}/:orderNumber/refunds`,
    requirePermission("orders.cancelRefund"),
    validate({ params: orderParams, body: refundBody }),
    handle(async (req, res) => {
      const { params, body } = input<
        z.infer<typeof refundBody>,
        z.infer<typeof orderParams>
      >(res);
      const o = await findOrder(params.orderNumber);
      const refund = await deps.db.$transaction(async (tx) => {
        await lockOrder(tx, o.id);
        const paid = await tx.payment.findFirst({
          where: {
            orderId: o.id,
            status: {
              in: ["CAPTURED", "COLLECTED", "REFUND_PENDING", "REFUNDED"],
            },
          },
          include: { refunds: true },
        });
        if (!paid) throw new AppError("CONFLICT", { reason: "NOTHING_PAID" });
        const committed = paid.refunds
          .filter((r) => r.status !== "FAILED")
          .reduce((n, r) => n + r.amountPaise, 0);
        if (committed + body.amountPaise > paid.amountPaise)
          throw new AppError("CONFLICT", {
            reason: "OVER_REFUND",
            refundablePaise: paid.amountPaise - committed,
          });
        const r = await tx.refund.create({
          data: {
            paymentId: paid.id,
            amountPaise: body.amountPaise,
            reason: body.reason,
            createdByAdminId: staff(res).id,
            createdAt: deps.now(),
          },
        });
        await tx.payment.update({
          where: { id: paid.id },
          data: { status: "REFUND_PENDING" },
        });
        await audit(tx, req.ip, res, {
          action: "order.refund_recorded",
          entityId: o.id,
          after: { refundId: r.id, amountPaise: r.amountPaise },
        });
        return r;
      });
      res
        .status(201)
        .json({ refund: { id: refund.id, status: refund.status } });
    }),
  );

  router.post(
    `${ORDERS_PATH}/:orderNumber/refunds/:refundId/complete`,
    requirePermission("orders.cancelRefund"),
    validate({ params: refundParams, body: completeBody }),
    handle(async (req, res) => {
      const { params, body } = input<
        z.infer<typeof completeBody>,
        z.infer<typeof refundParams>
      >(res);
      const o = await findOrder(params.orderNumber);
      await deps.db.$transaction(async (tx) => {
        await lockOrder(tx, o.id);
        const r = await tx.refund.findFirst({
          where: { id: params.refundId, payment: { orderId: o.id } },
          include: { payment: { include: { refunds: true } } },
        });
        if (!r) throw new AppError("NOT_FOUND");
        if (r.status !== "PENDING")
          throw new AppError("CONFLICT", { reason: "ALREADY_COMPLETED" });
        await tx.refund.update({
          where: { id: r.id },
          data: {
            status: body.outcome,
            providerRefundId: body.reference ?? null,
          },
        });
        const others = r.payment.refunds.filter((x) => x.id !== r.id);
        const pending = others.some((x) => x.status === "PENDING");
        const refunded =
          others
            .filter((x) => x.status === "REFUNDED")
            .reduce((n, x) => n + x.amountPaise, 0) +
          (body.outcome === "REFUNDED" ? r.amountPaise : 0);
        const status = pending
          ? "REFUND_PENDING"
          : body.outcome === "FAILED" && refunded === 0
            ? "REFUND_FAILED"
            : refunded >= r.payment.amountPaise
              ? "REFUNDED"
              : r.payment.method === "COD"
                ? "COLLECTED"
                : "CAPTURED";
        await tx.payment.update({
          where: { id: r.paymentId },
          data: { status },
        });
        await audit(tx, req.ip, res, {
          action: "order.refund_completed",
          entityId: o.id,
          after: { refundId: r.id, outcome: body.outcome },
        });
      });
      res.json({ ok: true });
    }),
  );

  router.post(
    `${ORDERS_PATH}/:orderNumber/restock`,
    // Return to origin: restock on receipt (O M F); a customer return after
    // inspection: O M (system-design.md §5).
    requirePermission("orders.fulfil"),
    validate({ params: orderParams, body: restockBody }),
    handle(async (req, res) => {
      const { params, body } = input<
        z.infer<typeof restockBody>,
        z.infer<typeof orderParams>
      >(res);
      const o = await findOrder(params.orderNumber);
      if (o.status !== "RETURNED" && o.status !== "RETURN_TO_ORIGIN")
        throw new AppError("INVALID_TRANSITION", {
          from: o.status,
          action: "restock",
        });
      if (
        o.status === "RETURNED" &&
        !can(staff(res).role, "orders.cancelRefund")
      )
        throw new AppError("FORBIDDEN");
      await deps.db.$transaction(async (tx) => {
        await lockOrder(tx, o.id);
        const items = await tx.orderItem.findMany({ where: { orderId: o.id } });
        for (const line of body.lines) {
          const item = items.find((i) => i.id === line.itemId);
          if (!item) throw new AppError("NOT_FOUND");
          const done = await tx.stockMovement.aggregate({
            where: {
              referenceType: "RETURN",
              referenceId: o.id,
              variantId: item.variantId,
            },
            _sum: { onHandDelta: true },
          });
          if ((done._sum.onHandDelta ?? 0) + line.quantity > item.quantity)
            throw new AppError("CONFLICT", {
              reason: "OVER_RESTOCK",
              itemId: item.id,
            });
          await tx.$executeRaw`UPDATE "inventory_level" SET "on_hand" = "on_hand" + ${line.quantity}, "version" = "version" + 1 WHERE "variant_id" = ${item.variantId}::uuid`;
          await tx.stockMovement.create({
            data: {
              variantId: item.variantId,
              type: "RESTOCKED",
              onHandDelta: line.quantity,
              reason: `Return of ${o.orderNumber} passed inspection`,
              referenceType: "RETURN",
              referenceId: o.id,
              actorAdminId: staff(res).id,
            },
          });
        }
        await audit(tx, req.ip, res, {
          action: "order.restocked",
          entityId: o.id,
          after: { lines: body.lines },
        });
      });
      res.json({ ok: true });
    }),
  );

  router.get(
    `${ORDERS_PATH}/:orderNumber/packing-slip`,
    requirePermission("orders.view"),
    validate({ params: orderParams }),
    handle(async (_req, res) => {
      const { params } = input<unknown, z.infer<typeof orderParams>>(res);
      const o = await deps.db.order.findUnique({
        where: { orderNumber: params.orderNumber },
        include: { items: { orderBy: { id: "asc" } } },
      });
      if (!o) throw new AppError("NOT_FOUND");
      res.json({
        packingSlip: {
          orderNumber: o.orderNumber,
          placedAt: o.placedAt.toISOString(),
          paymentMethod: o.paymentMethod,
          // COD: the courier collects this amount.
          collectPaise: o.paymentMethod === "COD" ? o.totalPaise : 0,
          shipTo: o.shippingAddress,
          phone: o.phone,
          items: o.items.map((i) => ({
            sku: i.sku,
            productName: i.productName,
            variantLabel: i.variantLabel,
            quantity: i.quantity,
          })),
        },
      });
    }),
  );

  return router;
}

/** Records a pending refund for an online payment on cancellation (UF-7). */
async function refundCaptured(
  tx: Prisma.TransactionClient,
  orderId: string,
  adminId: string,
) {
  const paid = await tx.payment.findFirst({
    where: { orderId, method: "PREPAID", status: "CAPTURED" },
  });
  if (!paid) return;
  await tx.refund.create({
    data: {
      paymentId: paid.id,
      amountPaise: paid.amountPaise,
      reason: "Order cancelled before dispatch",
      createdByAdminId: adminId,
    },
  });
  await tx.payment.update({
    where: { id: paid.id },
    data: { status: "REFUND_PENDING" },
  });
}
