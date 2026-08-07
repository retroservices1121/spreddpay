import type { PartnerBrandingDto, PartnerDto } from "@spreddpay/contracts";
import { PageHeader } from "@spreddpay/ui";
import { apiFetch, requireSession } from "@/lib/api";
import { BrandingForm } from "./form";

export const dynamic = "force-dynamic";

export default async function BrandingPage() {
  const session = await requireSession();
  const { branding } = await apiFetch<{ partner: PartnerDto; branding: PartnerBrandingDto | null }>(
    `/partners/${session.partnerId}`,
  );

  return (
    <>
      <PageHeader
        title="Branding"
        description="Your traders see your product. Spredd Pay operates the software layer underneath."
      />
      <div className="max-w-3xl">
        <BrandingForm
          partnerId={session.partnerId}
          branding={branding}
          canEdit={session.user.permissions.includes("branding:manage")}
        />
      </div>
    </>
  );
}
