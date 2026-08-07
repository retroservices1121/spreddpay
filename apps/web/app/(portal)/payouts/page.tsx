import type { PayoutDto } from "@spreddpay/contracts";
import { Card, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@spreddpay/ui";
import { apiFetch, requireTraderSession } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function PayoutsPage() {
  await requireTraderSession();
  const payouts = await apiFetch<{ data: PayoutDto[] }>("/me/payouts?limit=100");

  return (
    <>
      <PageHeader
        title="Payouts"
        description="Funds your firm has sent to your account."
      />

      <Card>
        {payouts.data.length === 0 ? (
          <EmptyState
            title="No payouts yet"
            description="Approved payouts from your firm appear here."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Reference</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
                <Th>Date</Th>
              </tr>
            </thead>
            <tbody>
              {payouts.data.map((payout) => (
                <tr key={payout.id}>
                  <Td className="tabular">{payout.externalReference}</Td>
                  <Td className="tabular text-right">{payout.amount.display}</Td>
                  <Td>
                    <StatusBadge status={payout.status} />
                  </Td>
                  <Td className="text-ink-muted">
                    {new Date(payout.createdAt).toLocaleDateString()}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
