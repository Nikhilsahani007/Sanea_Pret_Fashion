// Request schemas for the admin inventory API (phase-9-plan.md §3.4, Q9-2,
// Q9-4). Strict: unknown fields are rejected; numbers and text are bounded.
import { z } from "zod";

export const variantParams = z.strictObject({ variantId: z.uuid() });

const reason = z.string().trim().min(3).max(200);

export const adjustmentBody = z
  .strictObject({
    type: z.enum(["RECEIVED", "ADJUSTMENT", "CORRECTION"]),
    delta: z
      .number()
      .int()
      .min(-10_000)
      .max(10_000)
      .refine((d) => d !== 0, { error: "INVALID" }),
    reason: reason.optional(),
  })
  .superRefine((b, ctx) => {
    if (b.type === "RECEIVED" && b.delta < 0)
      ctx.addIssue({ code: "custom", path: ["delta"], message: "INVALID" });
    if (b.type !== "RECEIVED" && !b.reason)
      ctx.addIssue({ code: "custom", path: ["reason"], message: "REQUIRED" });
  });

export const thresholdBody = z.strictObject({
  lowStockThreshold: z.number().int().min(0).max(1000),
});

export const stockQuery = z.strictObject({
  lowStock: z.enum(["true", "false"]).optional(),
  sku: z.string().trim().min(1).max(40).optional(),
  productId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z
    .string()
    .regex(/^[A-Z0-9][A-Z0-9-]{2,39}$/)
    .optional(),
});

export const movementQuery = z
  .strictObject({
    variantId: z.uuid().optional(),
    type: z
      .enum([
        "RECEIVED",
        "ADJUSTMENT",
        "RESERVED",
        "RELEASED",
        "SHIPPED",
        "RETURNED",
        "RESTOCKED",
        "CORRECTION",
      ])
      .optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.uuid().optional(),
  })
  .refine((q) => !q.from || !q.to || new Date(q.to) > new Date(q.from), {
    error: "INVALID",
    path: ["to"],
  });
