# Dakota API map

**Provider:** Dakota — regulated stablecoin infrastructure.
**Docs:** https://docs.dakota.xyz (public) · OpenAPI: https://docs.dakota.xyz/openapi.yaml
**Plan:** self-serve, pay-as-you-go.

Unlike the Rain adapter, Dakota's documentation is public, so this file records
**transcribed** endpoints rather than a list of unknowns. Where a field is not
described in the docs, the adapter keeps the raw payload on the returned object
instead of inventing a property.

## Environments

| | |
| --- | --- |
| Production | `https://api.platform.dakota.xyz` |
| Sandbox | `https://api.platform.sandbox.dakota.xyz` |

Sandbox constraints from their docs: mainnet network ids are rejected, transfers
are capped at **$2 per request**, and only USDC/RD are supported.

## Authentication

Three headers on every call:

| Header | Notes |
| --- | --- |
| `X-API-Key` | The client API key |
| `X-Idempotency-Key` | UUID. Sent on every mutating request by the adapter. |
| `Content-Type` | `application/json` |

## Domain model

Dakota's own terminology, which does **not** map one-to-one onto SpreddPay's:

| Dakota | Meaning |
| --- | --- |
| **Client** | Us. SpreddPay. |
| **Customer** | A business or individual we process payments for. Requires KYB/KYC. |
| **Sub-Client** | A business customer designated at creation as an intermediary, so other customers group beneath it. |
| **Recipient** | An entity that receives payments on behalf of a customer. |
| **Destination** | The bank account or crypto address funds actually reach. |
| **Wallet** | Non-custodial, on-chain, governed by signer groups and policies. |
| **Account** | An automated onramp/offramp configuration. |

## Capability map

| SpreddPay method | Dakota endpoint | Verified |
| --- | --- | --- |
| `createCustomer` | `POST /customers` | ✅ documented |
| `getCustomer` | `GET /customers/{id}` | ✅ documented |
| `listCustomers` | `GET /customers` | ✅ documented |
| `mintApplicationLink` | `POST /customers/{id}/application-link` | ⚠️ path inferred from the index entry "Mint a Fresh Application Link"; confirm against openapi.yaml |
| `createRecipient` | `POST /customers/{customer_id}/recipients` | ✅ documented |
| `createCryptoDestination` | `POST /recipients/{recipient_id}/destinations` | ✅ documented |
| `createWallet` | `POST /wallets` | ✅ documented |
| `getWallet` | `GET /wallets/{id}` | ✅ documented |
| `getWalletBalances` | `GET /wallets/{id}/balances` | ⚠️ index lists "Get Wallet Balances Across All Networks"; confirm exact path and response shape |
| `submitWalletTransaction` | `POST /wallets/{wallet_id}/transactions` | ✅ documented |
| `getTransaction` | `GET /transactions/{id}` | ✅ documented |
| `listTransactions` | `GET /transactions` | ✅ documented |
| `verifyWebhook` | — | ❌ **not implemented — throws** |

Everything marked ⚠️ should be checked against `openapi.yaml` before sandbox
testing. Everything marked ❌ throws rather than returning a permissive default.

## Onboarding flow (documented)

1. `POST /customers` → returns `id`, `application_id`, `application_url`.
2. Send the customer to `application_url` — Dakota hosts the KYB/KYC form, so
   SpreddPay never handles identity documents.
3. Wait for `kyb_status: "active"`, via the `customer.kyb_status.updated`
   webhook in production or
   `POST /sandbox/simulate/onboarding` with `type: "kyb_approve"` in sandbox.

The adapter never defaults an unknown status to something permissive: an
unrecognised `kyb_status` becomes `"unknown"`, which no eligibility check treats
as approved.

## Wallets are non-custodial — this is the big one

A Dakota wallet transaction requires an intent that is:

1. built as `{ wallet_id, caip2, operation { kind, from, to, amount, asset_id }, idempotency_key }`
2. canonicalised per **RFC 8785 (JCS)**
3. SHA-256 hashed
4. signed with an **ES256** private key, DER-encoded, base64'd
5. submitted alongside the intent

**An API key alone cannot move funds.** That is a materially stronger posture
than a custodial provider — and a real constraint: SpreddPay must hold a signing
key somewhere, and where that key lives is a security decision, not an
implementation detail. It is deliberately unanswered in code.
See [`dakota-flow-of-funds.md`](./dakota-flow-of-funds.md).

Wallets also require at least one **signer group** and one **policy** at
creation. The mock enforces this too, so the demo cannot drift into a shape the
real API would reject.

## What Dakota does not do

**No card issuing.** There are no card endpoints anywhere in Dakota's
documentation. Card issuance is deferred until Dakota's design-partner card
programme opens (expected ~6 weeks from August 2026).

Consequences already applied in the product:

- The trader card screen shows "coming soon" rather than an issuance flow.
- The partner cards list explains that issuance is not yet open.
- `Card`, `CardControl` and `CardTransaction` remain in the schema and are
  dormant. The state machines and UI still work, so a card programme can be
  switched on without rebuilding them.

## Webhooks — not yet mapped

`verifyWebhook` throws in **every** mode, including mock. An unverified webhook
that the platform treated as authentic would let anyone who learns the URL mark
payouts as settled.

To be read from https://docs.dakota.xyz/documentation/webhooks:

| Question | Answer |
| --- | --- |
| Signature header name | _unverified_ |
| Signing algorithm | _unverified_ |
| Is a timestamp signed (replay window)? | _unverified_ |
| Event type names | _unverified_ — `customer.kyb_status.updated`, `wallet.deposit`, `wallet.transaction.created`, `wallet.transaction.updated`, `transaction.auto.created`, `transaction.auto.updated` appear in the flow docs but have not been confirmed against the webhook reference |
| Retry and replay semantics | _unverified_ — `POST /webhooks/{id}/replay` exists in the index |

## Open architectural question

Dakota has no "account with a balance" for an end user in the way Rain did. Two
shapes are possible, and they are materially different products:

**A. Trader as Recipient.** SpreddPay or the partner holds one Dakota wallet;
each trader is a Recipient with a crypto Destination they control. Payouts are
wallet transactions out to that destination.
*Simple, and the trader custodies their own funds — but SpreddPay shows no
trader balance, because the funds leave the platform's view on payout.*

**B. Trader as Customer with their own wallet.** Each trader is a Dakota
Customer, KYB/KYC'd, with their own non-custodial wallet.
*Matches the current product — the trader has a balance in the app — but every
trader must complete Dakota onboarding, and the signing-key question applies per
wallet.*

The existing payout engine, ledger and approvals work under either. Choosing
between them is a product and compliance decision, and nothing in the adapter
presumes the answer.
