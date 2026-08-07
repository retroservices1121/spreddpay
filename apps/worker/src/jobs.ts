/**
 * The recurring jobs. Each is a plain async function taking its dependencies,
 * so it can be driven by BullMQ, by the in-process scheduler, or directly from
 * a test without a Redis server in the loop.
 */

import { purgeExpiredSessions } from "@spreddpay/auth";
import { assertBooksBalance } from "@spreddpay/ledger";
import { buildDeliveryRequest, nextRetryDelayMs } from "@spreddpay/notifications";
import type { Database } from "@spreddpay/db";
import type { RainService } from "@spreddpay/rain";

export interface JobDeps {
  db: Database;
  rain: RainService;
  encryptionKey: string;
  log: { info: (obj: object, msg?: string) => void; error: (obj: object, msg?: string) => void };
}

/**
 * Process stored provider webhook events.
 *
 * Events are already persisted and signature-checked by the API. This step is
 * tolerant of retries and out-of-order delivery: it keys off the stored event
 * and every downstream write is itself idempotent, so replaying an event is a
 * no-op rather than a double posting.
 */
export async function processWebhookEvents(deps: JobDeps, limit = 50): Promise<number> {
  const events = await deps.db.webhookEvent.findMany({
    where: { status: "RECEIVED", signatureValid: true },
    orderBy: { receivedAt: "asc" },
    take: limit,
  });

  let processed = 0;

  for (const event of events) {
    await deps.db.webhookEvent.update({
      where: { id: event.id },
      data: { status: "PROCESSING", attempts: { increment: 1 } },
    });

    try {
      await handleRainEvent(deps, event.eventType, event.payload as Record<string, unknown>);
      await deps.db.webhookEvent.update({
        where: { id: event.id },
        data: { status: "PROCESSED", processedAt: new Date(), lastError: null },
      });
      processed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      deps.log.error({ eventId: event.id, err: message }, "webhook processing failed");
      await deps.db.webhookEvent.update({
        where: { id: event.id },
        data: { status: "FAILED", lastError: message },
      });
    }
  }

  return processed;
}

/**
 * Route a verified Rain event.
 *
 * The event *names* here are placeholders for Milestone 4: Rain's actual event
 * types come from the private dashboard documentation and get recorded in
 * docs/rain-webhooks.md. An unrecognised type is left for an operator rather
 * than guessed at, which is why the default branch throws.
 */
async function handleRainEvent(
  deps: JobDeps,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  switch (eventType) {
    case "ping":
      return;

    default:
      deps.log.info({ eventType, keys: Object.keys(payload) }, "unmapped rain event stored");
      throw new Error(
        `No handler for Rain event "${eventType}". Map it in docs/rain-webhooks.md before enabling processing.`,
      );
  }
}

/** Deliver queued partner webhooks with exponential backoff. */
export async function deliverPartnerWebhooks(deps: JobDeps, limit = 25): Promise<number> {
  const due = await deps.db.partnerWebhookDelivery.findMany({
    where: {
      deliveredAt: null,
      attempts: { lt: 8 },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let delivered = 0;

  for (const delivery of due) {
    const request = await buildDeliveryRequest(deps.db, delivery.id, deps.encryptionKey);
    if (!request) continue;

    const attempts = delivery.attempts + 1;

    try {
      const response = await fetch(request.url, {
        method: "POST",
        headers: request.headers,
        body: request.body,
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        await deps.db.partnerWebhookDelivery.update({
          where: { id: delivery.id },
          data: { attempts, responseCode: response.status, deliveredAt: new Date(), lastError: null },
        });
        delivered += 1;
      } else {
        await deps.db.partnerWebhookDelivery.update({
          where: { id: delivery.id },
          data: {
            attempts,
            responseCode: response.status,
            lastError: `HTTP ${response.status}`,
            nextAttemptAt: new Date(Date.now() + nextRetryDelayMs(attempts)),
          },
        });
      }
    } catch (error) {
      await deps.db.partnerWebhookDelivery.update({
        where: { id: delivery.id },
        data: {
          attempts,
          lastError: error instanceof Error ? error.message : "network error",
          nextAttemptAt: new Date(Date.now() + nextRetryDelayMs(attempts)),
        },
      });
    }
  }

  return delivered;
}

/**
 * Reconciliation: assert every partner's books balance and raise a manual
 * operation when they do not. The ledger is never silently corrected — an
 * imbalance is a human decision.
 */
export async function reconcileLedgers(deps: JobDeps): Promise<{ checked: number; failed: number }> {
  const partners = await deps.db.partner.findMany({ select: { id: true, displayName: true } });
  let failed = 0;

  for (const partner of partners) {
    try {
      await assertBooksBalance(deps.db, partner.id);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "unknown";

      const open = await deps.db.manualOperation.findFirst({
        where: { partnerId: partner.id, kind: "LEDGER_IMBALANCE", status: { in: ["OPEN", "IN_PROGRESS"] } },
      });
      if (!open) {
        await deps.db.manualOperation.create({
          data: {
            partnerId: partner.id,
            kind: "LEDGER_IMBALANCE",
            status: "OPEN",
            summary: `Ledger does not balance for ${partner.displayName}`,
            detail: message,
          },
        });
      }
      deps.log.error({ partnerId: partner.id, err: message }, "ledger imbalance");
    }
  }

  return { checked: partners.length, failed };
}

/** Refresh provider balances for every trader with an active account. */
export async function syncProviderBalances(deps: JobDeps, limit = 100): Promise<number> {
  const accounts = await deps.db.financialAccount.findMany({
    where: { provider: "RAIN", status: "ACTIVE" },
    take: limit,
  });

  let written = 0;
  for (const account of accounts) {
    try {
      const balances = await deps.rain.getBalances(account.providerAccountId);
      for (const balance of balances) {
        await deps.db.balanceSnapshot.create({
          data: {
            financialAccountId: account.id,
            partnerId: account.partnerId,
            traderId: account.traderId,
            asset: balance.asset,
            network: balance.network,
            availableMinor: balance.availableMinor,
            pendingMinor: balance.pendingMinor,
            reservedMinor: balance.reservedMinor,
            source: balance.source,
            asOf: balance.asOf,
          },
        });
        written += 1;
      }
    } catch (error) {
      deps.log.error(
        { accountId: account.id, err: error instanceof Error ? error.message : "unknown" },
        "balance sync failed",
      );
    }
  }

  return written;
}

/** Housekeeping: expired sessions and spent idempotency keys. */
export async function sweepExpired(deps: JobDeps): Promise<{ sessions: number; keys: number }> {
  const sessions = await purgeExpiredSessions(deps.db);
  const keys = await deps.db.idempotencyRecord.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return { sessions, keys: keys.count };
}

/**
 * Send queued notifications.
 *
 * Milestone 1 has no email provider wired in, so this marks rows as sent and
 * logs them. The call site is already correct; only the transport changes.
 */
export async function dispatchNotifications(deps: JobDeps, limit = 50): Promise<number> {
  const queued = await deps.db.notification.findMany({
    where: { status: "QUEUED" },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  for (const notification of queued) {
    deps.log.info(
      { template: notification.template, channel: notification.channel },
      "notification dispatched (no transport configured)",
    );
    await deps.db.notification.update({
      where: { id: notification.id },
      data: { status: "SENT", sentAt: new Date() },
    });
  }

  return queued.length;
}
