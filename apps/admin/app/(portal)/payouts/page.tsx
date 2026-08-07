import type { PayoutDto } from "@spreddpay/contracts";
import { Badge, Card, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@spreddpay/ui";
import { apiFetch, requireOperator } from "@/lib/api";

export const dynamic = "force-dynamic";

type AdminPayout = PayoutDto & { partnerName: string };

export default async function AdminPayoutsPage() {
  await requireOperator();
  const payouts = await apiFetch<{ data: AdminPayout[] }>("/admin/payouts?limit=100");

  return (
    <>
      <PageHeader title="Payouts" description="Every payout across every partner." />

      <Card>
        {payouts.data.length === 0 ? (
          <EmptyState title="No payouts yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Reference</Th>
                <Th>Partner</Th>
                <Th>Trader</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {payouts.data.map((payout) => (
                <tr key={payout.id}>
                  <Td className="tabular">{payout.externalReference}</Td>
                  <Td>{payout.partnerName}</Td>
                  <Td>{payout.traderName}</Td>
                  <Td className="tabular text-right">{payout.amount.display}</Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={payout.status} />
                      {payout.operationMode !== "AUTOMATED" ? (
                        <Badge tone="caution">
                          {payout.operationMode.replace(/_/g, " ").toLowerCase()}
                        </Badge>
                      ) : null}
                    </div>
                  </Td>
                  <Td className="text-ink-muted">
                    {new Date(payout.createdAt).toLocaleString()}
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
