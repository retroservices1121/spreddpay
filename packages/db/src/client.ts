import { PrismaClient, Prisma } from "@prisma/client";

/**
 * Tables that must never be destructively deleted: financial history, provider
 * events and the audit trail. The extension below turns any delete against them
 * into a hard error, so a stray `prisma.auditEvent.deleteMany()` in a future
 * feature fails in review rather than in production.
 *
 * `resetDemoData` in the seed package is the one sanctioned exception and it
 * uses a raw TRUNCATE against a demo database.
 */
export const APPEND_ONLY_MODELS = new Set([
  "AuditEvent",
  "WebhookEvent",
  "LedgerEntry",
  "LedgerPosting",
  "PayoutApproval",
  "ProviderTransfer",
  "CardTransaction",
  "Payout",
  "RevenueEvent",
  "BalanceSnapshot",
  "TraderIdentityStatus",
]);

export class AppendOnlyViolationError extends Error {
  constructor(model: string, operation: string) {
    super(
      `${model} is append-only; ${operation} is not permitted. Record a reversal or a status change instead.`,
    );
    this.name = "AppendOnlyViolationError";
  }
}

const DELETE_OPERATIONS = new Set(["delete", "deleteMany"]);

function buildClient() {
  const base = new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? [{ emit: "stdout", level: "warn" }, { emit: "stdout", level: "error" }]
        : [{ emit: "stdout", level: "error" }],
  });

  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (model && DELETE_OPERATIONS.has(operation) && APPEND_ONLY_MODELS.has(model)) {
            throw new AppendOnlyViolationError(model, operation);
          }
          return query(args);
        },
      },
    },
  });
}

export type Database = ReturnType<typeof buildClient>;

/**
 * Transaction client. Prisma's interactive-transaction callback receives a
 * narrower type than the extended client, so services accept this union.
 */
export type DatabaseTransaction = Omit<
  Database,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

const globalRef = globalThis as unknown as { __spreddpayDb?: Database };

/** Single shared client. Hot reload in dev would otherwise exhaust connections. */
export const db: Database = globalRef.__spreddpayDb ?? buildClient();

if (process.env.NODE_ENV !== "production") {
  globalRef.__spreddpayDb = db;
}

export { Prisma, PrismaClient };
