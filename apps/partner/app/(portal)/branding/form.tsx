"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PartnerBrandingDto } from "@spreddpay/contracts";
import {
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Field,
  Input,
  VirtualCard,
} from "@spreddpay/ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function BrandingForm({
  partnerId,
  branding,
  canEdit,
}: {
  partnerId: string;
  branding: PartnerBrandingDto | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live preview: the card below re-renders as the colours change, so the
  // operator sees the trader's view before saving.
  const [productName, setProductName] = useState(branding?.productName ?? "Spredd Pay");
  const [cardLabel, setCardLabel] = useState(branding?.cardLabel ?? "Payout Card");
  const [primaryColor, setPrimaryColor] = useState(branding?.primaryColor ?? "#111827");
  const [secondaryColor, setSecondaryColor] = useState(branding?.secondaryColor ?? "#6366F1");
  const [logoUrl, setLogoUrl] = useState(branding?.logoUrl ?? "");
  const [poweredBy, setPoweredBy] = useState(branding?.poweredBySpreddPay ?? true);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);

    try {
      const response = await fetch(`${API_URL}/api/v1/partners/${partnerId}/branding`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productName,
          cardLabel,
          primaryColor,
          secondaryColor,
          logoUrl: logoUrl || null,
          poweredBySpreddPay: poweredBy,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(payload?.error?.message ?? "Could not save branding.");
        return;
      }

      setSaved(true);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr,minmax(0,22rem)]">
      <Card>
        <CardHeader>
          <CardTitle>Product branding</CardTitle>
        </CardHeader>
        <CardBody>
          <form onSubmit={submit}>
            {error ? (
              <div className="mb-4">
                <Callout tone="critical">{error}</Callout>
              </div>
            ) : null}
            {saved ? (
              <div className="mb-4">
                <Callout tone="positive">Branding saved.</Callout>
              </div>
            ) : null}

            <Field label="Product name" hint="What your traders call this product.">
              <Input
                value={productName}
                onChange={(event) => setProductName(event.target.value)}
                required
                maxLength={80}
                disabled={!canEdit}
              />
            </Field>

            <Field label="Card label">
              <Input
                value={cardLabel}
                onChange={(event) => setCardLabel(event.target.value)}
                required
                maxLength={40}
                disabled={!canEdit}
              />
            </Field>

            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label="Primary colour">
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(event) => setPrimaryColor(event.target.value)}
                    disabled={!canEdit}
                    className="h-10 w-12 rounded-lg border border-edge bg-surface"
                    aria-label="Primary colour"
                  />
                  <Input
                    value={primaryColor}
                    onChange={(event) => setPrimaryColor(event.target.value)}
                    pattern="^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$"
                    disabled={!canEdit}
                    className="tabular"
                  />
                </div>
              </Field>

              <Field label="Secondary colour">
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={secondaryColor}
                    onChange={(event) => setSecondaryColor(event.target.value)}
                    disabled={!canEdit}
                    className="h-10 w-12 rounded-lg border border-edge bg-surface"
                    aria-label="Secondary colour"
                  />
                  <Input
                    value={secondaryColor}
                    onChange={(event) => setSecondaryColor(event.target.value)}
                    pattern="^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$"
                    disabled={!canEdit}
                    className="tabular"
                  />
                </div>
              </Field>
            </div>

            <Field label="Logo URL" hint="Optional. Square image works best.">
              <Input
                type="url"
                value={logoUrl}
                onChange={(event) => setLogoUrl(event.target.value)}
                disabled={!canEdit}
                placeholder="https://…"
              />
            </Field>

            <label className="mb-4 flex items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                checked={poweredBy}
                onChange={(event) => setPoweredBy(event.target.checked)}
                disabled={!canEdit}
              />
              Show &ldquo;Powered by Spredd Pay&rdquo; in the trader app
            </label>

            {canEdit ? (
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save branding"}
              </Button>
            ) : (
              <Callout tone="neutral">
                You have read-only access to branding. Ask a partner admin to make changes.
              </Callout>
            )}
          </form>
        </CardBody>
      </Card>

      <div>
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-subtle">
          Trader preview
        </p>
        <div
          style={
            {
              "--brand-primary": hexToTriple(primaryColor),
              "--brand-secondary": hexToTriple(secondaryColor),
            } as React.CSSProperties
          }
        >
          <VirtualCard
            card={{
              last4: "4821",
              brand: "VISA",
              expiryMonth: 11,
              expiryYear: 2029,
              status: "ACTIVE",
            }}
            productName={productName}
            cardLabel={cardLabel}
            holderName="Alex Morgan"
          />
        </div>
      </div>
    </div>
  );
}

function hexToTriple(hex: string): string {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value;
  const int = Number.parseInt(full, 16);
  if (Number.isNaN(int) || full.length !== 6) return "17 24 39";
  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`;
}
