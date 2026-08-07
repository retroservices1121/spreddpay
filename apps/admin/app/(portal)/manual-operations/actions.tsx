"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@spreddpay/ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function OperationActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function call(action: "claim" | "complete", body?: unknown) {
    setPending(true);
    try {
      await fetch(`${API_URL}/api/v1/admin/manual-operations/${id}/${action}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (status === "OPEN") {
    return (
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => call("claim")}>
        Claim
      </Button>
    );
  }

  if (status === "IN_PROGRESS" || status === "BLOCKED") {
    return (
      <Button
        size="sm"
        disabled={pending}
        onClick={() => {
          // Evidence is required so a completed operation is auditable.
          const providerReference = window.prompt(
            "Provider reference for this operation (leave blank if none):",
          );
          void call("complete", { providerReference: providerReference || undefined });
        }}
      >
        Complete
      </Button>
    );
  }

  return null;
}
