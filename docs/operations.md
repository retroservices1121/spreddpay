# Operations

## Running it locally

```bash
pnpm install
cp .env.example .env          # then set DATABASE_URL
pnpm db:generate
pnpm db:push                  # or db:migrate once migrations are committed
pnpm demo:reset               # seeds Demo Trading Firm
pnpm dev                      # api :4000, trader :3001, partner :3002, admin :3003
```

`RAIN_MODE=mock` needs no provider credentials. Redis is optional — without
`REDIS_URL` the worker runs its jobs on in-process intervals.

## Integration modes

| Mode | Behaviour |
| --- | --- |
| `mock` | Deterministic in-memory provider. Full product demo, no credentials. |
| `sandbox` | Calls provider test APIs. Every Rain method currently throws until mapped. |
| `production` | **Refused.** Blocked by the env schema *and* the provider factory. |

Production stays disabled until program, compliance, credentials, domains,
webhooks and funds flow are approved. Two independent gates, because the cost of
accidentally pointing at a live card program is not symmetric.

## Mock-mode rehydration

`MockRainService` holds state in memory. On boot the API replays SpreddPay's own
provider references back into it (`hydrateMockRain`), so a restart does not make
a seeded card unrecognisable to the mock. It restores nothing the platform does
not already have in its own database.

## The operations queue

Anything the automated path cannot finish opens a `ManualOperation`:

| Kind | Raised when |
| --- | --- |
| `PAYOUT_SUBMISSION` | A payout was approved but could not be submitted to the provider. The payout sits in `MANUAL_REVIEW`. |
| `LEDGER_IMBALANCE` | Reconciliation found debits ≠ credits for a partner. |

Each carries an owner, a provider reference, evidence and a completion record.
Operators work them at `/manual-operations` in the admin portal: claim, then
complete with a provider reference. Completion is audited.

A payout in `MANUAL_REVIEW` can return to the flow — the state machine allows
`MANUAL_REVIEW → APPROVED | SUBMITTED_TO_RAIN | PROCESSING | COMPLETED | FAILED |
CANCELLED | REJECTED` — so resolving a hold never requires cancelling and
recreating.

## Worker jobs

| Job | Interval | Purpose | Safe on >1 replica |
| --- | --- | --- | --- |
| `process-webhook-events` | 5s | Process stored provider events | yes — atomic claim |
| `deliver-partner-webhooks` | 10s | Deliver outbound webhooks with backoff | yes — lease |
| `dispatch-notifications` | 15s | Send queued notifications | yes — atomic claim |
| `sync-provider-balances` | 60s | Snapshot provider balances | yes — duplicate snapshots are harmless |
| `reconcile-ledgers` | 5m | Assert every partner's books balance | yes — read-only |
| `sweep-expired` | 1h | Purge expired sessions and idempotency keys | yes — idempotent |

### Scaling the worker

The three queue jobs claim work atomically with
`SELECT … FOR UPDATE SKIP LOCKED`, so concurrent workers receive disjoint sets
of rows in a single statement. Scaling `numReplicas` above 1 is therefore safe.

This matters because the obvious implementation is not. A `findMany` followed by
an `update` leaves a window in which a second replica reads the same rows, and
the result is duplicate webhook processing and the same event POSTed to a
partner twice. `apps/worker/src/jobs.test.ts` asserts the disjointness property
against a real database.

`deliver-partner-webhooks` has no status column, so it claims by pushing
`nextAttemptAt` two minutes out — a lease. If a worker dies mid-delivery the
lease expires and the row is retried, rather than being stranded.

`dispatch-notifications` marks `SENT` inside the claim. That is honest while
there is no email transport — claiming *is* sending. Wiring in a real provider
needs an intermediate `SENDING` state so a crash between claim and send is
retried rather than silently dropped.

### Resource limits

Railway's per-service vCPU and memory figures are **ceilings, not
reservations**, and billing follows actual consumption. Lowering them saves
nothing and only risks throttling or an OOM kill, so leave them at the default.
Steady-state footprints are small: roughly 200–300 MB for the API, 150–250 MB
for the worker, and 250–400 MB for each Next.js portal. Next.js *builds* can
spike to several GB, but those run on Railway's builder infrastructure and are
unaffected by runtime limits.

Watch the Metrics tab instead. Memory that climbs steadily is a leak to fix, not
a limit to raise.

## Alerting — what to watch

- `WebhookEvent` rows stuck in `FAILED` or `RECEIVED`, visible at
  `/provider-events`.
- `WebhookEvent` rows with `signatureValid: false` — a burst is a security signal.
- Open `ManualOperation` rows, especially `LEDGER_IMBALANCE`.
- Payouts in `MANUAL_REVIEW` or `FAILED`.
- `PartnerWebhookDelivery` rows at 8 attempts (the retry ceiling).

## Support runbook

There is no support case tooling yet (Milestone 7). Until then:

| Question | Where to look |
| --- | --- |
| Who changed this, and when? | `/audit` — immutable, includes IP and user agent |
| Did the provider tell us? | `/provider-events` — every inbound webhook, valid or not |
| Why is this payout stuck? | `/payouts`, then the payout's approval trail; check `/manual-operations` |
| Do the books balance? | `/reconciliation` |
| What mode are we in? | `/system` |

## Security posture

- Provider credentials are server-side only; no browser ever sees one.
- Secrets at rest use AES-256-GCM keyed by `ENCRYPTION_KEY`.
- Sessions and API keys are stored as SHA-256 hashes, never in plaintext.
- Passwords use scrypt (N=2^16, r=8, p=1) with per-password salt.
- Cookies are `httpOnly`, `sameSite=lax`, and `secure` in production.
- CSP, HSTS and frame-denial via Helmet; CORS is restricted to the three portal
  origins with credentials.
- Rate limiting is 300 requests/minute, with webhooks exempt — they are machine
  traffic with their own signature check, and throttling a provider's retries
  turns a transient problem into a permanent one.
- The logger redacts cookies, authorization headers, signatures, passwords, PAN
  and CVV.
- Full PAN and CVV are never stored, logged, or sent to a browser.

## Deployment

Railway. The landing page (`apps/landing`) deploys from its own root directory
and has no dependencies — that is deliberate, so spreddpay.com cannot be taken
down by a platform build failure.

Platform services each need `DATABASE_URL`, `AUTH_SECRET` and `ENCRYPTION_KEY`.
`ENCRYPTION_KEY` must be identical everywhere, or previously encrypted secrets
become undecryptable.

## Rotating `ENCRYPTION_KEY`

The ciphertext format is versioned (`v1.<iv>.<tag>.<data>`) precisely so a future
rotation can decrypt old values while writing new ones. Rotation is not yet
implemented; do not change the key on a database holding encrypted webhook
secrets until it is.
