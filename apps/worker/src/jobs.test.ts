/**
 * Concurrency safety for the worker queues, proved against a real database.
 *
 * The bug this guards against: a `findMany` followed by an `update` leaves a
 * window where a second replica reads the same rows, so both process the same
 * event. That is invisible with one replica and produces duplicate webhook
 * deliveries the moment someone scales the service — exactly the reflex people
 * have under load.
 *
 * The assertion is *disjointness*, not "this process claimed everything". A
 * deployed worker shares this database and will happily take rows out of the
 * queue mid-test; that is not a failure, it is the property working. Asserting
 * on totals would make this test fail whenever the platform is actually
 * running, which is precisely when it matters.
 *
 * Skipped when DATABASE_URL is unset so `pnpm test` works on a fresh clone.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@spreddpay/db";
import { claimNotifications, claimWebhookEvents, type JobDeps } from "./jobs";

const hasDatabase = Boolean(process.env.DATABASE_URL);

const deps = {
  db,
  rain: null as never,
  encryptionKey: "0".repeat(64),
  log: { info: () => undefined, error: () => undefined },
} as unknown as JobDeps;

describe.skipIf(!hasDatabase)("worker queue claiming (database)", () => {
  const tag = `concurrency-test-${process.env.VITEST_WORKER_ID ?? "0"}`;

  const cleanup = async () => {
    await db.$executeRawUnsafe(
      `DELETE FROM "WebhookEvent" WHERE "providerEventId" LIKE $1`,
      `${tag}%`,
    );
    await db.$executeRawUnsafe(`DELETE FROM "Notification" WHERE template = $1`, tag);
  };

  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await db.$disconnect();
  });

  it("never hands the same webhook event to two concurrent claimers", async () => {
    const total = 24;
    for (let i = 0; i < total; i += 1) {
      await db.webhookEvent.create({
        data: {
          provider: "RAIN",
          providerEventId: `${tag}-${i}`,
          eventType: "ping",
          status: "RECEIVED",
          signatureValid: true,
          payload: { i },
        },
      });
    }

    // Four claimers racing, which is what more than one replica means.
    const batches = await Promise.all([
      claimWebhookEvents(deps, 10),
      claimWebhookEvents(deps, 10),
      claimWebhookEvents(deps, 10),
      claimWebhookEvents(deps, 10),
    ]);

    const ids = batches.flat().map((row) => row.id);
    // The property: no id appears in two batches.
    expect(new Set(ids).size).toBe(ids.length);

    // And no row was claimed twice by anyone, including a live worker sharing
    // this database — the claim increments attempts, so a second claim shows 2.
    const rows = await db.webhookEvent.findMany({
      where: { providerEventId: { startsWith: tag } },
      select: { attempts: true },
    });
    expect(rows).toHaveLength(total);
    expect(rows.filter((r) => r.attempts > 1)).toHaveLength(0);
  });

  it("never hands the same notification to two concurrent claimers", async () => {
    const total = 20;
    for (let i = 0; i < total; i += 1) {
      await db.notification.create({
        data: {
          channel: "IN_APP",
          status: "QUEUED",
          template: tag,
          subject: `subject ${i}`,
          body: "body",
        },
      });
    }

    const batches = await Promise.all([
      claimNotifications(deps, 8),
      claimNotifications(deps, 8),
      claimNotifications(deps, 8),
    ]);

    const ids = batches.flat().map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);

    // A claimed notification is never left QUEUED for someone else to re-send.
    const stillQueuedAmongClaimed = await db.notification.count({
      where: { id: { in: ids }, status: "QUEUED" },
    });
    expect(stillQueuedAmongClaimed).toBe(0);
  });
});
