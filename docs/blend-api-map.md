# Blend API map

**Status: Phase 2. Not started, and deliberately so.**

The Milestone 1 instruction is explicit: *"Do not implement Blend."*
`packages/blend/src/index.ts` contains the interface shape from TECHNICAL_README
section 21 and nothing else — every method throws `BlendNotImplementedError`.

> TECHNICAL_README section 21: *"Use exact current Blend SDK/API methods. Do not
> invent methods."*

The method names in `BlendYieldService` are **SpreddPay's own adapter surface**,
taken from the specification. They are not a claim about Blend's SDK. Whoever
implements this reads the real method names from Blend's current documentation
and maps onto them here — the same discipline as the Rain adapter.

## Sources to read first

- https://docs.blend.money/
- https://docs.blend.money/build/overview
- https://docs.blend.money/architecture/overview
- https://docs.blend.money/llms.txt

## Capability map

| SpreddPay method | Blend SDK / API | Verified | Notes |
| --- | --- | --- | --- |
| `getOrCreateAccount` | _unverified_ | ☐ | Blend describes isolated per-user Gnosis Safes. Confirm creation semantics and whether it is idempotent. |
| `getBalance` | _unverified_ | ☐ | Must return the current APY separately, with its own `asOf`. |
| `listStrategies` | _unverified_ | ☐ | |
| `createDepositIntent` | _unverified_ | ☐ | Confirm whether the trader must sign. |
| `submitDeposit` | _unverified_ | ☐ | |
| `createWithdrawalIntent` | _unverified_ | ☐ | |
| `submitWithdrawal` | _unverified_ | ☐ | Confirm unwind timing and whether it is deterministic. |
| `getTransaction` | _unverified_ | ☐ | |
| Status synchronisation | _unverified_ | ☐ | Webhooks or polling — whichever Blend documents. |

## Authentication and configuration

| Question | Answer |
| --- | --- |
| Auth scheme | _unverified_ |
| Base URL — sandbox | _unverified_ |
| Base URL — production | _unverified_ |
| Organisation identifier semantics (`BLEND_ORGANIZATION_ID`) | _unverified_ |
| Webhook signature scheme (`BLEND_WEBHOOK_SECRET`) | _unverified_ |
| Compliance controls Blend applies, and what SpreddPay must apply | _unverified_ |

## Product rules that constrain the implementation

From TECHNICAL_README sections 20, 22 and 26 — these are not negotiable by the
implementation:

- **Balances stay separate.** Rain spend balance and Blend earn balance are
  always displayed separately. Never imply Blend funds are instantly spendable
  on the card unless a provider-approved automatic return flow exists.
- **The rate comes from Blend.** It must be labelled variable, identify whether
  it is gross or net, and never be described as guaranteed.
- **Earn is not a savings account** unless that description is approved.
- **No promised returns.** No FDIC or bank insurance claims unless explicitly
  applicable.
- **Opt-in only,** with recorded disclosures — version and timestamp.
- **Fail closed** when eligibility is unknown.
- **No automated Rain-to-Blend movement** until
  [`rain-blend-flow.md`](./rain-blend-flow.md) is approved by both providers.

## Gating

Everything ships behind the `blend_yield_enabled` feature flag, which the demo
seed creates **off** for every partner.

## Data model

Already migrated so the schema is stable: `YieldAccount`, `YieldTransaction`,
`YieldStrategy`, `YieldRevenueRule`. Their state machines are defined in
`packages/contracts/src/state-machines.ts`. No code path writes to them.
