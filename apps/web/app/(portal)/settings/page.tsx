import type { TraderDto } from "@spreddpay/contracts";
import { Badge, Card, CardBody, CardHeader, CardTitle, PageHeader } from "@spreddpay/ui";
import { apiFetch, requireTraderSession } from "@/lib/api";

export const dynamic = "force-dynamic";

interface MeResponse {
  trader: TraderDto;
  partner: { id: string; displayName: string; supportEmail: string };
}

export default async function SettingsPage() {
  await requireTraderSession();
  const me = await apiFetch<MeResponse>("/me");

  return (
    <>
      <PageHeader title="Settings" description="Your account details." />

      <div className="grid max-w-2xl gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-ink-subtle">Name</dt>
              <dd>
                {me.trader.firstName} {me.trader.lastName}
              </dd>
              <dt className="text-ink-subtle">Email</dt>
              <dd>{me.trader.email}</dd>
              <dt className="text-ink-subtle">Country</dt>
              <dd>{me.trader.countryCode}</dd>
              <dt className="text-ink-subtle">Account status</dt>
              <dd>
                <Badge tone={me.trader.status === "VIRTUAL_CARD_ACTIVE" ? "positive" : "caution"}>
                  {me.trader.status.replace(/_/g, " ").toLowerCase()}
                </Badge>
              </dd>
              <dt className="text-ink-subtle">Trader ID</dt>
              <dd className="tabular">{me.trader.externalTraderId}</dd>
            </dl>
            <p className="mt-4 text-xs text-ink-subtle">
              To change your name or country, contact your firm — these details are verified with
              our card infrastructure provider.
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
