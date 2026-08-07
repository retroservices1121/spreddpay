# SpreddPay

Multi-tenant B2B platform for funded trading firms. A partner onboards traders,
delivers approved USDC payouts, issues branded virtual cards, and manages cards,
transactions and reporting. The trader sees the partner's product; SpreddPay
operates the software layer.

> **Phase 1:** receive a USDC payout and make it ready to spend.
> **Phase 2:** earn on the portion the trader chooses not to spend.

SpreddPay is not a bank, card network, exchange, prop firm, custodian
independent of its providers, or yield protocol.

**Current state: Phase 1, Milestone 1.** Foundation, portals, payout engine,
ledger, RBAC, audit and a deterministic mock provider. No live provider
integration — see [Provider status](#provider-status).

## Layout

```text
apps/
  landing/    spreddpay.com marketing site (dependency-free, deploys on its own)
  web/        trader-facing white-label app        :3001
  partner/    funded trading firm portal           :3002
  admin/      SpreddPay operations portal          :3003
  api/        Fastify API + demo seed              :4000
  worker/     jobs, reconciliation, webhooks

packages/
  config/ contracts/ db/ auth/ ledger/ rain/ blend/ analytics/ notifications/ ui/

docs/
  architecture.md   ledger.md      revenue.md     operations.md   demo-script.md
  rain-api-map.md   rain-webhooks.md   rain-flow-of-funds.md
  rain-program-limitations.md
  blend-api-map.md  rain-blend-flow.md
```

## Getting started

Needs Node 20+, pnpm 9, and a PostgreSQL database.

```bash
pnpm install
cp .env.example .env          # set DATABASE_URL; the rest works as-is
pnpm db:generate
pnpm db:push
pnpm demo:reset               # seeds Demo Trading Firm
pnpm dev
```

`RAIN_MODE=mock` runs the whole product without provider credentials. Redis is
optional — without `REDIS_URL` the worker runs its jobs on in-process intervals.

### Demo sign-ins

Password for all: `SpreddPayDemo123!`

| Portal | Email | Role |
| --- | --- | --- |
| Trader (:3001) | `alex.morgan@example.com` | Alex Morgan, TRADER-28491 |
| Partner (:3002) | `creator@demotradingfirm.example` | Payout creator |
| Partner (:3002) | `approver@demotradingfirm.example` | Payout approver |
| Partner (:3002) | `owner@demotradingfirm.example` | Partner owner |
| Admin (:3003) | `ops@spreddpay.com` | SpreddPay super admin |

Then follow [`docs/demo-script.md`](./docs/demo-script.md) — the full run is
under three minutes.

## Commands

```bash
pnpm dev            # every app in watch mode
pnpm lint
pnpm typecheck
pnpm test
pnpm build

pnpm db:generate    # prisma generate
pnpm db:push        # push schema (dev)
pnpm db:migrate     # apply migrations (deploy)
pnpm db:studio
pnpm demo:reset     # wipe and reseed demo data — refuses non-disposable databases
```

## What the design guarantees

These are enforced in code, not by convention. [`docs/architecture.md`](./docs/architecture.md)
has the detail.

- **Money is never a float.** Every value is a `bigint` of minor units, and
  crosses the wire as a decimal string. A JSON number rounds above 2^53.
- **Tenant isolation is structural.** `forPartner()` injects `partnerId` into
  every query. A handler that forgets its filter still cannot leak another
  tenant's rows.
- **Financial history is append-only.** Deletes against audit, webhook, ledger
  and payout tables throw. Corrections are reversals.
- **Every state change is legal or it throws.** Payout, trader and card
  lifecycles are explicit transition maps.
- **Every mutation is audited in the same transaction** as the change itself.
- **Payout creators cannot approve their own high-value payouts.**
- **Provider capability is never assumed.** See below.

## Provider status

**Rain** is the Phase 1 provider for cards, accounts, balances, controls and
webhooks.

The adapter interface is real and typed. The **sandbox implementation
deliberately throws on every method** until each endpoint is verified against
Rain's private dashboard documentation and recorded in
[`docs/rain-api-map.md`](./docs/rain-api-map.md). Nothing in this repository
invents a provider endpoint, path or field name.

[`docs/rain-flow-of-funds.md`](./docs/rain-flow-of-funds.md) is deliberately
unanswered — Rain defines how funds actually move. The payout engine, approvals,
limits, ledger and reconciliation are all built and independent of that answer,
but no payout is ever marked delivered on an assumption.

**Blend** is the Phase 2 provider for optional non-custodial yield. Not
implemented. Every method throws, the `blend_yield_enabled` flag is off, and the
trader UI shows no balance and no rate — because there is no honest number to
show until it is integrated.

`RAIN_MODE=production` and `BLEND_MODE=production` are refused by both the
environment schema and the provider factory.

## Testing

```bash
pnpm test          # unit tests everywhere
pnpm --filter @spreddpay/api test:db   # + database-backed tenant isolation
```

The tenant-isolation suite skips without `DATABASE_URL` so `pnpm test` works on
a fresh clone. CI always provides one, so it always runs there.

## Deployment

Railway, from this repository: **one project, six services** — `landing`, `api`,
`web`, `partner`, `admin`, `worker` — plus Postgres. A Railway service runs one
process, so these cannot be combined.

`apps/landing` is the exception: it deploys from its own root directory with no
dependencies and no build step, deliberately, so spreddpay.com cannot be taken
down by a platform build failure. Every other service uses the repo root so pnpm
workspace resolution works, and selects its app with `--filter`.

Root directories, build and start commands, per-service environment variables
and the first-deploy order are in
[`docs/deployment.md`](./docs/deployment.md).

Two things that bite if missed: `ENCRYPTION_KEY` and `AUTH_SECRET` must be
byte-identical across services, and `NEXT_PUBLIC_API_URL` is read at **build**
time by the three Next.js apps.

Never commit live credentials.
