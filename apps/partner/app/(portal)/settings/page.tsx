import type { PartnerBrandingDto, PartnerDto } from "@spreddpay/contracts";
import {
  Badge,
  Callout,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  PageHeader,
} from "@spreddpay/ui";
import { apiFetch, requireSession } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireSession();
  const { partner } = await apiFetch<{ partner: PartnerDto; branding: PartnerBrandingDto | null }>(
    `/partners/${session.partnerId}`,
  );

  return (
    <>
      <PageHeader title="Settings" description="Your program configuration." />

      <div className="grid max-w-3xl gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Organisation</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-ink-subtle">Legal name</dt>
              <dd>{partner.legalName}</dd>
              <dt className="text-ink-subtle">Display name</dt>
              <dd>{partner.displayName}</dd>
              <dt className="text-ink-subtle">Slug</dt>
              <dd className="tabular">{partner.slug}</dd>
              <dt className="text-ink-subtle">Status</dt>
              <dd>
                <Badge tone={partner.status === "ACTIVE" ? "positive" : "caution"}>
                  {partner.status.toLowerCase()}
                </Badge>
              </dd>
              <dt className="text-ink-subtle">Support email</dt>
              <dd>{partner.supportEmail}</dd>
              <dt className="text-ink-subtle">Default asset</dt>
              <dd className="tabular">
                {partner.defaultAsset} on {partner.defaultNetwork}
              </dd>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Program limits</CardTitle>
          </CardHeader>
          <CardBody>
            <Callout tone="neutral">
              Dual-approval thresholds, daily limits and supported countries are set by Spredd Pay
              operations as part of your program. Contact{" "}
              <span className="font-medium">{partner.supportEmail}</span> to request a change.
            </Callout>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your access</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="mb-2 text-sm text-ink-muted">
              Signed in as {session.user.firstName} {session.user.lastName} (
              {session.user.email}).
            </p>
            <div className="flex flex-wrap gap-1.5">
              {session.user.partnerRoles.map((role) => (
                <Badge key={role} tone="brand">
                  {role.replace(/_/g, " ").toLowerCase()}
                </Badge>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
