"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Callout, Card, CardBody, CardHeader, CardTitle, Field, Input } from "@spreddpay/ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function InviteTraderForm({ partnerId }: { partnerId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const body = {
      externalTraderId: String(form.get("externalTraderId")),
      email: String(form.get("email")),
      firstName: String(form.get("firstName")),
      lastName: String(form.get("lastName")),
      countryCode: String(form.get("countryCode")).toUpperCase(),
    };

    try {
      const response = await fetch(`${API_URL}/api/v1/partners/${partnerId}/traders`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          // Required on every mutating endpoint; a resubmit is then a no-op.
          "idempotency-key": `invite-${body.externalTraderId}-${Date.now()}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(payload?.error?.message ?? "Could not invite this trader.");
        return;
      }

      setOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>Invite trader</Button>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite a trader</CardTitle>
      </CardHeader>
      <CardBody>
        <form onSubmit={submit}>
          {error ? (
            <div className="mb-4">
              <Callout tone="critical">{error}</Callout>
            </div>
          ) : null}

          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field label="First name">
              <Input name="firstName" required maxLength={80} />
            </Field>
            <Field label="Last name">
              <Input name="lastName" required maxLength={80} />
            </Field>
            <Field label="Email">
              <Input name="email" type="email" required />
            </Field>
            <Field
              label="External trader ID"
              hint="Your own identifier for this trader. Must be unique."
            >
              <Input name="externalTraderId" required maxLength={80} placeholder="TRADER-28492" />
            </Field>
            <Field label="Country" hint="ISO 3166-1 alpha-2, e.g. US">
              <Input name="countryCode" required minLength={2} maxLength={2} placeholder="US" />
            </Field>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Inviting…" : "Send invite"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
