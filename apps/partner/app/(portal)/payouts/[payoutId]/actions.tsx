"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Callout } from "@spreddpay/ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function PayoutActions({
  partnerId,
  payoutId,
  status,
  canApprove,
  canCancel,
  blockedBySelfApproval,
}: {
  partnerId: string;
  payoutId: string;
  status: string;
  canApprove: boolean;
  canCancel: boolean;
  blockedBySelfApproval: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "critical" | "caution"; text: string } | null>(
    null,
  );

  async function call(action: string, body?: unknown) {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(
        `${API_URL}/api/v1/partners/${partnerId}/payouts/${payoutId}/${action}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body ?? {}),
        },
      );

      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: string }; submitted?: boolean; submissionError?: string }
        | null;

      if (!response.ok) {
        setMessage({ tone: "critical", text: payload?.error?.message ?? "Request failed." });
        return;
      }

      // Approval succeeded but provider submission may not have. Say so
      // rather than implying money moved.
      if (payload && payload.submitted === false && payload.submissionError) {
        setMessage({
          tone: "caution",
          text: `Approved, but submission to Rain did not complete: ${payload.submissionError} The payout is in manual review and an operations task has been raised.`,
        });
      }

      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const showApprove = canApprove && status === "PENDING_APPROVAL" && !blockedBySelfApproval;
  const showReject = canApprove && status === "PENDING_APPROVAL";
  const showCancel =
    canCancel && ["DRAFT", "PENDING_APPROVAL", "APPROVED", "FUNDING_PENDING"].includes(status);

  if (!showApprove && !showReject && !showCancel) return null;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        {showApprove ? (
          <Button disabled={pending} onClick={() => call("approve")}>
            {pending ? "Working…" : "Approve"}
          </Button>
        ) : null}
        {showReject ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => {
              const reason = window.prompt("Why is this payout being rejected?");
              if (reason) void call("reject", { reason });
            }}
          >
            Reject
          </Button>
        ) : null}
        {showCancel ? (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => {
              const reason = window.prompt("Why is this payout being cancelled?");
              if (reason) void call("cancel", { reason });
            }}
          >
            Cancel
          </Button>
        ) : null}
      </div>
      {message ? (
        <div className="max-w-md">
          <Callout tone={message.tone}>{message.text}</Callout>
        </div>
      ) : null}
    </div>
  );
}
