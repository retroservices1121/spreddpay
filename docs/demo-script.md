# Demo script

Target: **under three minutes**, per TECHNICAL_README section 3.

## Before you start

```bash
pnpm demo:reset
pnpm dev
```

Three tabs:

| Tab | URL | Sign in as |
| --- | --- | --- |
| Partner | http://localhost:3002 | `creator@demotradingfirm.example` |
| Partner (second) | http://localhost:3002 | `approver@demotradingfirm.example` |
| Trader | http://localhost:3001 | `alex.morgan@example.com` |

Password for every demo account: `SpreddPayDemo123!`
Admin portal, if needed: http://localhost:3003 as `ops@spreddpay.com`.

The seed already gives you Demo Trading Firm trading as **Demo Pay**, with Alex
Morgan (TRADER-28491) fully onboarded — KYC approved, Rain account active,
virtual card active — a 4,850 USDC payout in `DRAFT`, and one pending $84.23
card transaction.

## The run

**0:00 — The firm and its brand.** Partner portal → **Branding**. Point out that
this is one deployment serving every tenant: the product name, colours and card
label are the partner's, and the live card preview updates as you change them.
The trader never sees Spredd Pay unless the partner wants them to.

**0:20 — The traders.** → **Traders**. Alex Morgan is `VIRTUAL_CARD_ACTIVE`. Open
the record: the onboarding trail runs INVITED → … → VIRTUAL_CARD_ACTIVE, each
step a separate provider interaction, each one audited.

*(Optional, +20s: use **Invite trader** to add one, then **Advance onboarding**
repeatedly to walk a new trader through KYC, account creation and card
eligibility live.)*

**0:50 — Create the payout.** → **Payouts → New payout**. Alex Morgan, reference
`PO-2026-0002`, amount `4850.00`. Submit.

Two things worth naming as you do it:

- The amount goes over the wire as the **string** `"4850.00"`. A JSON number
  would round it. Every value in this system is an integer count of minor units.
- The request carries an **Idempotency-Key**. Submitting twice returns the first
  payout, it does not create a second.

**1:20 — Dual approval.** The payout is `PENDING_APPROVAL` and flagged **dual**,
because 4,850 is over the firm's 1,000 threshold. As the *creator*, there is no
Approve button — the screen says why. This is the rule that payout creators
cannot approve their own high-value payouts, enforced server-side, not hidden in
the UI.

**1:40 — Approve as someone else.** Switch to the approver tab, open the payout,
**Approve**. It moves through approval and submission. The approval trail now
shows two named people.

**2:00 — The trader's view.** Switch to the trader tab → **Home**. The balance
reflects the payout, and the branded card is on screen — Demo Pay, not Spredd Pay.

**2:20 — The card.** → **Card**. **Freeze card**; the card greys out and the
status badge flips. Unfreeze it. Note what is *not* on screen: no full card
number, no CVV. Those live with the card provider and never touch this database.

**2:40 — Activity.** → **Activity**. The $84.23 Online Purchase authorization is
pending. Back in the partner portal → **Transactions**, the same transaction is
visible to the firm, exportable as CSV.

**2:50 — The books.** Partner portal → **Dashboard**: active traders, pending
KYC, active cards, payout volume, card spend, activation rate. If you have a
moment, admin portal → **Reconciliation** shows every partner's ledger balancing
to the minor unit.

## What to say if asked

**"Is this connected to Rain?"** Not yet. `RAIN_MODE=mock` runs a deterministic
in-memory provider so the product can be demonstrated without credentials. The
adapter interface is real and typed; the sandbox implementation deliberately
throws on every method until each endpoint is verified against Rain's private
documentation. Nothing here invents a provider endpoint.

**"Where does the money actually move?"** That is
`docs/rain-flow-of-funds.md`, and it is deliberately unanswered. Rain defines
the model. The payout engine, approvals, limits, ledger and reconciliation are
all built and independent of the answer — but no payout is marked delivered on
an assumption.

**"What about yield / Earn?"** Phase 2. The interface exists, every method
throws, and the trader dashboard says Earn is coming rather than showing a rate.
There is no yield number to show until Blend is integrated, and inventing one
would be a promise the product cannot keep.

**"Can a firm see another firm's data?"** No, and not by convention. Every
tenant-scoped query runs through a client that injects `partnerId` into the
query itself. A handler that forgets its filter still cannot leak. There are
tests that prove it against a real database.

## Reset between runs

```bash
pnpm demo:reset
```

Deterministic: the same ids, card digits and timestamps every time, so
screenshots stay stable. It refuses to run against a database that does not look
disposable.
