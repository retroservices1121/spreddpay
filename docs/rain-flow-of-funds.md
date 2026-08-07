# Rain flow of funds

**Status: not designed. This must be answered by Rain before any money moves.**

> TECHNICAL_README section 13: *"Do not assume the actual movement architecture…
> The approved model may be Rain-managed accounts, prefunded program balances,
> partner wallet funding, stablecoin transfer, or another Rain-defined flow.
> Build only what Rain confirms."*

Nothing in the codebase assumes an answer. `submitPayout` in
`apps/api/src/services/payouts.ts` calls the Rain adapter and, when the adapter
cannot complete, moves the payout to `MANUAL_REVIEW` and opens a
`ManualOperation` — it never marks a payout as delivered on the strength of an
assumption.

## What this document must contain before Milestone 5

| Question | Answer |
| --- | --- |
| **Source account** — where do funds leave from? | _unanswered_ |
| **Destination account** — what does the trader actually receive into? | _unanswered_ |
| **Supported asset** | _unanswered_ (assumed USDC in configuration only) |
| **Supported network** | _unanswered_ (assumed Base in configuration only) |
| **Prefunding** — must the partner or Spredd Pay prefund a program balance? How is it topped up? What happens when it runs dry? | _unanswered_ |
| **Confirmation rules** — how many confirmations, and what does Rain consider final? | _unanswered_ |
| **Settlement timing** — expected and worst case | _unanswered_ |
| **Gas / network fees** — who pays, how is it quoted, is it deducted from the payout or charged separately? | _unanswered_ |
| **Failure recovery** — what happens to funds on a failed transfer, and how long until they are recoverable? | _unanswered_ |
| **Reconciliation procedure** — how is Spredd Pay's ledger reconciled against Rain's record, and at what cadence? | _unanswered_ |
| **Transaction-monitoring ownership** — who screens transactions, and what is Spredd Pay's obligation? | _unanswered_ |

## Candidate models (none selected)

Listed only so the questions above are concrete. Rain decides which, if any,
applies.

1. **Rain-managed accounts.** Each trader has a Rain account; a payout is an
   internal transfer within Rain. No chain transaction from Spredd Pay.
2. **Prefunded program balance.** Spredd Pay or the partner maintains a float with
   Rain; payouts draw down against it.
3. **Partner wallet funding.** The partner funds each payout from their own
   wallet; Spredd Pay orchestrates but never holds funds.
4. **Direct stablecoin transfer.** Funds move on-chain to an address Rain
   controls on the trader's behalf.

Each has materially different implications for prefunding, failure recovery,
fee attribution and what Spredd Pay's ledger should record. Implementing before
this is settled would mean rewriting the payout engine.

## What is already built

- `Payout` lifecycle with dual approval, limits, duplicate detection and
  idempotency.
- `ProviderTransfer` rows recording each instruction sent to a provider, with
  request/response payloads, fee and transaction hash fields.
- Ledger recipes for `payout.approved`, `payout.completed` and `payout.failed`
  (`packages/ledger/src/recipes.ts`), which are independent of how funds actually
  move.
- A manual-operations queue for anything the automated path cannot complete.

## Blocked on this document

- Any real `createPayout` implementation in `RainSandboxService`.
- Milestone 5 in full.
- The `payout.completed` transition being driven by a real Rain webhook rather
  than the demo path.
