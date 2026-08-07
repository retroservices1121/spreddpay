"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Callout } from "@spreddpay/ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function CardControls({ cardId, status }: { cardId: string; status: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(action: "freeze" | "unfreeze") {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/v1/me/cards/${cardId}/${action}`, {
        method: "POST",
        credentials: "include",
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

  return (
    <div className="flex flex-col gap-2">
      {status === "ACTIVE" ? (
        <Button variant="secondary" disabled={pending} onClick={() => call("freeze")}>
          {pending ? "Freezing…" : "Freeze card"}
        </Button>
      ) : status === "FROZEN" ? (
        <Button disabled={pending} onClick={() => call("unfreeze")}>
          {pending ? "Unfreezing…" : "Unfreeze card"}
        </Button>
      ) : (
        <p className="text-sm text-ink-subtle">
          This card is {status.toLowerCase()} and cannot be changed here.
        </p>
      )}
      {error ? <Callout tone="critical">{error}</Callout> : null}
    </div>
  );
}
