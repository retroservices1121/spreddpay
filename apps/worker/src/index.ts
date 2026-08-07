/**
 * SpreddPay worker.
 *
 * With REDIS_URL set it runs the jobs on BullMQ repeatable schedules. Without
 * it, it falls back to an in-process interval loop — which is what makes the
 * demo runnable with nothing but a Postgres connection string.
 */

import { loadServerEnv } from "@spreddpay/config";
import { db } from "@spreddpay/db";
import { createRainService } from "@spreddpay/rain";
import pino from "pino";
import {
  deliverPartnerWebhooks,
  dispatchNotifications,
  processWebhookEvents,
  reconcileLedgers,
  sweepExpired,
  syncProviderBalances,
  type JobDeps,
} from "./jobs";

const env = loadServerEnv();
const log = pino({ level: env.NODE_ENV === "production" ? "info" : "debug" });

const deps: JobDeps = {
  db,
  rain: createRainService({
    mode: env.RAIN_MODE,
    baseUrl: env.RAIN_API_BASE_URL,
    apiKey: env.RAIN_API_KEY,
    programId: env.RAIN_PROGRAM_ID,
    webhookSecret: env.RAIN_WEBHOOK_SECRET,
  }),
  encryptionKey: env.ENCRYPTION_KEY,
  log,
};

interface ScheduledJob {
  name: string;
  everyMs: number;
  run: () => Promise<unknown>;
}

const JOBS: ScheduledJob[] = [
  { name: "process-webhook-events", everyMs: 5_000, run: () => processWebhookEvents(deps) },
  { name: "deliver-partner-webhooks", everyMs: 10_000, run: () => deliverPartnerWebhooks(deps) },
  { name: "dispatch-notifications", everyMs: 15_000, run: () => dispatchNotifications(deps) },
  { name: "sync-provider-balances", everyMs: 60_000, run: () => syncProviderBalances(deps) },
  { name: "reconcile-ledgers", everyMs: 300_000, run: () => reconcileLedgers(deps) },
  { name: "sweep-expired", everyMs: 3_600_000, run: () => sweepExpired(deps) },
];

async function runWithRedis(redisUrl: string): Promise<void> {
  const { Queue, Worker } = await import("bullmq");
  const IORedis = (await import("ioredis")).default;

  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue("spreddpay", { connection });

  for (const job of JOBS) {
    await queue.upsertJobScheduler(job.name, { every: job.everyMs }, { name: job.name });
  }

  const worker = new Worker(
    "spreddpay",
    async (job) => {
      const definition = JOBS.find((candidate) => candidate.name === job.name);
      if (!definition) {
        log.warn({ name: job.name }, "no handler for job");
        return;
      }
      return definition.run();
    },
    { connection, concurrency: 4 },
  );

  worker.on("failed", (job, error) => {
    log.error({ job: job?.name, err: error.message }, "job failed");
  });

  log.info({ jobs: JOBS.map((job) => job.name) }, "worker running on BullMQ");

  const shutdown = async () => {
    await worker.close();
    await queue.close();
    await connection.quit();
    await db.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

/**
 * In-process fallback. Each job is guarded against overlapping runs, so a slow
 * pass never stacks up behind itself.
 */
function runInProcess(): void {
  log.info({ jobs: JOBS.map((job) => job.name) }, "worker running in-process (REDIS_URL not set)");

  const running = new Set<string>();

  for (const job of JOBS) {
    const tick = async () => {
      if (running.has(job.name)) return;
      running.add(job.name);
      try {
        await job.run();
      } catch (error) {
        log.error(
          { job: job.name, err: error instanceof Error ? error.message : "unknown" },
          "job failed",
        );
      } finally {
        running.delete(job.name);
      }
    };

    setInterval(() => void tick(), job.everyMs).unref();
    void tick();
  }

  const shutdown = async () => {
    await db.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  // Hold the process open; the intervals are unref'd so this is the anchor.
  setInterval(() => undefined, 1 << 30);
}

async function main(): Promise<void> {
  if (env.REDIS_URL) {
    await runWithRedis(env.REDIS_URL);
  } else {
    runInProcess();
  }
}

main().catch((error) => {
  log.error({ err: error instanceof Error ? error.message : error }, "worker failed to start");
  process.exit(1);
});
