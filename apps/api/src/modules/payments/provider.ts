// The payment provider interface (system-design.md §6.1): the mock for
// development and tests (D-107) and PhonePe (D-195, Phase 18). Card data never
// reaches Sanéa Pret servers.

export type ProviderPaymentStatus =
  "CREATED" | "AUTHORISED" | "CAPTURED" | "FAILED" | "EXPIRED";

/** A verified provider event, reduced to what the payment pipeline needs. */
export type WebhookEvent = {
  readonly providerEventId: string;
  readonly type:
    | "payment.captured"
    | "payment.failed"
    | "refund.completed"
    | "refund.failed"
    /** Authentic, but nothing to apply (a single failed attempt, for example). */
    | "ignored";
  /** The payment this event is about; for a refund, the refunded payment. */
  readonly providerPaymentId: string;
  /** Refund events: our refund row ID, sent to the gateway as its refund ID. */
  readonly providerRefundId?: string;
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

export type GatewayRefundStatus = RefundResult["status"] | "NOT_FOUND";

export interface PaymentProvider {
  readonly name: "mock" | "phonepe";
  /**
   * True: refunds are sent to the gateway and settle from its answer
   * (PhonePe). False: staff pay them outside the system and record the
   * outcome (the mock, UF-7).
   */
  readonly gatewayRefunds: boolean;
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
  /** What the gateway says now; the amount when it reports one. */
  fetchStatus(providerPaymentId: string): Promise<{
    status: ProviderPaymentStatus;
    amountPaise: number | null;
  }>;
  /** Idempotent by `refundId`: the same ID is the same refund. */
  refund(input: {
    providerPaymentId: string;
    refundId: string;
    amountPaise: number;
    reason: string;
  }): Promise<RefundResult>;
  fetchRefundStatus(refundId: string): Promise<GatewayRefundStatus>;
}

export class InvalidWebhook extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "InvalidWebhook";
  }
}
