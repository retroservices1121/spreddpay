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

          if (MUTATE_ONE.has(operation) || READ_UNIQUE.has(operation)) {
            // `where` on these accepts only unique fields, so filter after.
            const result = (await query(typedArgs)) as { partnerId?: string } | null;
            if (result && result.partnerId !== undefined && result.partnerId !== partnerId) {
              if (READ_UNIQUE.has(operation)) return null;
              throw new CrossTenantAccessError(model, partnerId);
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
