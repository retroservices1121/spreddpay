# Rain API map

**Status: not yet mapped. Nothing in this file has been verified.**

This document is the contract between Rain's private dashboard documentation and
`packages/rain/src/sandbox.ts`. It is deliberately empty of endpoint names,
paths, field names and auth schemes, because none have been read from Rain's
documentation yet.

> TECHNICAL_README section 2: *"Exact endpoint names must come from Rain's
> private dashboard documentation. Claude Code must never invent provider
> endpoints."*

`RainSandboxService` throws `RainCapabilityUnavailableError` on every method for
exactly this reason. A `RAIN_MODE=sandbox` deployment fails loudly instead of
quietly returning mock data as though it were real.

## Procedure for each capability

Per TECHNICAL_README section 10, in this order:

1. Read Rain's private documentation for the capability.
2. Fill in the row below — real path, real method, real request and response
   fields.
3. Write the typed request/response interfaces.
4. Implement the method in `RainSandboxService`.
5. Add a sandbox test.
6. If Rain does not support it for this program, move it to
   [`rain-program-limitations.md`](./rain-program-limitations.md) instead of
   implementing a workaround.

## Authentication

| Question | Answer |
| --- | --- |
| Auth scheme (bearer, HMAC, mTLS, …) | _unverified_ |
| Header name(s) | _unverified_ |
| Base URL — sandbox | _unverified_ |
| Base URL — production | _unverified_ |
| Credential rotation procedure | _unverified_ |
| Rate limits | _unverified_ |
| Idempotency support and header name | _unverified_ |

## Capability map

Each row maps one method of the `RainService` interface
(`packages/rain/src/types.ts`) onto a real Rain endpoint.

| SpreddPay method | Rain endpoint | Method | Verified | Notes |
| --- | --- | --- | --- | --- |
| `createCustomer` | _unverified_ | | ☐ | |
| `getCustomer` | _unverified_ | | ☐ | |
| `startKyc` | _unverified_ | | ☐ | Must be a provider-hosted flow; SpreddPay does not collect identity documents. |
| `getKycStatus` | _unverified_ | | ☐ | |
| `createAccount` | _unverified_ | | ☐ | |
| `getAccount` | _unverified_ | | ☐ | |
| `getBalances` | _unverified_ | | ☐ | Confirm whether available/pending/reserved are distinguished. |
| `createVirtualCard` | _unverified_ | | ☐ | |
| `getCard` | _unverified_ | | ☐ | |
| `freezeCard` | _unverified_ | | ☐ | |
| `unfreezeCard` | _unverified_ | | ☐ | |
| `listCardTransactions` | _unverified_ | | ☐ | Confirm pagination style and cursor semantics. |
| `validatePayoutDestination` | _unverified_ | | ☐ | |
| `createPayout` | _unverified_ | | ☐ | Blocked on [`rain-flow-of-funds.md`](./rain-flow-of-funds.md). |
| `getPayout` | _unverified_ | | ☐ | |
| `verifyWebhook` | _unverified_ | | ☐ | See [`rain-webhooks.md`](./rain-webhooks.md). |

## Field normalisation

SpreddPay's normalized types are in `packages/rain/src/types.ts`. They are *not*
Rain's wire format. Record each mapping here as it is verified.

| SpreddPay field | Rain field | Transform |
| --- | --- | --- |
| `NormalizedBalance.availableMinor` | _unverified_ | Must arrive as, or convert to, integer minor units. Never parse a decimal into a float. |
| `NormalizedCard.status` | _unverified_ | Map onto SpreddPay's `CardStatus`. An unmapped provider status must not default to `ACTIVE`. |
| `NormalizedTransaction.kind` | _unverified_ | Map onto `TransactionKind`. Refunds and reversals are separate rows, not edits. |

## Open questions for Rain

- Does the program support virtual card issuance directly, or via a cardholder
  object created first?
- Are spending controls settable through the API, and which of the controls
  SpreddPay models are supported? (Currently `CardControl.providerSynced` stays
  `false` and the UI says so.)
- Is there a supported secure method for revealing full card details, and does it
  require a hosted iframe?
- What is the sandbox behaviour for simulating card transactions?
