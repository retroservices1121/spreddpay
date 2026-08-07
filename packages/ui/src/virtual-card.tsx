"use client";

import * as React from "react";
import type { CardDto } from "@spreddpay/contracts";
import { cn } from "./cn";
import { Badge } from "./primitives";

/**
 * The branded virtual card.
 *
 * Renders masked details only. Full PAN and CVV are never fetched into this
 * component, never held in state, and never written to browser storage — a
 * reveal, when Rain confirms a supported secure method, happens in a
 * provider-hosted iframe rather than here.
 */
export function VirtualCard({
  card,
  productName,
  cardLabel,
  cardBackground,
  holderName,
  className,
}: {
  card: Pick<CardDto, "last4" | "brand" | "expiryMonth" | "expiryYear" | "status">;
  productName: string;
  cardLabel: string;
  cardBackground?: string | null;
  holderName: string;
  className?: string;
}) {
  const frozen = card.status === "FROZEN";
  const inactive = card.status !== "ACTIVE" && card.status !== "FROZEN";

  const expiry =
    card.expiryMonth && card.expiryYear
      ? `${String(card.expiryMonth).padStart(2, "0")}/${String(card.expiryYear).slice(-2)}`
      : "••/••";

  return (
    <div
      className={cn(
        "relative aspect-[1.586/1] w-full max-w-sm overflow-hidden rounded-2xl p-5 text-white shadow-card transition",
        (frozen || inactive) && "grayscale",
        className,
      )}
      style={{
        background:
          cardBackground ??
          "linear-gradient(135deg, rgb(var(--brand-primary)) 0%, rgb(var(--brand-secondary)) 100%)",
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-widest opacity-70">{productName}</p>
          <p className="mt-0.5 text-sm font-medium">{cardLabel}</p>
        </div>
        {frozen ? (
          <Badge tone="caution" className="border-white/30 bg-white/15 text-white">
            Frozen
          </Badge>
        ) : inactive ? (
          <Badge tone="neutral" className="border-white/30 bg-white/15 text-white">
            {card.status.toLowerCase()}
          </Badge>
        ) : null}
      </div>

      <div className="absolute inset-x-5 bottom-5">
        <p className="tabular text-lg tracking-[0.2em]">•••• •••• •••• {card.last4 ?? "••••"}</p>
        <div className="mt-3 flex items-end justify-between text-xs">
          <div>
            <p className="opacity-60">Cardholder</p>
            <p className="font-medium uppercase tracking-wide">{holderName}</p>
          </div>
          <div className="text-right">
            <p className="opacity-60">Expires</p>
            <p className="tabular font-medium">{expiry}</p>
          </div>
          <p className="text-sm font-semibold tracking-wide">{card.brand ?? ""}</p>
        </div>
      </div>
    </div>
  );
}
