import { BrandingProvider, DEFAULT_BRANDING } from "@spreddpay/ui";
import { requireSession } from "@/lib/api";
import { PortalShell } from "./shell";

/**
 * Every authenticated partner page renders inside this layout, so the session
 * check happens once and the partner's branding is applied to the whole portal.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  const branding = session.branding ?? { ...DEFAULT_BRANDING, partnerId: session.partnerId };

  return (
    <BrandingProvider branding={branding}>
      <PortalShell
        productName={branding.productName}
        logoUrl={branding.logoUrl}
        userName={`${session.user.firstName} ${session.user.lastName}`}
        userSublabel={session.user.partnerRoles.join(", ").replace(/_/g, " ").toLowerCase()}
      >
        {children}
      </PortalShell>
    </BrandingProvider>
  );
}
