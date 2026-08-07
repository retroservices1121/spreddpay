import { BrandingProvider, DEFAULT_BRANDING } from "@spreddpay/ui";
import { requireTraderSession } from "@/lib/api";
import { TraderShell } from "./shell";

/**
 * The trader sees the partner's product, not Spredd Pay. Branding is resolved
 * from the session and applied here, so every screen below inherits it.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requireTraderSession();
  const branding = session.branding ?? DEFAULT_BRANDING;

  return (
    <BrandingProvider branding={branding}>
      <TraderShell
        productName={branding.productName}
        logoUrl={branding.logoUrl}
        poweredBySpreddPay={branding.poweredBySpreddPay}
        userName={`${session.user.firstName} ${session.user.lastName}`}
        userEmail={session.user.email}
      >
        {children}
      </TraderShell>
    </BrandingProvider>
  );
}
