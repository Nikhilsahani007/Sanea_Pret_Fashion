// The payment provider interface (system-design.md §6.1). Release one ships
// only the mock; live gateways are added behind this interface in Phase 18
// after approval (OD-06). Card data never reaches Sanéa Pret servers.

export type ProviderPaymentStatus =
  "CREATED" | "AUTHORISED" | "CAPTURED" | "FAILED" | "EXPIRED";

/** A verified provider event, reduced to what the payment pipeline needs. */
export type WebhookEvent = {
  readonly providerEventId: string;
  readonly type: "payment.captured" | "payment.failed";
  readonly providerPaymentId: string;
  readonly amountPaise: number;
  readonly currency: string;
  readonly failureCode?: string;
  readonly failureMessage?: string;
  /** The parsed body, stored as received (PaymentEvent.rawPayload). */
  readonly payload: unknown;
};

export type RefundResult = {
  readonly providerRefundId: string;
  readonly status: "PENDING" | "REFUNDED" | "FAILED";
};

export interface PaymentProvider {
  readonly name: "mock";
  createPayment(input: {
    orderNumber: string;
    amountPaise: number;
    idempotencyKey: string;
  }): Promise<{ providerPaymentId: string; clientPayload: unknown }>;
  /** Throws `InvalidWebhook` unless the body is authentic. */
  verifyWebhook(
    rawBody: Buffer,
    headers: Readonly<Record<string, string | string[] | undefined>>,
  ): WebhookEvent;
  fetchStatus(providerPaymentId: string): Promise<ProviderPaymentStatus>;
  refund(input: {
    providerPaymentId: string;
    amountPaise: number;
    reason: string;
  }): Promise<RefundResult>;
}

export class InvalidWebhook extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "InvalidWebhook";
  }
}
