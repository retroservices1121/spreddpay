import { Callout, Card, CardBody, CardHeader, CardTitle, PageHeader } from "@spreddpay/ui";
import { requireSession } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * API key management is Milestone 6 work. The screen exists so the navigation
 * is complete and the contract is visible, but it does not pretend to issue
 * keys it cannot yet issue.
 */
export default async function ApiKeysPage() {
  await requireSession();

  return (
    <>
      <PageHeader
        title="API keys"
        description="Server-to-server credentials for the Spredd Pay Partner API."
      />

      <div className="max-w-2xl">
        <Callout tone="neutral" title="Not yet available">
          Key issuance lands with the Partner API in Milestone 6. The data model is in place —
          keys are stored as a public prefix plus a hash, so the secret is shown exactly once and
          never recoverable afterwards.
        </Callout>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>What the Partner API will expose</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="flex flex-col gap-1.5 text-sm text-ink-muted">
              <li>
                <code className="tabular text-xs">POST /api/v1/partners/:id/traders</code> — onboard
                a trader
              </li>
              <li>
                <code className="tabular text-xs">POST /api/v1/partners/:id/payouts</code> — create
                a payout (Idempotency-Key required)
              </li>
              <li>
                <code className="tabular text-xs">GET /api/v1/partners/:id/transactions</code> —
                card activity
              </li>
              <li>
                <code className="tabular text-xs">GET /api/v1/partners/:id/balances</code> — trader
                balances
              </li>
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
