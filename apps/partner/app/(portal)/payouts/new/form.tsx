"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PayoutDto, TraderDto } from "@spreddpay/contracts";
import {
  Button,
  Callout,
  Card,
  CardBody,
  Field,
  Input,
  Select,
} from "@spreddpay/ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function NewPayoutForm({
  partnerId,
  traders,
}: {
  partnerId: string;
  traders: TraderDto[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * One idempotency key per form instance. Re-submitting after a network blip
   * replays the original response instead of creating a second payout — which
   * is the entire point of the header.
   */
  const [idempotencyKey] = useState(
    () => `payout-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const body = {
      traderId: String(form.get("traderId")),
      externalReference: String(form.get("externalReference")),
      // Sent as a string. A JSON number would round 4850.10 in transit.
      amount: String(form.get("amount")),
      asset: "USDC",
      memo: String(form.get("memo") ?? "") || undefined,
      submitForApproval: true,
    };

    try {
      const response = await fetch(`${API_URL}/api/v1/partners/${partnerId}/payouts`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify(body),
      });

      const payload = (await response.json().catch(() => null)) as
        | (PayoutDto & { error?: { message?: string } })
        | null;

      if (!response.ok) {
        setError(payload?.error?.message ?? "Could not create this payout.");
        return;
      }

      router.push(`/payouts/${payload?.id ?? ""}`);
      router.refresh();
    } catch {
      setError("Could not reach the SpreddPay API.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardBody>
        <form onSubmit={submit}>
          {error ? (
            <div className="mb-4">
              <Callout tone="critical">{error}</Callout>
            </div>
          ) : null}

          <Field label="Trader">
            <Select name="traderId" required defaultValue="">
              <option value="" disabled>
                Select a trader
              </option>
              {traders.map((trader) => (
                <option key={trader.id} value={trader.id}>
                  {trader.firstName} {trader.lastName} · {trader.externalTraderId}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="External reference"
            hint="Your own reference for this payout. Must be unique — this is the duplicate guard."
          >
            <Input name="externalReference" required maxLength={120} placeholder="PO-2026-0002" />
          </Field>

          <Field label="Amount (USDC)" hint="Up to six decimal places.">
            <Input
              name="amount"
              required
              inputMode="decimal"
              pattern="^\d{1,15}(\.\d{1,6})?$"
              placeholder="4850.00"
              className="tabular"
            />
          </Field>

          <Field label="Memo" hint="Optional. Shown on the payout record.">
            <Input name="memo" maxLength={280} placeholder="January performance payout" />
          </Field>

          <Callout tone="neutral">
            Payouts at or above your program&apos;s dual-approval threshold must be approved by
            someone other than the person who created them.
          </Callout>

          <div className="mt-4 flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create and submit for approval"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
