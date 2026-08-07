# Rain webhooks

**Status: event types not mapped. Signature scheme not verified.**

## What is implemented

`POST /api/v1/webhooks/rain` (`apps/api/src/routes/webhooks.ts`) follows the
order in TECHNICAL_README section 14:

1. Read the **raw body** — a signature covers bytes, not a re-serialised object.
2. Verify the signature via `rainService.verifyWebhook(headers, rawBody)`.
3. **Store before processing.** The `WebhookEvent` row is written first.
4. **Deduplicate** on the unique `(provider, providerEventId)` constraint.
5. **Respond quickly** — 202 on accept, 200 on a duplicate, 401 on a bad
   signature.
6. **Process asynchronously** in the worker (`apps/worker/src/jobs.ts`).

An invalid signature is still stored, flagged `signatureValid: false` and marked
`SKIPPED`, because a burst of them is a security signal worth keeping. Payloads
are redacted at the adapter boundary; card data never reaches this table. The
`headers` column stores only whether a signature was present, never its value.

Events are visible to operators at `/provider-events` in the admin portal.

## What is not implemented

`handleRainEvent` in the worker throws for any event type it does not recognise,
which marks the event `FAILED` with the reason. That is deliberate: an unmapped
event is left for a human rather than silently dropped or guessed at. Only
`ping` is handled today.

## Signature verification — to be verified

| Question | Answer |
| --- | --- |
| Header carrying the signature | _unverified_ (mock uses `x-rain-signature`) |
| Algorithm | _unverified_ (mock uses HMAC-SHA256 over the raw body) |
| Is a timestamp included in the signed payload? | _unverified_ |
| Replay tolerance window | _unverified_ |
| Secret rotation procedure | _unverified_ |
| Are there separate secrets per environment? | _unverified_ |

The mock's scheme is a placeholder for demo purposes only. It must be replaced
wholesale by whatever Rain actually specifies — not adapted.

## Event map

| Rain event type | SpreddPay handler | Effect | Verified |
| --- | --- | --- | --- |
| _unverified_ | `handleRainEvent` | KYC status change → `advanceOnboarding` | ☐ |
| _unverified_ | `handleRainEvent` | Account activated → `FinancialAccount.status` | ☐ |
| _unverified_ | `handleRainEvent` | Card state change → `Card.status` | ☐ |
| _unverified_ | `handleRainEvent` | Transfer settled → `completePayout` | ☐ |
| _unverified_ | `handleRainEvent` | Transfer failed → `failPayout` | ☐ |
| _unverified_ | `handleRainEvent` | Authorization → `ingestTransaction` | ☐ |
| _unverified_ | `handleRainEvent` | Capture / clearing → `ingestTransaction` | ☐ |
| _unverified_ | `handleRainEvent` | Refund → `ingestTransaction` | ☐ |
| _unverified_ | `handleRainEvent` | Reversal → `ingestTransaction` | ☐ |

## Requirements for the eventual implementation

- **Out-of-order tolerance.** A capture may arrive before its authorization.
  `ingestTransaction` keys on the provider transaction id and merges, so this is
  already safe — but each new handler must preserve it.
- **Retry tolerance.** Rain will redeliver. Every handler must be idempotent;
  `ingestTransaction` returns whether the row was newly created so the ledger
  entry is written exactly once.
- **No secrets in logs.** The Fastify logger redacts `x-rain-signature`,
  cookies and authorization headers.

## Outbound partner webhooks

Distinct from the above. SpreddPay signs its own events to partner endpoints
with HMAC-SHA256 over `${timestamp}.${body}`, with a five-minute replay window,
exponential backoff to a six-hour ceiling, and a delivery log. See
`packages/notifications/src/index.ts` and the event list in
`PARTNER_WEBHOOK_EVENTS`.
