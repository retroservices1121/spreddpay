import type { TraderDto } from "@spreddpay/contracts";
import { Callout, Card, CardBody, CardHeader, CardTitle, PageHeader } from "@spreddpay/ui";
import { apiFetch, requireTraderSession } from "@/lib/api";

export const dynamic = "force-dynamic";

interface MeResponse {
  trader: TraderDto;
  partner: { id: string; displayName: string; supportEmail: string };
}

export default async function SupportPage() {
  const session = await requireTraderSession();
  const me = await apiFetch<MeResponse>("/me");
  const productName = session.branding?.productName ?? "your account";

  return (
    <>
      <PageHeader title="Support" description={`Getting help with ${productName}.`} />

      <div className="grid max-w-2xl gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Contact your firm</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-ink-muted">
              {me.partner.displayName} manages your account, payouts and eligibility. Reach them at{" "}
              <a href={`mailto:${me.partner.supportEmail}`} className="text-brand-secondary">
                {me.partner.supportEmail}
              </a>
              .
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Common questions</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="flex flex-col gap-4 text-sm">
              <div>
                <dt className="font-medium text-ink">A payout has not arrived yet</dt>
                <dd className="mt-0.5 text-ink-muted">
                  Payouts go through approval before they are released. Check the Payouts screen for
                  the current status.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-ink">My card was declined</dt>
                <dd className="mt-0.5 text-ink-muted">
                  Check that the card is not frozen and that your available balance covers the
                  purchase. Pending authorizations reduce what is available.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-ink">I need to freeze my card</dt>
                <dd className="mt-0.5 text-ink-muted">
                  Go to the Card screen and choose Freeze card. You can unfreeze it yourself at any
                  time.
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Callout tone="neutral">
          {productName} is a technology platform. Card issuing and money movement are provided by
          regulated infrastructure partners, and are subject to their eligibility and terms.
        </Callout>
      </div>
    </>
  );
}
