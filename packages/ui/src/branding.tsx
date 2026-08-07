"use client";

import * as React from "react";
import type { PartnerBrandingDto } from "@spreddpay/contracts";

/**
 * Partner branding is applied by rewriting two CSS variables, not by rebuilding
 * the app. Every brand-coloured surface in the UI reads from --brand-primary /
 * --brand-secondary, so one deployment renders every tenant's product.
 */

/** "#6366F1" -> "99 102 241". Tailwind's <alpha-value> needs the triple form. */
export function hexToRgbTriple(hex: string): string {
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

export const DEFAULT_BRANDING: PartnerBrandingDto = {
  partnerId: "",
  productName: "SpreddPay",
  logoUrl: null,
  iconUrl: null,
  primaryColor: "#111827",
  secondaryColor: "#6366F1",
  cardBackground: null,
  cardLabel: "Payout Card",
  poweredBySpreddPay: true,
};

const BrandingContext = React.createContext<PartnerBrandingDto>(DEFAULT_BRANDING);

export function useBranding(): PartnerBrandingDto {
  return React.useContext(BrandingContext);
}

export function BrandingProvider({
  branding,
  children,
}: {
  branding: PartnerBrandingDto;
  children: React.ReactNode;
}) {
  const style = {
    "--brand-primary": hexToRgbTriple(branding.primaryColor),
    "--brand-secondary": hexToRgbTriple(branding.secondaryColor),
  } as React.CSSProperties;

  return (
    <BrandingContext.Provider value={branding}>
      <div style={style} className="contents">
        {children}
      </div>
    </BrandingContext.Provider>
  );
}

export function PoweredBy({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p className="text-xs text-ink-subtle">
      Powered by <span className="font-medium text-ink-muted">SpreddPay</span>
    </p>
  );
}
