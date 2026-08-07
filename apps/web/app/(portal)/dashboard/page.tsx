import Link from "next/link";
import type { BalanceDto, CardDto, PayoutDto, TransactionDto } from "@spreddpay/contracts";
import {
  Button,
  Callout,
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  Stat,
  StatusBadge,
  Table,
  Td,
  Th,
  VirtualCard,
} from "@spreddpay/ui";
import { apiFetch, requireTraderSession } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireTraderSession();

  const [balances, cards, payouts, transactions] = await Promise.all([
    apiFetch<{ data: BalanceDto[] }>("/me/balances"),
    apiFetch<{ data: CardDto[] }>("/me/cards"),
    apiFetch<{ data: PayoutDto[] }>("/me/payouts?limit=5"),
    apiFetch<{ data: TransactionDto[] }>("/me/transactions?limit=5"),
  ]);

  const balance = balances.data[0];
  const card = cards.data[0];
  const latestPayout = payouts.data[0];
  const productName = session.branding?.productName ?? "your account";

  return (
    <>
      <PageHeader
        title={`Hello, ${session.user.firstName}`}
        description={`Your ${productName} balance and card.`}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat
          label="Available to spend"
          value={balance?.available.display ?? "0.00 USDC"}
          tone="positive"
        />
        <Stat label="Pending" value={balance?.pending.display ?? "0.00 USDC"} />
        <Stat
          label="Latest payout"
          value={latestPayout?.amount.display ?? "—"}
          sublabel={
            latestPayout ? latestPayout.status.replace(/_/g, " ").toLowerCase() : "No payouts yet"
          }
        />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,24rem),1fr]">
        <div>
          {card ? (
            <>
              <VirtualCard
                card={card}
                productName={productName}
                cardLabel={card.cardLabel}
                cardBackground={session.branding?.cardBackground}
                holderName={`${session.user.firstName} ${session.user.lastName}`}
              />
              <div className="mt-3">
                <Link href="/card">
                  <Button variant="secondary" size="sm">
                    Manage card
                  </Button>
                </Link>
              </div>
            </>
          ) : (
            <Card>
              <EmptyState
                title="Card coming soon"
                description="Cards are not being issued yet. Your payout balance is available now."
              />
            </Card>
          )}
        </div>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Recent card activity</CardTitle>
            <Link href="/activity" className="text-xs font-medium text-brand-secondary">
              View all
            </Link>
          </CardHeader>
          {transactions.data.length === 0 ? (
            <EmptyState title="No activity yet" description="Card purchases appear here." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Merchant</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {transactions.data.map((transaction) => (
                  <tr key={transaction.id}>
                    <Td>
                      <div>{transaction.merchantName ?? "Purchase"}</div>
                      <div className="text-xs text-ink-subtle">
                        {new Date(transaction.occurredAt).toLocaleDateString()}
                      </div>
                    </Td>
                    <Td className="tabular text-right">{transaction.amount.display}</Td>
                    <Td>
                      <StatusBadge status={transaction.status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      {/*
        Phase 2. The Earn surface is deliberately not shown as a balance or a
        rate — no yield number exists until Blend is integrated, and inventing
        one would be a promise the product cannot keep.
      */}
      <Callout tone="neutral" title="Earn is coming">
        A separate Earn balance for funds you do not want immediately spendable is planned for a
        later release. Your spend balance and any future earn balance always stay separate.
      </Callout>
    </>
  );
}
