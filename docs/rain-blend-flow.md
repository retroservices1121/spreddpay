# Rain → Blend flow of funds

**Status: not designed. Blocks Milestone 10 entirely.**

> TECHNICAL_README section 23: *"Do not assume direct movement between Rain and
> Blend."*

No code moves value between the two providers, and none will until this document
is approved by **both** Rain and Blend.

## What must be answered

| Question | Answer |
| --- | --- |
| **Originating wallet/account** — what does the transfer actually leave from? | _unanswered_ |
| **User signature** — must the trader sign? With what? | _unanswered_ |
| **Does Rain permit withdrawal to the Blend Safe?** | _unanswered_ — this is the gating question. If the answer is no, there is no flow. |
| **Supported asset and chain** on both sides | _unanswered_ |
| **Bridging** — is a bridge involved, and whose? | _unanswered_ |
| **Fees** — bridge, gas, provider; who pays, how quoted | _unanswered_ |
| **Expected timing** — typical and worst case | _unanswered_ |
| **Card-balance impact** — what happens to spendable balance, and when | _unanswered_ |
| **Failure recovery** — where do funds sit if a leg fails, and how are they recovered | _unanswered_ |
| **Return transfer path** — Blend back to Rain, and whether it is symmetric | _unanswered_ |

## Completion criteria

A Blend deposit is complete **only** after all four of:

1. the source transfer succeeds,
2. Blend settlement succeeds,
3. the Blend balance updates,
4. reconciliation succeeds.

Any earlier "completed" is wrong. The `YieldTransaction` state machine
(`DRAFT → PENDING_AUTHORIZATION → SUBMITTED → BRIDGING → SETTLING → COMPLETED`)
exists to make each leg observable rather than collapsing them.

## Auto-allocation

Auto-allocation — "keep at least $500 available to spend, move the rest to
Earn" — is **opt-in only** and depends entirely on this flow existing. It is
Milestone 11, after this document is approved.

## Until then

- The trader dashboard states that Earn is coming. It shows no balance and no
  rate, because there is no honest number to show.
- `YieldAccount.status` defaults to `NOT_ENABLED`.
- The `blend_yield_enabled` flag is off for every partner.
- `packages/blend` throws on every method.

Building the movement first and documenting it later would mean shipping a funds
flow that neither provider has agreed to. That is the one thing this document
exists to prevent.
