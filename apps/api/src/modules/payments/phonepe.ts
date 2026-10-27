// PhonePe Payment Gateway, Standard Checkout API v2 (D-195; phase-18-plan.md).
// Endpoints, fields and the webhook check follow PhonePe's official Node SDK
// (`@phonepe-pg/pg-sdk-node` 2.0.6, read, not installed): an OAuth token from
// client credentials, a hosted payment page per merchant order, order and
// refund status, and webhooks whose Authorization header is the SHA-256 of
// "username:password" set on the PhonePe dashboard. Plain `fetch`, no SDK.
//
// One merchant order per payment attempt: `providerPaymentId` is the
// merchantOrderId we send. Refunds use our refund row ID as merchantRefundId,
// so a repeated request is the same refund at PhonePe.
import { createHash, timingSafeEqual } from "node:crypto";

import {
  InvalidWebhook,
  type PaymentProvider,
  type ProviderPaymentStatus,
  type RefundResult,
  type WebhookEvent,
} from "./provider.ts";

export const PHONEPE_HOSTS = {
  sandbox: {
    oauth: "https://api-preprod.phonepe.com/apis/pg-sandbox",
    pg: "https://api-preprod.phonepe.com/apis/pg-sandbox",
  },
  production: {
    oauth: "https://api.phonepe.com/apis/identity-manager",
    pg: "https://api.phonepe.com/apis/pg",
  },
} as const;

export type PhonePeConfig = {
  readonly env: "sandbox" | "production";
  readonly clientId: string;
  readonly clientSecret: string;
  readonly clientVersion: string;
  readonly webhookUsername: string;
  readonly webhookPassword: string;
  /** Where PhonePe sends the shopper back: the storefront origin. */
  readonly storefrontOrigin: string;
  /** Minutes the payment page stays open; the stock hold length. */
  readonly expireAfterMinutes: number;
};

type Fetch = typeof fetch;

/** A PhonePe call that failed; the message never carries credentials. */
export class PhonePeError extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(status: number, code: string | null, operation: string) {
    super(`PhonePe ${operation} failed (${status}${code ? ` ${code}` : ""})`);
    this.name = "PhonePeError";
    this.status = status;
    this.code = code;
  }
}

const MERCHANT_ID = /[^A-Za-z0-9_-]/g;

/** The merchantOrderId for one payment attempt: at most 63 characters. */
export function merchantOrderId(orderNumber: string, paymentId: string) {
  const order = orderNumber.replace(MERCHANT_ID, "-").slice(0, 30);
  return `${order}_${paymentId.replace(MERCHANT_ID, "")}`.slice(0, 63);
}

/** PhonePe's hosted page lives on a phonepe.com host, over https. */
export function isPhonePeUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "phonepe.com" || url.hostname.endsWith(".phonepe.com"))
    );
  } catch {
    return false;
  }
}

const ORDER_STATE: Record<string, ProviderPaymentStatus> = {
  PENDING: "CREATED",
  COMPLETED: "CAPTURED",
  FAILED: "FAILED",
};

const REFUND_STATE: Record<string, RefundResult["status"]> = {
  PENDING: "PENDING",
  CONFIRMED: "PENDING",
  ACCEPTED: "PENDING",
  COMPLETED: "REFUNDED",
  FAILED: "FAILED",
};

// Webhook names: the documented dotted event names and the SDK's enum names.
const EVENTS: Record<string, WebhookEvent["type"]> = {
  "checkout.order.completed": "payment.captured",
  CHECKOUT_ORDER_COMPLETED: "payment.captured",
  "checkout.order.failed": "payment.failed",
  CHECKOUT_ORDER_FAILED: "payment.failed",
  "pg.refund.completed": "refund.completed",
  PG_REFUND_COMPLETED: "refund.completed",
  "pg.refund.failed": "refund.failed",
  PG_REFUND_FAILED: "refund.failed",
};

export function createPhonePeProvider(
  config: PhonePeConfig,
  options: { fetch?: Fetch; nowSeconds?: () => number } = {},
): PaymentProvider {
  const http = options.fetch ?? fetch;
  const nowSeconds =
    options.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
  const hosts = PHONEPE_HOSTS[config.env];
  const expectedAuth = createHash("sha256")
    .update(`${config.webhookUsername}:${config.webhookPassword}`)
    .digest("hex");

  let token: { header: string; refreshAt: number } | null = null;
  let pending: Promise<string> | null = null;

  async function fetchToken(): Promise<string> {
    const res = await http(`${hosts.oauth}/v1/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        client_version: config.clientVersion,
        grant_type: "client_credentials",
      }).toString(),
    });
    const body = await readJson(res);
    if (!res.ok || typeof body.access_token !== "string")
      throw new PhonePeError(res.status, codeOf(body), "token");
    const issued = Number(body.issued_at) || nowSeconds();
    const expires = Number(body.expires_at) || issued + 3600;
    const type =
      typeof body.token_type === "string" ? body.token_type : "O-Bearer";
    // Renewed half-way through its life, as the SDK does.
    token = {
      header: `${type} ${body.access_token}`,
      refreshAt: issued + Math.floor((expires - issued) / 2),
    };
    return token.header;
  }

  async function authHeader(force = false): Promise<string> {
    if (!force && token && nowSeconds() < token.refreshAt) return token.header;
    // One token request at a time; concurrent callers share it.
    pending ??= fetchToken().finally(() => {
      pending = null;
    });
    return pending;
  }

  async function call(
    operation: string,
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<Record<string, unknown>> {
    for (const retry of [false, true]) {
      const res = await http(`${hosts.pg}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: await authHeader(retry),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      // An expired or revoked token: fetch a new one once, then retry.
      if (res.status === 401 && !retry) continue;
      const json = await readJson(res);
      if (!res.ok) throw new PhonePeError(res.status, codeOf(json), operation);
      return json;
    }
    throw new PhonePeError(401, null, operation);
  }

  return {
    name: "phonepe",
    gatewayRefunds: true,

    async createPayment({ orderNumber, amountPaise, idempotencyKey }) {
      const id = merchantOrderId(orderNumber, idempotencyKey);
      const res = await call("pay", "POST", "/checkout/v2/pay", {
        merchantOrderId: id,
        amount: amountPaise,
        expireAfter: config.expireAfterMinutes * 60,
        paymentFlow: {
          type: "PG_CHECKOUT",
          message: `Sanéa Pret order ${orderNumber}`,
          merchantUrls: {
            redirectUrl: `${config.storefrontOrigin}/orders/${encodeURIComponent(orderNumber)}`,
          },
        },
      });
      if (!isPhonePeUrl(res.redirectUrl))
        throw new PhonePeError(502, "REDIRECT_URL_INVALID", "pay");
      return {
        providerPaymentId: id,
        clientPayload: { provider: "phonepe", redirectUrl: res.redirectUrl },
      };
    },

    verifyWebhook(rawBody, headers): WebhookEvent {
      const given = headers.authorization;
      if (typeof given !== "string" || !/^[0-9a-f]{64}$/i.test(given.trim()))
        throw new InvalidWebhook("SIGNATURE_MISSING");
      if (
        !timingSafeEqual(
          Buffer.from(expectedAuth, "hex"),
          Buffer.from(given.trim().toLowerCase(), "hex"),
        )
      )
        throw new InvalidWebhook("SIGNATURE_MISMATCH");
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
      } catch {
        throw new InvalidWebhook("BODY_INVALID");
      }
      const name =
        typeof body.event === "string"
          ? body.event
          : typeof body.type === "string"
            ? body.type
            : null;
      const payload = body.payload as Record<string, unknown> | undefined;
      if (!name || !payload || typeof payload !== "object")
        throw new InvalidWebhook("BODY_INVALID");
      const type = EVENTS[name] ?? "ignored";
      const isRefund = type === "refund.completed" || type === "refund.failed";
      const orderRef = isRefund
        ? payload.originalMerchantOrderId
        : payload.merchantOrderId;
      const state = typeof payload.state === "string" ? payload.state : "";
      const amount = payload.amount;
      if (
        type !== "ignored" &&
        (typeof orderRef !== "string" ||
          typeof amount !== "number" ||
          !Number.isInteger(amount) ||
          (isRefund && typeof payload.merchantRefundId !== "string"))
      )
        throw new InvalidWebhook("BODY_INVALID");
      const reference = String(
        (isRefund ? payload.refundId : payload.orderId) ??
          orderRef ??
          "unknown",
      );
      return {
        // PhonePe sends no event ID; the event, its object and the state
        // identify it, so a replayed delivery is stored once.
        providerEventId: `${name}:${reference}:${state}`,
        type,
        providerPaymentId: typeof orderRef === "string" ? orderRef : "",
        ...(isRefund
          ? { providerRefundId: payload.merchantRefundId as string }
          : {}),
        amountPaise: typeof amount === "number" ? amount : 0,
        currency: "INR",
        ...(typeof payload.errorCode === "string"
          ? { failureCode: payload.errorCode }
          : {}),
        ...(typeof payload.detailedErrorCode === "string"
          ? { failureMessage: payload.detailedErrorCode }
          : {}),
        payload: body,
      };
    },

    async fetchStatus(providerPaymentId) {
      const res = await call(
        "order status",
        "GET",
        `/checkout/v2/order/${encodeURIComponent(providerPaymentId)}/status?details=false`,
      );
      return {
        status: ORDER_STATE[String(res.state)] ?? "CREATED",
        amountPaise: typeof res.amount === "number" ? res.amount : null,
      };
    },

    async refund({ providerPaymentId, refundId, amountPaise }) {
      const res = await call("refund", "POST", "/payments/v2/refund", {
        merchantRefundId: refundId,
        originalMerchantOrderId: providerPaymentId,
        amount: amountPaise,
      });
      return {
        providerRefundId: refundId,
        status: REFUND_STATE[String(res.state)] ?? "PENDING",
      };
    },

    async fetchRefundStatus(refundId) {
      try {
        const res = await call(
          "refund status",
          "GET",
          `/payments/v2/refund/${encodeURIComponent(refundId)}/status`,
        );
        return REFUND_STATE[String(res.state)] ?? "PENDING";
      } catch (error) {
        // PhonePe never received it: the caller sends it again.
        if (error instanceof PhonePeError && error.status === 404)
          return "NOT_FOUND";
        throw error;
      }
    },
  };
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const body = (await res.json()) as unknown;
    return body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function codeOf(body: Record<string, unknown>): string | null {
  return typeof body.code === "string"
    ? body.code
    : typeof body.errorCode === "string"
      ? body.errorCode
      : null;
}
