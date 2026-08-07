"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Callout } from "@spreddpay/ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Terms version the trader accepts. Recorded with the acceptance timestamp. */
const TERMS_VERSION = "2026-01-terms-v1";

export function OnboardingStep({
  status,
  failureMessage,
}: {
  status: string;
  failureMessage: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  async function advance() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/v1/me/onboarding/start`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acceptedTermsVersion: TERMS_VERSION }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(payload?.error?.message ?? "Something went wrong.");
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function issueCard() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/v1/me/cards`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(payload?.error?.message ?? "Could not issue your card.");
        return;
      }
      router.push("/card");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (failureMessage) {
    return <Callout tone="critical">{failureMessage}</Callout>;
  }

  if (status === "VIRTUAL_CARD_ACTIVE") {
    return (
      <div className="flex flex-col gap-3">
        <Callout tone="positive">Your account is fully set up.</Callout>
        <Button onClick={() => router.push("/dashboard")}>Go to your dashboard</Button>
      </div>
    );
  }

  if (status === "CARD_ELIGIBLE") {
    return (
      <div className="flex flex-col gap-3">
        {error ? <Callout tone="critical">{error}</Callout> : null}
        <Button onClick={issueCard} disabled={pending}>
          {pending ? "Issuing…" : "Issue my virtual card"}
        </Button>
      </div>
    );
  }

  if (status === "TERMS_PENDING") {
    return (
      <div className="flex flex-col gap-3">
        {error ? <Callout tone="critical">{error}</Callout> : null}
        <label className="flex items-start gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            className="mt-0.5"
          />
          <span>
            I accept the terms of service and understand that identity verification is carried out
            by the card infrastructure provider, not by my firm.
          </span>
        </label>
        <Button onClick={advance} disabled={pending || !accepted}>
          {pending ? "Continuing…" : "Accept and continue"}
        </Button>
      </div>
    );
  }

  if (status === "KYC_PENDING" || status === "KYC_REVIEW" || status === "RAIN_ACCOUNT_PENDING") {
    return (
      <div className="flex flex-col gap-3">
        {error ? <Callout tone="critical">{error}</Callout> : null}
        <Callout tone="caution">
          We are waiting on our provider. Check back in a moment.
        </Callout>
        <Button variant="secondary" onClick={advance} disabled={pending}>
          {pending ? "Checking…" : "Check status"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <Callout tone="critical">{error}</Callout> : null}
      <Button onClick={advance} disabled={pending}>
        {pending ? "Working…" : "Continue"}
      </Button>
    </div>
  );
}
