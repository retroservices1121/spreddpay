# Rain program limitations

Capabilities SpreddPay's UI or data model anticipates, but which Rain has **not**
confirmed for this program. Anything listed here must be feature-flagged off or
labelled honestly in the interface — never simulated.

## Current status

The program has not been reviewed against Rain's documentation yet, so the
column that matters is "Confirmed", and it is empty for everything.

| Capability | Modelled in SpreddPay | Confirmed by Rain | Current behaviour |
| --- | --- | --- | --- |
| Virtual card issuance | `Card`, `issueVirtualCard` | ☐ | Mock only |
| Freeze / unfreeze | `freezeCard` / `unfreezeCard` | ☐ | Mock only |
| Spending controls pushed to the network | `CardControl` | ☐ | **Stored, not enforced.** `providerSynced` stays `false`; the partner UI shows a "recorded, not yet enforced by the network" notice. |
| Full card detail reveal | — | ☐ | Feature flag `card_detail_reveal` is **off**. No reveal path exists. |
| Digital wallet provisioning (Apple/Google Pay) | — | ☐ | Feature flag `digital_wallet_provisioning` is **off**. |
| Physical cards | `CardType.PHYSICAL` | ☐ | Feature flag `physical_cards` is **off**. Only `VIRTUAL` is issuable. |
| Available / pending / reserved balance split | `NormalizedBalance` | ☐ | Mock reports all three; whether Rain distinguishes them is unknown. |
| Payout / transfer API | `createPayout` | ☐ | Blocked on [`rain-flow-of-funds.md`](./rain-flow-of-funds.md). |
| Provider-hosted KYC | `startKyc` | ☐ | Mock returns a placeholder hosted URL. |
| Transaction simulation in sandbox | `MockRainService.seedTransaction` | ☐ | Mock only. |

## Rules

- A capability that is not confirmed does not ship enabled. `FEATURE_FLAGS` in
  `packages/config/src/constants.ts` is where each one is gated.
- The sandbox adapter throws `RainCapabilityUnavailableError`, which the API
  surfaces as HTTP 501 with a message pointing at this file. It does not fall
  back to mock behaviour.
- Where SpreddPay stores something the provider does not enforce — spending
  controls being the live example — the UI must say so. Showing a limit that
  nothing enforces is worse than showing no limit.

## When a capability is confirmed

1. Record the endpoint in [`rain-api-map.md`](./rain-api-map.md).
2. Implement it in `RainSandboxService`.
3. Add a sandbox test.
4. Move the row out of this file.
5. Turn on the feature flag, per partner first.
