"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@spreddpay/ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Drives the onboarding state machine one step at a time.
 *
 * Each click performs exactly one provider interaction, which is what makes the
 * demo legible: the operator can see KYC, then the Rain account, then card
 * eligibility land as distinct steps rather than one opaque jump.
 */
export function TraderActions({
  partnerId,
  traderId,
  status,
  canAdvance,
  canIssueCard,
}: {
  partnerId: string;
  traderId: string;
  status: string;
  canAdvance: boolean;
  canIssueCard: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(path: string, body?: unknown) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/v1${path}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `${traderId}-${path}-${Date.now()}`,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(payload?.error?.message ?? "Request failed.");
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const canStep =
    canAdvance &&
    ![
      "VIRTUAL_CARD_ACTIVE",
      "KYC_REJECTED",
      "COUNTRY_UNSUPPORTED",
      "ACCOUNT_RESTRICTED",
      "CARD_INELIGIBLE",
    ].includes(status);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {canStep ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => call(`/partners/${partnerId}/traders/${traderId}/advance`)}
          >
            {pending ? "Working…" : "Advance onboarding"}
          </Button>
        ) : null}

        {canIssueCard && status === "CARD_ELIGIBLE" ? (
          <Button
            disabled={pending}
            onClick={() => call(`/partners/${partnerId}/cards`, { traderId, type: "VIRTUAL" })}
          >
            Issue virtual card
          </Button>
        ) : null}
      </div>
      {error ? <p className="max-w-xs text-right text-xs text-critical">{error}</p> : null}
    </div>
  );
}
