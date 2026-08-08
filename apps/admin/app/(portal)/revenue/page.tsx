import { Callout, Card, CardBody, CardHeader, CardTitle, PageHeader } from "@spreddpay/ui";
import { requireOperator } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Platform-wide revenue reporting is Milestone 6. The data model — RevenueRule,
 * RevenueEvent, PartnerSettlement — is in place, and per-partner revenue is
 * already visible in the partner portal.
 */
export default async function RevenuePage() {
  await requireOperator();

  return (
    <>
      <PageHeader title="Revenue" description="Platform-wide revenue and partner settlements." />

      <div className="max-w-2xl">
        <Callout tone="neutral" title="Arrives in Milestone 6">
          Statement import, matching, share calculation and settlement generation land with
          reporting and revenue. Per-partner revenue events are already visible in each partner
          portal.
        </Callout>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>The settlement workflow</CardTitle>
          </CardHeader>
          <CardBody>
            <ol className="flex flex-col gap-1.5 text-sm text-ink-muted">
              <li>1. Provider statement imported</li>
              <li>2. Transactions matched</li>
              <li>3. Provider deductions applied</li>
              <li>4. Spredd Pay share calculated</li>
              <li>5. Partner share calculated</li>
              <li>6. Settlement statement generated</li>
              <li>7. Finance review</li>
              <li>8. Settlement marked paid</li>
            </ol>
            <p className="mt-4 text-xs text-ink-subtle">
              Provider commercial terms are configuration, not hard-coded. Estimated or
              unrealized yield is never recognised as settled revenue.
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
