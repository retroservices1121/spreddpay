# Ledger

A double-entry journal for workflow and reporting. It does **not** claim custody
— provider balances are the source of truth and are reconciled against, never
replaced by, these figures.

## Rules

Enforced in `packages/ledger/src/entry.ts`, not by convention:

1. **Every entry balances.** `validatePostings` throws `UnbalancedEntryError`
   with the exact difference if debits ≠ credits.
2. **Postings are append-only.** The Prisma client extension refuses deletes
   against `LedgerEntry` and `LedgerPosting`.
3. **Corrections are reversals.** `reverseEntry` writes the mirror image and
   links it via `reversesEntryId`. History is never edited.
4. **Every entry references a business event.** `eventType`, `entityType` and
   `entityId` are required.
5. **Ledger and business changes commit together.** Recipes take the transaction
   client, so an entry cannot exist without the change that caused it.
6. **Amounts are positive; direction carries the sign.** A negative posting is
   rejected.

## Chart of accounts

| Code | Type | Normal side | Meaning |
| --- | --- | --- | --- |
| `PARTNER_PAYOUTS_PENDING` | ASSET | Debit | Approved payout value in flight toward a trader |
| `PARTNER_PAYOUTS_COMPLETED` | ASSET | Debit | Cumulative delivered payout value |
| `USER_AVAILABLE_REPORTING` | LIABILITY | Credit | The trader's spendable claim |
| `USER_RESERVED_REPORTING` | LIABILITY | Credit | The trader's claim on an approved but undelivered payout |
| `CARD_SPEND_PENDING` | LIABILITY | Credit | Held against an open authorization |
| `CARD_SPEND_CLEARED` | LIABILITY | Credit | Settled card spend |
| `CARD_REFUNDS` | ASSET | Debit | Contra-spend from refunds and reversals |
| `PROVIDER_FEES` | EXPENSE | Debit | Fees charged by a provider |
| `SPREDDPAY_REVENUE` | REVENUE | Credit | SpreddPay's realized share |
| `PARTNER_REVENUE_PAYABLE` | LIABILITY | Credit | The partner's realized share, owed to them |
| `ADJUSTMENTS` | EQUITY | — | Clearing account for revenue recognition and manual corrections |

Accounts are created per partner and per asset on first use, so a partner's USDC
and EUR books never mix.

## Recipes

Each business event maps to exactly one named entry in
`packages/ledger/src/recipes.ts`.

### `payout.approved`

An obligation exists; funds have not reached the trader.

| Account | Direction | Amount |
| --- | --- | --- |
| `PARTNER_PAYOUTS_PENDING` | DEBIT | payout |
| `USER_RESERVED_REPORTING` | CREDIT | payout |

### `payout.completed`

Funds are available through the approved Rain flow.

| Account | Direction | Amount |
| --- | --- | --- |
| `USER_RESERVED_REPORTING` | DEBIT | payout |
| `USER_AVAILABLE_REPORTING` | CREDIT | payout |
| `PARTNER_PAYOUTS_COMPLETED` | DEBIT | payout |
| `PARTNER_PAYOUTS_PENDING` | CREDIT | payout |

The reservation is released and the claim becomes spendable, while the in-flight
asset moves to delivered. Debits and credits each total twice the payout, which
is correct — two independent pairs.

### `payout.failed`

Unwinds the reservation created at approval.

| Account | Direction | Amount |
| --- | --- | --- |
| `USER_RESERVED_REPORTING` | DEBIT | payout |
| `PARTNER_PAYOUTS_PENDING` | CREDIT | payout |

Only posted when the payout had actually been approved. A payout that fails
before approval has no reservation to unwind.

### `transaction.pending` (authorization)

| Account | Direction | Amount |
| --- | --- | --- |
| `USER_AVAILABLE_REPORTING` | DEBIT | authorization |
| `CARD_SPEND_PENDING` | CREDIT | authorization |

### `transaction.cleared` (settlement)

| Account | Direction | Amount |
| --- | --- | --- |
| `CARD_SPEND_PENDING` | DEBIT | settlement |
| `CARD_SPEND_CLEARED` | CREDIT | settlement |

### `transaction.refunded`

| Account | Direction | Amount |
| --- | --- | --- |
| `CARD_REFUNDS` | DEBIT | refund |
| `USER_AVAILABLE_REPORTING` | CREDIT | refund |

Declines post nothing — no money moved.

### `revenue.recognized`

| Account | Direction | Amount |
| --- | --- | --- |
| `ADJUSTMENTS` | DEBIT | gross |
| `SPREDDPAY_REVENUE` | CREDIT | SpreddPay share |
| `PARTNER_REVENUE_PAYABLE` | CREDIT | partner share |
| `PROVIDER_FEES` | CREDIT | residual |

Anything a revenue rule does not allocate lands in `PROVIDER_FEES` rather than
silently inflating SpreddPay's share.

## Reconciliation

`assertBooksBalance(db, partnerId)` sums every posting for a partner and throws
if debits ≠ credits. It runs:

- every five minutes in the worker (`reconcileLedgers`), which opens a
  `ManualOperation` of kind `LEDGER_IMBALANCE` on failure;
- on demand at `/reconciliation` in the admin portal.

An imbalance is **never** corrected automatically. It is a human decision,
resolved with a reversing entry.

## Rounding

`allocate(amount, weights)` splits a value so the parts always sum back to the
whole; the remainder from integer division goes to the largest weight. This is
what keeps a revenue split reconciling to the minor unit. See the tests in
`packages/contracts/src/money.test.ts`.
