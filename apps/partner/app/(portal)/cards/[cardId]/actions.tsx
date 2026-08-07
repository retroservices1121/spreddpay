"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@spreddpay/ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function CardActions({
  partnerId,
  cardId,
  status,
  canManage,
}: {
  partnerId: string;
  cardId: string;
  status: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(action: "freeze" | "unfreeze") {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_URL}/api/v1/partners/${partnerId}/cards/${cardId}/${action}`,
        { method: "POST", credentials: "include" },
      );
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

  if (!canManage) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      {status === "ACTIVE" ? (
        <Button variant="secondary" disabled={pending} onClick={() => call("freeze")}>
          {pending ? "Working…" : "Freeze card"}
        </Button>
      ) : status === "FROZEN" ? (
        <Button disabled={pending} onClick={() => call("unfreeze")}>
          {pending ? "Working…" : "Unfreeze card"}
        </Button>
      ) : null}
      {error ? <p className="max-w-xs text-right text-xs text-critical">{error}</p> : null}
    </div>
  );
}
