import type { TransactionDto } from "@spreddpay/contracts";
import { Card, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@spreddpay/ui";
import { apiFetch, requireTraderSession } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  await requireTraderSession();
  const transactions = await apiFetch<{ data: TransactionDto[] }>("/me/transactions?limit=100");

  return (
    <>
      <PageHeader title="Activity" description="Everything your card has done." />

      <Card>
        {transactions.data.length === 0 ? (
          <EmptyState
            title="No activity yet"
            description="Purchases, refunds and reversals appear here."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Merchant</Th>
                <Th>Type</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
                <Th>Date</Th>
              </tr>
            </thead>
            <tbody>
              {transactions.data.map((transaction) => (
                <tr key={transaction.id}>
                  <Td>
                    <div className="font-medium">{transaction.merchantName ?? "Purchase"}</div>
                    <div className="text-xs text-ink-subtle">
                      {transaction.merchantCountry ?? ""}
                    </div>
                  </Td>
                  <Td className="text-ink-muted">{transaction.kind.toLowerCase()}</Td>
                  <Td className="tabular text-right">{transaction.amount.display}</Td>
                  <Td>
                    <StatusBadge status={transaction.status} />
                  </Td>
                  <Td className="text-ink-muted">
                    {new Date(transaction.occurredAt).toLocaleString()}
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
