# Revenue

**Economics are configuration, not code.** Rain's commercial terms are not
hard-coded anywhere, because they are not yet agreed. Every share is a
`RevenueRule` row.

## Rules

```ts
type RevenueRule = {
  partnerId: string;
  source: string;                 // e.g. "interchange", "fx", "platform_fee"
  calculationType:
    | "BASIS_POINTS_OF_VOLUME"
    | "PERCENT_OF_NET_REVENUE"
    | "FIXED_PER_ACTIVE_CARD"
    | "FIXED_MONTHLY"
    | "CUSTOM";
  spreddPayShareBps: number | null;
  partnerShareBps: number | null;
  fixedAmountMinor: bigint | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};
```

Shares are basis points — integers — so a split never depends on floating-point
rounding. `allocate()` guarantees the parts sum back to the gross.

Rules are time-bounded. Changing terms means adding a rule with a new
`effectiveFrom`, never editing a historical one, so a past statement can always
be recomputed from the rules that were in force.

## Recognition

Only **realized** revenue is recognised. `RevenueEvent.realized` exists to make
that explicit, and TECHNICAL_README section 24 is direct about the Phase 2 case:
estimated or unrealized yield is never treated as settled revenue.

A `RevenueEvent` records gross, provider fee, net, and the SpreddPay and partner
shares — all in minor units, all as `BigInt`.

## Workflow

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

`PartnerSettlement` carries the period, the four totals, a status
(`DRAFT → UNDER_REVIEW → APPROVED → PAID`, or `DISPUTED`), a reviewer and a paid
timestamp. `RevenueEvent.settlementId` links the events that make it up.

## What is built

- The data model: `RevenueRule`, `RevenueEvent`, `PartnerSettlement`.
- The ledger recipe `revenue.recognized` (see [`ledger.md`](./ledger.md)).
- Exact-arithmetic helpers `applyBasisPoints` and `allocate`.
- Read-only revenue and settlement views in the partner portal.

## What is not built

Statement import, matching and settlement generation are Milestone 6. The admin
portal's `/revenue` screen says so rather than showing an empty table that
implies the numbers are simply zero.

## Phase 2 — yield revenue

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

The model exists so migrations are stable. No Blend markup or revenue share is
assumed — `userShareBps` defaults to 10000, meaning the trader keeps everything
until commercial terms say otherwise.
