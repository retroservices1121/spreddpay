/**
 * Notifications and outbound partner webhooks.
 *
 * In Milestone 1 emails are recorded, not sent: a Notification row is written
 * with status QUEUED and the worker's delivery step is a no-op logger. That
 * keeps the demo self-contained and means no provider account is needed to run
 * the platform, while the call sites are already correct for when an email
 * provider is wired in.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { PartnerWebhookEvent } from "@spreddpay/contracts";
import { decryptSecret } from "@spreddpay/auth";
import type { Database, DatabaseTransaction } from "@spreddpay/db";

export interface NotificationInput {
  partnerId?: string | null;
  traderId?: string | null;
  channel?: "EMAIL" | "IN_APP" | "WEBHOOK";
  template: string;
  subject: string;
  body: string;
  payload?: Record<string, unknown> | null;
}

export async function queueNotification(
  tx: DatabaseTransaction,
  input: NotificationInput,
): Promise<void> {
  await tx.notification.create({
    data: {
      partnerId: input.partnerId ?? null,
      traderId: input.traderId ?? null,
      channel: input.channel ?? "IN_APP",
      status: "QUEUED",
      template: input.template,
      subject: input.subject,
      body: input.body,
      payload: (input.payload ?? undefined) as object | undefined,
    },
  });
}

// -------------------------------------------------------- partner webhooks

/**
 * Queue an event for every partner endpoint subscribed to it. Delivery, retry
 * and replay are the worker's job — this only records the intent, inside the
 * caller's transaction, so an event is never lost because HTTP was slow.
 */
export async function queuePartnerWebhook(
  tx: DatabaseTransaction,
  input: {
    partnerId: string;
    eventType: PartnerWebhookEvent;
    payload: Record<string, unknown>;
  },
): Promise<number> {
  const endpoints = await tx.partnerWebhookEndpoint.findMany({
    where: { partnerId: input.partnerId, active: true },
    select: { id: true, events: true },
  });

  const matching = endpoints.filter(
    (endpoint) => endpoint.events.length === 0 || endpoint.events.includes(input.eventType),
  );

  for (const endpoint of matching) {
    await tx.partnerWebhookDelivery.create({
      data: {
        endpointId: endpoint.id,
        partnerId: input.partnerId,
        eventType: input.eventType,
        payload: input.payload as object,
        nextAttemptAt: new Date(),
      },
    });
  }

  return matching.length;
}

export interface SignedWebhookRequest {
  url: string;
  body: string;
  headers: Record<string, string>;
}

/**
 * Sign an outbound partner webhook. The signature covers `timestamp.body` so a
 * captured request cannot be replayed against a different moment.
 */
export function signPartnerWebhook(
  secret: string,
  body: string,
  timestamp: number = Math.floor(Date.now() / 1000),
): { signature: string; timestamp: number } {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return { signature, timestamp };
}

export function verifyPartnerWebhookSignature(
  secret: string,
  body: string,
  timestamp: number,
  signature: string,
  toleranceSeconds = 300,
): boolean {
  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (age > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export async function buildDeliveryRequest(
  db: Database,
  deliveryId: string,
  encryptionKey: string,
): Promise<SignedWebhookRequest | null> {
  const delivery = await db.partnerWebhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { endpoint: true },
  });
  if (!delivery || !delivery.endpoint.active) return null;

  const secret = decryptSecret(delivery.endpoint.secretCipher, encryptionKey);
  const body = JSON.stringify({
    id: delivery.id,
    type: delivery.eventType,
    createdAt: delivery.createdAt.toISOString(),
    data: delivery.payload,
  });
  const { signature, timestamp } = signPartnerWebhook(secret, body);

  return {
    url: delivery.endpoint.url,
    body,
    headers: {
      "content-type": "application/json",
      "x-spreddpay-event": delivery.eventType,
      "x-spreddpay-delivery": delivery.id,
      "x-spreddpay-timestamp": String(timestamp),
      "x-spreddpay-signature": signature,
    },
  };
}

/** Exponential backoff with a 6-hour ceiling: 1m, 5m, 25m, 2h, 6h, 6h… */
export function nextRetryDelayMs(attempts: number): number {
  const base = 60_000;
  const delay = base * 5 ** Math.max(0, attempts - 1);
  return Math.min(delay, 6 * 60 * 60 * 1000);
}

// ------------------------------------------------------------- templates

export const TEMPLATES = {
  traderInvited: (input: { productName: string; firstName: string; url: string }) => ({
    template: "trader.invited",
    subject: `Set up your ${input.productName} account`,
    body: `Hi ${input.firstName},\n\nYour ${input.productName} account is ready to set up. Get started here: ${input.url}\n`,
  }),
  payoutCompleted: (input: { productName: string; amount: string }) => ({
    template: "payout.completed",
    subject: `${input.amount} is ready to spend`,
    body: `Your payout of ${input.amount} is now available on your ${input.productName} card.\n`,
  }),
  payoutFailed: (input: { reference: string; reason: string }) => ({
    template: "payout.failed",
    subject: `Payout ${input.reference} could not be completed`,
    body: `Payout ${input.reference} failed: ${input.reason}. The operations team has been notified.\n`,
  }),
  payoutAwaitingApproval: (input: { reference: string; amount: string; createdBy: string }) => ({
    template: "payout.awaiting_approval",
    subject: `Approval needed: ${input.amount}`,
    body: `${input.createdBy} created payout ${input.reference} for ${input.amount}. It needs a second approver before it can be released.\n`,
  }),
  cardIssued: (input: { productName: string; last4: string }) => ({
    template: "card.issued",
    subject: `Your ${input.productName} card is active`,
    body: `Your virtual card ending ${input.last4} is active and ready to use.\n`,
  }),
} as const;
