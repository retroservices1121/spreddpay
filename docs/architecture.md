# Architecture

## Shape

```text
Partner Portal (:3002) ─┐
Trader Portal  (:3001) ─┼─> SpreddPay API (:4000) ─> PostgreSQL / Redis / Worker
Admin Portal   (:3003) ─┘                             |
                                                      ├─> Rain APIs
                                                      └─> Blend APIs (Phase 2)
```

`apps/landing` is the marketing site at spreddpay.com. It is dependency-free by
design and deploys independently of the platform.

## Who owns what

| Concern | Source of truth |
| --- | --- |
| Rain account, card, balance, transaction state | Rain |
| Blend account and yield state (Phase 2) | Blend |
| Tenancy, partner workflow, approvals, internal reporting, revenue allocation, audit history | SpreddPay |

The internal ledger is for workflow and reporting. It is reconciled against
provider balances; it never replaces them, and it makes no custody claim.

## Packages

| Package | Responsibility |
| --- | --- |
| `config` | Zod-validated environment, shared tsconfig, Tailwind preset, constants |
| `contracts` | Domain vocabulary, exact-money helpers, state machines, permission matrix, API schemas |
| `db` | Prisma schema and client, tenant-scoped client, audit writer |
| `auth` | Password hashing, secret encryption, sessions, principals, RBAC guards |
| `ledger` | Double-entry journal and the named recipes for each business event |
| `rain` | Rain adapter — typed interface, deterministic mock, sandbox stub |
| `blend` | Phase 2 interface only; every method throws until Blend is integrated |
| `analytics` | Partner and platform metrics, CSV export |
| `notifications` | In-app/email notifications and signed outbound partner webhooks |
| `ui` | Tailwind design tokens and the shared component kit |

## Invariants

These are enforced in code, not by convention:

**Money is never a float.** Every monetary value is a `bigint` count of minor
units. `packages/contracts/src/money.ts` is the only place that parses or
formats them, and it refuses to accept more precision than an asset supports.
On the wire, amounts are decimal strings — a JSON number would silently round
above 2^53.

**Tenant isolation is structural.** `forPartner(db, partnerId)` returns a Prisma
client that injects `partnerId` into the where clause of every read and the data
of every write. A handler that forgets its filter cannot leak another tenant's
rows. Cross-tenant reads return `null`; cross-tenant writes throw. See
`packages/db/src/tenant.ts` and the tests in `apps/api/src/tenant-isolation.test.ts`.

**Financial history is append-only.** The Prisma client extension in
`packages/db/src/client.ts` throws on any delete against `AuditEvent`,
`WebhookEvent`, `LedgerEntry`, `LedgerPosting`, `PayoutApproval`,
`ProviderTransfer`, `CardTransaction`, `Payout`, `RevenueEvent`,
`BalanceSnapshot` or `TraderIdentityStatus`. Corrections are reversals.

**Every state change is legal or it throws.** Payout, trader, card and yield
lifecycles are explicit transition maps in
`packages/contracts/src/state-machines.ts`. `assertTransition` runs at the
service boundary.

**Every mutation is audited in the same transaction.** `recordAudit` takes the
transaction client, so an audit row shares the fate of the change it records.
There is no path where a change lands unrecorded.

**Provider capability is never assumed.** The sandbox Rain adapter throws
`RainCapabilityUnavailableError` for every method until each one is mapped from
Rain's private documentation. Production mode is refused by both the environment
schema and the provider factory.

## Request flow: creating a payout

1. `POST /api/v1/partners/:partnerId/payouts` with an `Idempotency-Key`.
2. `requirePartnerUser` resolves the session cookie into a `Principal`.
3. `requirePartnerAccess` proves the caller may act for this partner.
4. `withIdempotency` claims the key; a replay with the same body returns the
   stored response, a replay with a different body is a 409.
5. `requirePermission(principal, "payout:create")`.
6. The payout engine checks trader eligibility, duplicate reference, per-payout
   bounds, the partner's rolling 24-hour limit, and asks Rain to validate the
   destination.
7. One transaction writes the payout, the audit event and any notification.
8. Approval writes the `PayoutApproval` row, the ledger entry and the audit
   event — again in one transaction — then hands off to the provider.

If provider submission fails, the payout moves to `MANUAL_REVIEW` with an open
`ManualOperation`, and the API says so explicitly rather than implying that
money moved.
