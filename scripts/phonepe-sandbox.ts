// PhonePe sandbox check (Phase 18 verification, D-195). Runs the adapter
// against PhonePe's sandbox with your sandbox credentials from .env:
//
//   npm run phonepe:sandbox            # one payment, then its refund
//
// 1. Gets a token and opens a ₹1 payment; prints PhonePe's page.
// 2. Open it and pay or decline with PhonePe's sandbox instruments.
// 3. Polls the order status until PhonePe reports COMPLETED or FAILED.
// 4. After a success, refunds it in full and polls the refund status.
// Webhook delivery and replay are checked from PhonePe's dashboard against a
// reachable API (phase-18-plan.md §4). Refuses PHONEPE_ENV=production.
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { createPhonePeProvider } from "../apps/api/src/modules/payments/phonepe.ts";

if (existsSync(".env")) process.loadEnvFile(".env");
const env = process.env;
if ((env.PHONEPE_ENV ?? "sandbox") !== "sandbox") {
  process.stderr.write("This check runs against the PhonePe sandbox only.\n");
  process.exit(1);
}
const missing = [
  "PHONEPE_CLIENT_ID",
  "PHONEPE_CLIENT_SECRET",
  "PHONEPE_WEBHOOK_USERNAME",
  "PHONEPE_WEBHOOK_PASSWORD",
].filter((k) => !env[k]);
if (missing.length) {
  process.stderr.write(`Set in .env: ${missing.join(", ")}\n`);
  process.exit(1);
}

const provider = createPhonePeProvider({
  env: "sandbox",
  clientId: env.PHONEPE_CLIENT_ID!,
  clientSecret: env.PHONEPE_CLIENT_SECRET!,
  clientVersion: env.PHONEPE_CLIENT_VERSION || "1",
  webhookUsername: env.PHONEPE_WEBHOOK_USERNAME!,
  webhookPassword: env.PHONEPE_WEBHOOK_PASSWORD!,
  storefrontOrigin: env.STOREFRONT_ORIGIN || "http://localhost:5173",
  expireAfterMinutes: 15,
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const orderNumber = `SANDBOX-${Date.now()}`;
const { providerPaymentId, clientPayload } = await provider.createPayment({
  orderNumber,
  amountPaise: 100,
  idempotencyKey: randomUUID(),
});
const page = (clientPayload as { redirectUrl: string }).redirectUrl;
process.stdout.write(
  `Payment ${providerPaymentId} opened.\nPay or decline it here:\n${page}\n\nWaiting for PhonePe…\n`,
);

let status = "CREATED";
for (let i = 0; i < 120 && status === "CREATED"; i++) {
  await wait(5000);
  status = (await provider.fetchStatus(providerPaymentId)).status;
}
process.stdout.write(`Order status: ${status}\n`);
if (status !== "CAPTURED") process.exit(status === "FAILED" ? 0 : 1);

const refundId = randomUUID();
const refund = await provider.refund({
  providerPaymentId,
  refundId,
  amountPaise: 100,
  reason: "Sandbox check",
});
process.stdout.write(`Refund ${refundId}: ${refund.status}\n`);
let refundStatus: string = refund.status;
for (let i = 0; i < 60 && refundStatus === "PENDING"; i++) {
  await wait(5000);
  refundStatus = await provider.fetchRefundStatus(refundId);
}
process.stdout.write(`Refund status: ${refundStatus}\n`);
process.exit(refundStatus === "REFUNDED" ? 0 : 1);
