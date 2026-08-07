import { Callout, Card, CardBody, CardHeader, CardTitle, PageHeader } from "@spreddpay/ui";
import { requireOperator } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Support case tooling is Milestone 7. The SupportCase model exists so cases
 * can be recorded against a partner and trader with a provider reference.
 */
export default async function SupportPage() {
  await requireOperator();

  return (
    <>
      <PageHeader title="Support" description="Cases raised by partners and traders." />

      <div className="max-w-2xl">
        <Callout tone="neutral" title="Arrives in Milestone 7">
          Support tooling ships with beta hardening. Until then, use the audit trail and provider
          events to investigate, and the manual operations queue to track anything that needs
          provider-side work.
        </Callout>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Where to look now</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="flex flex-col gap-1.5 text-sm text-ink-muted">
              <li>
                <span className="font-medium text-ink">Audit</span> — who changed what, when, from
                which address.
              </li>
              <li>
                <span className="font-medium text-ink">Provider events</span> — every inbound
                webhook, including ones that failed signature verification.
              </li>
              <li>
                <span className="font-medium text-ink">Manual operations</span> — anything the
                platform could not complete on its own.
              </li>
              <li>
                <span className="font-medium text-ink">Reconciliation</span> — ledger integrity per
                partner.
              </li>
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
