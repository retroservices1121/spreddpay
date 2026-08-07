/**
 * Tenant isolation.
 *
 * Every partner-scoped query goes through `forPartner()`, which returns a Prisma
 * client that injects `partnerId` into the where clause of reads and into the
 * data of writes. `findUnique` cannot take an extra predicate, so its result is
 * checked after the fact and nulled if it belongs to another tenant.
 *
 * The point is that forgetting a `where: { partnerId }` in a route handler is
 * not exploitable — the scoped client puts it back.
 */

import type { Database } from "./client";

/** Models carrying a partnerId column that the scoped client filters on. */
export const TENANT_SCOPED_MODELS = new Set([
  "PartnerBranding",
  "PartnerProgram",
  "PartnerUser",
  "Trader",
  "ProviderCustomer",
  "FinancialAccount",
  "BalanceSnapshot",
  "Card",
  "CardControl",
  "Payout",
  "PayoutApproval",
  "ProviderTransfer",
  "CardTransaction",
  "ManualOperation",
  "LedgerAccount",
  "LedgerEntry",
  "LedgerPosting",
  "RevenueRule",
  "RevenueEvent",
  "PartnerSettlement",
  "AuditEvent",
  "Notification",
  "ApiCredential",
  "PartnerWebhookEndpoint",
  "PartnerWebhookDelivery",
  "FeatureFlag",
  "SupportCase",
  "YieldAccount",
  "YieldTransaction",
  "YieldRevenueRule",
]);

const READ_MANY = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany",
]);

const READ_UNIQUE = new Set(["findUnique", "findUniqueOrThrow"]);
const WRITE_ONE = new Set(["create", "upsert"]);
const MUTATE_ONE = new Set(["update", "delete"]);

export class CrossTenantAccessError extends Error {
  constructor(model: string, partnerId: string) {
    super(`Record in ${model} does not belong to partner ${partnerId}.`);
    this.name = "CrossTenantAccessError";
  }
}

type AnyArgs = Record<string, unknown>;

/** Minimal shape of a Prisma model delegate, for the pre-mutation ownership read. */
interface DelegateLike {
  findUnique?: (args: {
    where: unknown;
    select: { partnerId: true };
  }) => Promise<{ partnerId?: string } | null>;
}

function mergeWhere(args: AnyArgs, partnerId: string): AnyArgs {
  const where = (args.where ?? {}) as AnyArgs;
  return { ...args, where: { ...where, partnerId } };
}

/**
 * Returns a client permanently scoped to one partner. Non-tenant models
 * (Partner itself, PlatformUser, WebhookEvent, Session, …) pass through
 * untouched — callers that need them use the unscoped client deliberately.
 */
export function forPartner(client: Database, partnerId: string) {
  if (!partnerId) {
    throw new Error("forPartner() requires a partnerId.");
  }

  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          const typedArgs = (args ?? {}) as AnyArgs;

          if (READ_MANY.has(operation)) {
            return query(mergeWhere(typedArgs, partnerId));
          }

          if (WRITE_ONE.has(operation)) {
            const next: AnyArgs = { ...typedArgs };
            if (next.data && typeof next.data === "object") {
              next.data = { ...(next.data as AnyArgs), partnerId };
            }
            if (next.create && typeof next.create === "object") {
              next.create = { ...(next.create as AnyArgs), partnerId };
            }
            if (operation === "upsert") {
              return query(mergeWhere(next, partnerId));
            }
            return query(next);
          }

          if (MUTATE_ONE.has(operation)) {
            // `where` on update/delete accepts only unique fields, so the
            // partnerId cannot be merged in. Ownership is therefore checked
            // with a separate read *before* the mutation runs — checking
            // afterwards would mean the write had already landed, and throwing
            // at that point does not undo it.
            const modelKey = model.charAt(0).toLowerCase() + model.slice(1);
            const delegate = (client as unknown as Record<string, DelegateLike>)[modelKey];

            if (delegate?.findUnique) {
              const existing = await delegate.findUnique({
                where: typedArgs.where,
                select: { partnerId: true },
              });
              if (existing && existing.partnerId !== partnerId) {
                throw new CrossTenantAccessError(model, partnerId);
              }
            }
            return query(typedArgs);
          }

          if (READ_UNIQUE.has(operation)) {
            // A read cannot corrupt anything, so filtering the result is safe.
            // Returning null rather than throwing avoids confirming that a row
            // exists under another tenant.
            const result = (await query(typedArgs)) as { partnerId?: string } | null;
            if (result && result.partnerId !== undefined && result.partnerId !== partnerId) {
              return null;
            }
            return result;
          }

          return query(args);
        },
      },
    },
  });
}

export type TenantDatabase = ReturnType<typeof forPartner>;

/** Guard for records fetched outside a scoped client. */
export function assertTenantOwned<T extends { partnerId: string }>(
  record: T | null | undefined,
  partnerId: string,
  model = "record",
): T {
  if (!record || record.partnerId !== partnerId) {
    throw new CrossTenantAccessError(model, partnerId);
  }
  return record;
}
