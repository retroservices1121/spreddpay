import type { TransactionDto } from "@spreddpay/contracts";
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  StatusBadge,
  Table,
  Td,
  Th,
} from "@spreddpay/ui";
import { API_URL, apiFetch, requireSession } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const session = await requireSession();
  const transactions = await apiFetch<{ data: TransactionDto[] }>(
    `/partners/${session.partnerId}/transactions?limit=100`,
  );

  const canExport = session.user.permissions.includes("transaction:export");

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Card authorizations, settlements, refunds and reversals."
        actions={
          canExport ? (
            <a
              href={`${API_URL}/api/v1/partners/${session.partnerId}/transactions.csv`}
              target="_blank"
              rel="noreferrer"
            >
              <Button variant="secondary">Export CSV</Button>
            </a>
          ) : null
        }
      />

      <Card>
        {transactions.data.length === 0 ? (
          <EmptyState
            title="No transactions yet"
            description="Card activity appears here as it is reported."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Merchant</Th>
                <Th>Kind</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
                <Th>Occurred</Th>
              </tr>
            </thead>
            <tbody>
              {transactions.data.map((transaction) => (
                <tr key={transaction.id}>
                  <Td>
                    <div className="font-medium">{transaction.merchantName ?? "Unknown"}</div>
                    <div className="text-xs text-ink-subtle">
                      {transaction.merchantCountry ?? ""} {transaction.merchantCategory ?? ""}
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
