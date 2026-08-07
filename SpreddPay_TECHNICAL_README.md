# SpreddPay Technical README

**Version:** 1.0  
**Audience:** Claude Code and engineers  
**Phase 1:** Rain-powered USDC payout accounts and branded virtual cards  
**Phase 2:** Optional Blend-powered non-custodial yield accounts  

## 1. Product

SpreddPay is a multi-tenant B2B platform for funded trading firms. A partner uses SpreddPay to onboard traders, deliver approved USDC payouts, issue branded virtual cards, manage cards and transactions, and view reporting. The trader sees the partner's branded product, with SpreddPay operating the software layer.

Core message:

> Phase 1: Receive a USDC payout and make it ready to spend.  
> Phase 2: Earn on the portion the trader chooses not to spend.

SpreddPay is not a bank, card network, exchange, prop firm, custodian independent of its providers, or yield protocol.

## 2. Provider Responsibilities

Rain is the Phase 1 infrastructure provider for cards, accounts, stablecoin money movement, balances, controls, and webhooks available under SpreddPay's approved program.

Blend is the Phase 2 infrastructure provider for optional non-custodial yield accounts. Blend publicly describes isolated per-user Gnosis Safes, deposits, withdrawals, strategy allocation, compliance controls, and orchestration through its SDK/API.

Exact endpoint names must come from Rain's private dashboard documentation and Blend's current official documentation. Claude Code must never invent provider endpoints.


# PHASE 1 — RAIN

## 3. Phase 1 Demo

The beta must demonstrate:

1. Create a funded trading firm as a partner.
2. Configure partner branding.
3. Invite and onboard a trader.
4. Complete the approved Rain KYC flow.
5. Create the trader's Rain account.
6. Issue a branded virtual card.
7. Create and approve a 4,850 USDC payout.
8. Make the payout available through the approved Rain flow of funds.
9. Show the updated trader balance.
10. Show the virtual card and card controls.
11. Show a sandbox card transaction.
12. Show updated partner analytics.

The entire demo should take less than three minutes.

## 4. Integration Modes

```env
RAIN_MODE=mock
BLEND_MODE=mock
```

Allowed values:

```text
mock
sandbox
production
```

`mock` provides a complete deterministic product demo without provider credentials.  
`sandbox` calls provider test APIs.  
`production` stays disabled until program, compliance, credentials, domains, webhooks, and funds flow are approved.

## 5. Technology Stack

- pnpm workspaces and Turborepo
- TypeScript strict mode
- Next.js for trader, partner, and admin apps
- NestJS or Fastify for the API
- PostgreSQL and Prisma
- Redis and BullMQ
- Tailwind CSS and shadcn/ui
- TanStack Query, React Hook Form, Zod
- Railway
- GitHub Actions
- Cloudflare
- Sentry
- PostHog

Money must be stored in integer minor units. Never use JavaScript floating-point arithmetic for financial values.


## 6. Repository Structure

```text
apps/
  web/        trader-facing white-label app
  partner/    funded trading firm portal
  admin/      SpreddPay operations portal
  api/        backend API
  worker/     jobs, reconciliation, webhook processing

packages/
  db/
  ui/
  config/
  auth/
  rain/
  blend/
  ledger/
  contracts/
  analytics/
  notifications/

docs/
  architecture.md
  rain-api-map.md
  rain-flow-of-funds.md
  rain-webhooks.md
  rain-program-limitations.md
  blend-api-map.md
  rain-blend-flow.md
  ledger.md
  revenue.md
  operations.md
  demo-script.md
```

## 7. High-Level Architecture

```text
Partner Portal ─┐
Trader Portal  ─┼─> SpreddPay API ─> PostgreSQL / Redis / Workers
Admin Portal   ─┘                     |
                                      ├─> Rain APIs
                                      └─> Blend APIs in Phase 2
```

Rain is the source of truth for Rain account, card, balance, and transaction states. Blend is the source of truth for Blend account and yield states. SpreddPay is the source of truth for tenancy, partner workflow, approvals, internal reporting, revenue allocation, and audit history.


## 8. Multi-Tenant Partner Model

Every funded trading firm is a `Partner`. Data must be isolated by partner.

```ts
type Partner = {
  id: string;
  legalName: string;
  displayName: string;
  slug: string;
  status: "DRAFT" | "ONBOARDING" | "ACTIVE" | "SUSPENDED" | "CLOSED";
  rainProgramId: string | null;
  defaultAsset: string;
  defaultNetwork: string;
  supportEmail: string;
  createdAt: Date;
};
```

Partner branding:

```ts
type PartnerBranding = {
  partnerId: string;
  productName: string;
  logoUrl: string | null;
  iconUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  cardBackground: string | null;
  cardLabel: string;
  poweredBySpreddPay: boolean;
};
```

Partner roles:

```text
PARTNER_OWNER
PARTNER_ADMIN
PAYOUT_CREATOR
PAYOUT_APPROVER
SUPPORT_AGENT
ANALYST
READ_ONLY
```

SpreddPay roles:

```text
SUPER_ADMIN
OPERATIONS
SUPPORT
FINANCE
READ_ONLY
```

Critical rules:

- payout creators cannot approve their own high-value payouts;
- partner users cannot access another partner's records;
- traders can access only their own records;
- every financial or administrative mutation creates an immutable audit event.


## 9. Trader Onboarding

State machine:

```text
INVITED
→ ACCOUNT_CREATED
→ TERMS_PENDING
→ KYC_PENDING
→ KYC_REVIEW
→ KYC_APPROVED
→ RAIN_ACCOUNT_PENDING
→ RAIN_ACCOUNT_ACTIVE
→ CARD_ELIGIBLE
→ VIRTUAL_CARD_PENDING
→ VIRTUAL_CARD_ACTIVE
```

Failure states:

```text
KYC_REJECTED
COUNTRY_UNSUPPORTED
ACCOUNT_RESTRICTED
CARD_INELIGIBLE
PROVIDER_ERROR
MANUAL_REVIEW
```

Trader record:

```ts
type TraderProfile = {
  id: string;
  partnerId: string;
  externalTraderId: string;
  email: string;
  firstName: string;
  lastName: string;
  countryCode: string;
  status: string;
  rainCustomerId: string | null;
  createdAt: Date;
};
```

Avoid storing sensitive identity documents when a Rain-hosted flow can be used. Store provider references and statuses.


## 10. Rain Adapter

Create a typed Rain module based only on verified private documentation.

```ts
interface RainService {
  createCustomer(input: CreateRainCustomerInput): Promise<RainCustomer>;
  getCustomer(id: string): Promise<RainCustomer>;
  startKyc(customerId: string): Promise<RainKycSession>;
  getKycStatus(customerId: string): Promise<RainKycStatus>;

  createAccount(input: CreateRainAccountInput): Promise<RainAccount>;
  getAccount(id: string): Promise<RainAccount>;
  getBalances(accountId: string): Promise<NormalizedBalance[]>;

  createVirtualCard(input: CreateRainCardInput): Promise<NormalizedCard>;
  getCard(id: string): Promise<NormalizedCard>;
  freezeCard(id: string): Promise<void>;
  unfreezeCard(id: string): Promise<void>;
  listCardTransactions(input: TransactionQuery): Promise<TransactionPage>;

  validatePayoutDestination(traderId: string): Promise<ValidationResult>;
  createPayout(input: ProviderPayoutInput): Promise<ProviderPayout>;
  getPayout(id: string): Promise<ProviderPayout>;

  verifyWebhook(headers: Headers, rawBody: string): Promise<VerifiedWebhook>;
}
```

Before each module is implemented:

1. inspect Rain's private docs;
2. update `docs/rain-api-map.md`;
3. create typed requests/responses;
4. implement the adapter;
5. add sandbox tests;
6. place unavailable capabilities in `docs/rain-program-limitations.md`.


## 11. Accounts, Balances, and Cards

Normalized balance:

```ts
type NormalizedBalance = {
  asset: string;
  network: string | null;
  availableMinor: bigint;
  pendingMinor: bigint;
  reservedMinor: bigint;
  source: "RAIN" | "INTERNAL" | "BLEND";
  asOf: Date;
};
```

Card statuses:

```text
PENDING
ACTIVE
FROZEN
SUSPENDED
CANCELLED
EXPIRED
REPLACED
FAILED
```

Card record:

```ts
type Card = {
  id: string;
  partnerId: string;
  traderId: string;
  provider: "RAIN";
  providerCardId: string;
  type: "VIRTUAL" | "PHYSICAL";
  last4: string | null;
  status: string;
  createdAt: Date;
  activatedAt: Date | null;
};
```

Trader card capabilities, when supported by Rain:

- create virtual card;
- show masked card;
- reveal details through the Rain-approved secure method;
- freeze/unfreeze;
- show spending controls;
- view transactions;
- provision to supported digital wallets.

Never store full PAN, CVV, plaintext card secrets, or provider tokens in browser storage.


## 12. Payout Engine

A payout is an approved partner instruction to make funds available to a trader through the configured Rain flow.

Lifecycle:

```text
DRAFT
→ PENDING_APPROVAL
→ APPROVED
→ FUNDING_PENDING
→ SUBMITTED_TO_RAIN
→ PROCESSING
→ COMPLETED
```

Exceptional states:

```text
REJECTED
FAILED
CANCELLED
REVERSED
MANUAL_REVIEW
```

```ts
type Payout = {
  id: string;
  partnerId: string;
  traderId: string;
  externalReference: string;
  amountMinor: bigint;
  asset: string;
  network: string;
  status: string;
  rainTransferId: string | null;
  blockchainTxHash: string | null;
  initiatedByUserId: string;
  approvedByUserId: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: Date;
  approvedAt: Date | null;
  completedAt: Date | null;
};
```

Controls:

- `Idempotency-Key` required;
- unique external reference per partner;
- dual approval above a configurable threshold;
- operator and partner daily limits;
- duplicate detection;
- KYC and account-status validation;
- funding-balance validation;
- immutable audit trail.

Support manual provider operations:

```text
AUTOMATED
MANUAL_REQUIRED
MANUAL_IN_PROGRESS
MANUAL_COMPLETED
```

Manual actions belong in an operations queue with owner, evidence, provider reference, completion time, and reviewer.


## 13. Rain Flow of Funds

Do not assume the actual movement architecture. Write the approved design to:

```text
docs/rain-flow-of-funds.md
```

It must identify:

- source account;
- destination account;
- supported asset and network;
- prefunding requirements;
- confirmation rules;
- settlement timing;
- gas/network fees;
- failure recovery;
- reconciliation procedure;
- transaction-monitoring ownership.

The approved model may be Rain-managed accounts, prefunded program balances, partner wallet funding, stablecoin transfer, or another Rain-defined flow. Build only what Rain confirms.


## 14. Transactions and Webhooks

Normalized transaction kinds:

```text
AUTHORIZATION
CAPTURE
PAYMENT
REFUND
REVERSAL
FEE
ADJUSTMENT
```

Statuses:

```text
PENDING
APPROVED
DECLINED
CLEARED
REVERSED
FAILED
```

Requirements:

- display pending authorizations quickly;
- merge updates into existing transactions;
- prevent duplicates;
- preserve provider IDs;
- preserve merchant, amount, currency, country, category, and timestamps when available;
- model refunds and reversals separately;
- provide partner and trader views;
- support CSV export.

Webhook processing:

1. read raw body;
2. verify Rain signature;
3. store event before processing;
4. deduplicate by provider event ID;
5. respond quickly;
6. process asynchronously;
7. tolerate retries and out-of-order events;
8. preserve redacted raw event data;
9. never log secrets or card details.


## 15. Product Screens

Partner portal:

```text
/dashboard
/traders
/traders/:id
/payouts
/payouts/new
/payouts/:id
/cards
/transactions
/revenue
/reports
/branding
/api-keys
/webhooks
/team
/settings
```

Partner dashboard metrics:

- active traders;
- pending KYC;
- active cards;
- pending/completed/failed payouts;
- monthly payout volume;
- monthly card spend;
- average spend per active card;
- activation rate;
- operations requiring attention.

Trader portal:

```text
/onboarding
/dashboard
/card
/activity
/payouts
/settings
/support
```

Trader dashboard:

- available payout balance;
- pending balance;
- virtual card;
- latest payout;
- recent card activity;
- Phase 2 earn balance when enabled.

SpreddPay admin:

```text
/partners
/partners/:id
/programs
/users
/payouts
/manual-operations
/provider-events
/reconciliation
/revenue
/support
/audit
/system
```


## 16. Ledger and Revenue

Maintain a double-entry internal ledger for workflow and reporting, without claiming custody that belongs to provider infrastructure.

Example accounts:

```text
PARTNER_PAYOUTS_PENDING
PARTNER_PAYOUTS_COMPLETED
USER_AVAILABLE_REPORTING
USER_RESERVED_REPORTING
CARD_SPEND_PENDING
CARD_SPEND_CLEARED
CARD_REFUNDS
PROVIDER_FEES
SPREDDPAY_REVENUE
PARTNER_REVENUE_PAYABLE
ADJUSTMENTS
```

Rules:

- every journal entry balances;
- postings are append-only;
- corrections use reversals;
- every entry references a business event;
- ledger and payout changes occur in one database transaction;
- provider balances are reconciled, not replaced by internal assumptions.

Revenue is configurable because Rain commercial terms are not hard-coded.

```ts
type RevenueRule = {
  id: string;
  partnerId: string;
  source: string;
  calculationType:
    | "BASIS_POINTS_OF_VOLUME"
    | "PERCENT_OF_NET_REVENUE"
    | "FIXED_PER_ACTIVE_CARD"
    | "FIXED_MONTHLY"
    | "CUSTOM";
  spreddPayShareBps: number | null;
  partnerShareBps: number | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};
```

Revenue workflow:

```text
Provider statement imported
→ transactions matched
→ provider deductions applied
→ SpreddPay share calculated
→ partner share calculated
→ settlement statement generated
→ finance review
→ settlement marked paid
```


## 17. Database

Minimum Prisma models:

```text
Partner
PartnerBranding
PartnerProgram
PartnerUser
PartnerRole
Trader
TraderIdentityStatus
ProviderCustomer
FinancialAccount
BalanceSnapshot
Card
CardControl
Payout
PayoutApproval
ProviderTransfer
CardTransaction
WebhookEvent
ManualOperation
LedgerAccount
LedgerEntry
LedgerPosting
RevenueRule
RevenueEvent
PartnerSettlement
AuditEvent
Notification
ApiCredential
PartnerWebhookEndpoint
FeatureFlag
SupportCase
YieldAccount
YieldTransaction
YieldStrategy
YieldRevenueRule
```

Important constraints:

```text
Partner.slug
Trader(partnerId, externalTraderId)
ProviderCustomer(provider, providerCustomerId)
Card(provider, providerCardId)
Payout(partnerId, externalReference)
WebhookEvent(provider, providerEventId)
ApiCredential(partnerId, keyPrefix)
```

Financial, webhook, and audit records must not be destructively deleted.


## 18. SpreddPay API

Base path:

```text
/api/v1
```

Partner API:

```text
POST   /partners/:partnerId/traders
GET    /partners/:partnerId/traders
GET    /partners/:partnerId/traders/:traderId

POST   /partners/:partnerId/payouts
GET    /partners/:partnerId/payouts
GET    /partners/:partnerId/payouts/:payoutId
POST   /partners/:partnerId/payouts/:payoutId/cancel

GET    /partners/:partnerId/cards
GET    /partners/:partnerId/cards/:cardId
GET    /partners/:partnerId/transactions
GET    /partners/:partnerId/balances
GET    /partners/:partnerId/revenue
GET    /partners/:partnerId/settlements
```

Trader API:

```text
GET    /me
GET    /me/onboarding
POST   /me/onboarding/start
GET    /me/balances
GET    /me/payouts
GET    /me/cards
POST   /me/cards/:id/freeze
POST   /me/cards/:id/unfreeze
GET    /me/transactions
```

Partner webhook events:

```text
trader.created
trader.kyc_pending
trader.kyc_approved
trader.kyc_rejected
account.active
card.created
card.active
card.frozen
payout.approved
payout.processing
payout.completed
payout.failed
transaction.pending
transaction.cleared
transaction.reversed
yield.deposit_completed
yield.withdrawal_completed
```

Partner webhooks require HMAC signatures, retries, delivery logs, and replay support.


## 19. Phase 1 Milestones

### Milestone 1 — Foundation
Build monorepo, apps, database, auth, tenancy, RBAC, audit log, mock Rain service, and demo seed.

### Milestone 2 — UI
Build partner, trader, and admin portals with partner branding.

### Milestone 3 — Payout Engine
Build approvals, state machine, idempotency, operations queue, ledger, and notifications.

### Milestone 4 — Rain Sandbox
Implement only verified Rain capabilities: onboarding, KYC status, accounts, balances, virtual cards, controls, transactions, and webhooks.

### Milestone 5 — Rain Funds Flow
Implement the approved test payout flow and reconciliation.

### Milestone 6 — Reporting and Revenue
Build analytics, statements, revenue rules, settlement preview, and CSV exports.

### Milestone 7 — Beta Hardening
Add support tools, alerts, reconciliation, feature flags, security controls, and end-to-end tests.


# PHASE 2 — BLEND OPTIONAL YIELD

## 20. Phase 2 Objective

Let an eligible trader move funds they do not want immediately spendable into a separate non-custodial yield account powered by Blend.

```text
Rain Spend Balance
  ├─ Keep available for card spending
  └─ Move to Blend Earn Balance
```

Rain spend and Blend earn balances must always be displayed separately. Never imply that Blend funds remain instantly available to card spending unless a provider-approved automatic return flow exists.

## 21. Blend Adapter

```ts
interface BlendYieldService {
  getOrCreateAccount(traderId: string): Promise<YieldAccount>;
  getBalance(traderId: string): Promise<YieldBalance>;
  listStrategies(): Promise<YieldStrategy[]>;
  createDepositIntent(input: YieldDepositInput): Promise<YieldIntent>;
  submitDeposit(input: SubmitYieldIntentInput): Promise<YieldTransaction>;
  createWithdrawalIntent(input: YieldWithdrawalInput): Promise<YieldIntent>;
  submitWithdrawal(input: SubmitYieldIntentInput): Promise<YieldTransaction>;
  getTransaction(id: string): Promise<YieldTransaction>;
}
```

Use exact current Blend SDK/API methods. Do not invent methods.


## 22. Phase 2 UX and States

Dashboard example:

```text
Available to spend: $1,500
Earn balance:       $3,350
Estimated APY:      4.2% variable
```

The rate must come from Blend, be labeled variable, identify gross/net treatment, and never be described as guaranteed.

Trader actions:

- enable Earn;
- review disclosures;
- create/map Blend account;
- deposit;
- withdraw;
- view balance and history;
- configure optional auto-allocation;
- disable auto-allocation.

Onboarding states:

```text
NOT_ENABLED
→ DISCLOSURES_PENDING
→ ELIGIBILITY_PENDING
→ ACCOUNT_CREATING
→ ACCOUNT_ACTIVE
→ DEPOSIT_ENABLED
```

Exceptional:

```text
INELIGIBLE
RESTRICTED
ACCOUNT_ERROR
DEPOSIT_PAUSED
WITHDRAWAL_PAUSED
MANUAL_REVIEW
```

Deposit states:

```text
DRAFT
→ PENDING_AUTHORIZATION
→ SUBMITTED
→ BRIDGING
→ SETTLING
→ COMPLETED
```

Withdrawal states:

```text
DRAFT
→ PENDING_AUTHORIZATION
→ SUBMITTED
→ UNWINDING
→ BRIDGING
→ SETTLING
→ COMPLETED
```


## 23. Rain-to-Blend Flow

Do not assume direct movement between Rain and Blend. Document the provider-approved path in:

```text
docs/rain-blend-flow.md
```

It must answer:

- originating wallet/account;
- user signature requirements;
- whether Rain permits withdrawal to the Blend Safe;
- supported asset and chain;
- bridging;
- fees;
- expected timing;
- card-balance impact;
- failure recovery;
- return transfer path.

A Blend deposit is complete only after the source transfer, Blend settlement, Blend balance update, and reconciliation all succeed.


## 24. Phase 2 Partner Controls and Revenue

Partner controls:

- enable/disable Earn;
- eligible jurisdictions;
- minimum/maximum deposits;
- allowed strategies;
- spend buffer;
- auto-allocation availability;
- disclosures;
- support escalation.

Auto-allocation example:

```text
Keep at least $500 available to spend.
Move payout amounts above $500 to Earn.
```

Auto-allocation is opt-in only.

Do not assume a Blend markup or revenue share. Make economics configurable after commercial confirmation.

```ts
type YieldRevenueRule = {
  partnerId: string;
  calculationType:
    | "BASIS_POINTS_OF_BALANCE"
    | "PERCENT_OF_REALIZED_YIELD"
    | "FIXED_PLATFORM_FEE";
  spreddPayShareBps: number;
  partnerShareBps: number;
  userShareBps: number;
};
```

Do not recognize estimated unrealized yield as settled revenue.


## 25. Phase 2 Milestones

### Milestone 8 — Blend Mock
Build Earn UI, mock balance, deposit/withdrawal states, variable APY display, disclosures, and feature flag.

### Milestone 9 — Blend Sandbox
Implement verified account creation/mapping, balance, deposit, withdrawal, and event/status synchronization.

### Milestone 10 — Rain/Blend Funds Flow
Build only after both providers approve the transfer path.

### Milestone 11 — Auto-Allocation
Build spend buffer, payout allocation preference, disclosures, retries, cancellation, and audit log.


## 26. Security and Product Rules

Provider compliance does not remove SpreddPay's software-security duties.

Mandatory:

- server-side provider credentials;
- encryption for secrets;
- MFA for operators;
- RBAC;
- signed webhook verification;
- idempotency;
- rate limits;
- CSRF protection;
- secure cookies;
- content security policy;
- personal-data minimization;
- audit logging;
- dependency and secret scanning;
- alerts for payout/provider failures.

Product rules:

- do not bypass KYC, sanctions, geography, or restrictions;
- do not call Blend Earn a savings account unless approved;
- do not promise returns;
- do not claim FDIC/bank insurance unless explicitly applicable;
- record accepted terms version and time;
- fail closed when eligibility is unknown.


## 27. Testing and CI

Unit tests:

- exact money arithmetic;
- payout state machine;
- onboarding state machine;
- card-state normalization;
- webhook deduplication;
- ledger balancing;
- revenue calculations;
- tenant isolation;
- Blend deposit/withdrawal states.

Integration tests:

- Rain sandbox onboarding;
- virtual card issuance;
- freeze/unfreeze;
- test payout;
- transaction webhook;
- reconciliation;
- Blend account, deposit, and withdrawal.

End-to-end tests:

- partner creates payout;
- second operator approves;
- trader balance updates;
- card appears;
- card transaction appears;
- partner analytics update;
- Phase 2 opt-in/deposit/withdrawal;
- unauthorized access denied.

CI:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```


## 28. Environment Variables

```env
NODE_ENV=development

DATABASE_URL=
REDIS_URL=

APP_URL=
PARTNER_APP_URL=
ADMIN_APP_URL=
API_URL=

AUTH_SECRET=
ENCRYPTION_KEY=

RAIN_MODE=mock
RAIN_API_BASE_URL=
RAIN_API_KEY=
RAIN_PROGRAM_ID=
RAIN_WEBHOOK_SECRET=

BLEND_MODE=mock
BLEND_API_BASE_URL=
BLEND_API_KEY=
BLEND_ORGANIZATION_ID=
BLEND_WEBHOOK_SECRET=

SENTRY_DSN=
POSTHOG_KEY=
DEMO_SEED=true
```

Never commit live credentials.


## 29. Demo Seed

```text
Partner: Demo Trading Firm
Product: Demo Pay
Trader: Alex Morgan
External ID: TRADER-28491
KYC: Approved
Rain account: Active
Virtual card: Active
Payout: 4,850 USDC, Draft
Transaction: Online Purchase, $84.23, Pending
```

Reset command:

```bash
pnpm demo:reset
```


## 30. Initial Claude Code Prompt

```text
You are the lead engineer for SpreddPay.

Read TECHNICAL_README.md completely before changing files.

Build Phase 1, Milestone 1 only.

1. Create a pnpm + Turborepo TypeScript monorepo.
2. Add apps: web, partner, admin, api, worker.
3. Add packages: db, ui, config, auth, rain, blend, ledger,
   contracts, analytics, notifications.
4. Use strict TypeScript.
5. Use Next.js for frontend apps.
6. Use NestJS or Fastify for API.
7. Use PostgreSQL and Prisma.
8. Create the models defined in this specification.
9. Implement tenant isolation and RBAC.
10. Implement immutable audit events.
11. Implement deterministic MockRainService.
12. Seed the specified demo data.
13. Add pnpm demo:reset.
14. Create basic responsive shells for all portals.
15. Add tests for ledger balancing, payout transitions,
    tenant isolation, and RBAC.
16. Add .env.example and GitHub Actions.
17. Do not integrate live Rain.
18. Do not implement Blend.
19. Never use floating-point arithmetic for money.
20. Run lint, typecheck, tests, and build before completion.

Before coding, summarize the plan and assumptions. Then implement without
asking for confirmation unless a required dependency is unavailable.
```


## 31. Rain Integration Prompt

```text
Read TECHNICAL_README.md and docs/rain-api-map.md.

Implement only capabilities verified in Rain's private sandbox documentation.
Do not invent endpoints or fields.

1. Add typed Rain API authentication.
2. Implement verified customer/cardholder onboarding.
3. Implement verified KYC status.
4. Implement verified account creation and balances.
5. Implement verified virtual card creation.
6. Implement verified freeze/unfreeze.
7. Implement verified transaction retrieval.
8. Implement webhook signature verification.
9. Normalize Rain objects into SpreddPay domain objects.
10. Preserve provider IDs and redacted raw events.
11. Add safe retries only for idempotent operations.
12. Add sandbox tests.
13. Feature-flag unsupported capabilities.
14. Update docs/rain-api-map.md and rain-program-limitations.md.
15. Run all CI checks.
```


## 32. Blend Integration Prompt

```text
Read TECHNICAL_README.md and current official Blend documentation.

Implement Phase 2 behind `blend_yield_enabled`.

1. Create the server-side Blend client.
2. Implement verified account creation/mapping.
3. Implement verified balance retrieval.
4. Implement verified deposit intent/submission.
5. Implement verified withdrawal intent/submission.
6. Implement status synchronization using documented webhooks or polling.
7. Add YieldAccount, YieldTransaction, YieldStrategy, and
   YieldRevenueRule models.
8. Add disclosures and explicit opt-in.
9. Add a separate Earn balance.
10. Keep Rain spend and Blend earn balances separate.
11. Do not automate Rain-to-Blend transfers until
    docs/rain-blend-flow.md is approved.
12. Add mock and sandbox tests.
13. Label yield variable and not guaranteed.
14. Run all CI checks.
```


## 33. Definition of Done

Phase 1 is complete when:

- partner and trader portals work;
- branding is applied;
- Rain sandbox onboarding works;
- virtual card issuance works;
- approved test payout reaches the test account through the approved flow;
- card transactions synchronize;
- webhooks are verified and deduplicated;
- ledger reconciles;
- analytics work;
- the demo completes in under three minutes.

Phase 2 is complete when:

- eligible traders explicitly opt in;
- Blend creates/maps a separate per-user account;
- sandbox deposits and withdrawals work;
- spend and earn balances remain distinct;
- variable yield is accurate;
- reconciliation works;
- no automated Rain-to-Blend movement occurs without approved funds-flow documentation.


## 34. Official References

Rain:

- https://www.rain.xyz/
- https://www.rain.xyz/product/card-issuing
- https://www.rain.xyz/resources/launch-a-card-program-with-rain
- Use the private Rain dashboard documentation for actual implementation.

Blend:

- https://blend.money/
- https://docs.blend.money/
- https://docs.blend.money/build/overview
- https://docs.blend.money/architecture/overview
- https://docs.blend.money/blend/overview
- https://docs.blend.money/llms.txt
