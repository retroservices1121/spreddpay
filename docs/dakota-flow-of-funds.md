# Dakota flow of funds

**Status: signing-key custody is unresolved. That blocks any real transfer.**

Dakota's wallets are **non-custodial**. A transfer requires an intent that is
canonicalised (RFC 8785), SHA-256 hashed, and signed with an **ES256** private
key. An API key alone cannot move funds.

This is a better security posture than a custodial provider — a leaked API key
does not drain a wallet. It also means Spredd Pay must answer a question Rain
would have answered for us: **where does the signing key live, and who can make
it sign?**

## The blocking question

| Option | Trade-off |
| --- | --- |
| **Key on the API server** | Simplest. But the server becomes the single thing standing between an intrusion and every partner's funds — it is functionally custodial, with none of a custodian's controls. |
| **Key in an HSM / KMS** (AWS KMS, GCP KMS, Turnkey…) | The key is never in application memory; the server asks the HSM to sign. Auditable, revocable. Requires a cloud KMS that supports ES256 raw signing. |
| **Key held by the partner** | The firm signs its own payouts. Strongest — Spredd Pay never can move partner funds — but every payout needs a human, which defeats automated payouts. |
| **Multi-party via signer groups** | Dakota supports signer groups and policies with approval thresholds. Spredd Pay holds one key, the partner another, and a policy requires both. Maps naturally onto the existing dual-approval rule. |

**Recommendation, not a decision:** the fourth option is the closest fit to what
the platform already models. Spredd Pay's dual-approval threshold and Dakota's
policy `approval_threshold` express the same intent at two layers, and having
the on-chain policy mirror the business rule means a compromised Spredd Pay alone
cannot release a payout above the threshold.

Nothing in the adapter presumes an answer. `submitWalletTransaction` takes
signatures it is given; it does not create them.

## Also unresolved

| Question | Answer |
| --- | --- |
| Is a trader a Dakota **Customer** (own wallet, own KYC) or a **Recipient** (destination only)? | _unanswered_ — see the architectural note in [`dakota-api-map.md`](./dakota-api-map.md) |
| Which network? Dakota lists `ethereum-mainnet`, `polygon-mainnet` and others; Spredd Pay currently assumes Base. | _unanswered_ — confirm via `GET /info/networks` |
| Who funds the partner wallet, and how? Dakota's onramp accounts convert USD→USDC via ACH. | _unanswered_ |
| Gas. Who pays, and is it deducted from the payout? | _unanswered_ |
| Sandbox caps transfers at **$2** and rejects mainnet ids. The demo's 4,850 USDC payout cannot run in sandbox as-is. | Known — the mock covers the demo; sandbox tests need smaller amounts |
| Webhook signature scheme | _unverified_ — `verifyWebhook` throws in every mode |

## What is already built and provider-agnostic

The payout engine does not care which provider settles a transfer:

- approvals, dual approval and the self-approval rule
- idempotency, duplicate reference detection, per-payout and daily limits
- the double-entry ledger and its reversals
- the manual-operations queue for anything that cannot complete automatically
- reconciliation

A payout that cannot be submitted lands in `MANUAL_REVIEW` with an operations
task. It is never marked delivered on an assumption — which is exactly the
behaviour needed while the questions above are open.

## Cards

Dakota has no card product today. Card issuance is deferred until their
design-partner card programme opens (expected ~6 weeks from August 2026). The
card data model, state machines and UI remain in place and dormant; the trader
and partner card screens say "coming soon" rather than offering a flow that
cannot complete.
