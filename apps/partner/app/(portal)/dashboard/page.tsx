import Link from "next/link";
import type { PartnerDashboardDto, PayoutDto } from "@spreddpay/contracts";
import {
  Badge,
  Button,
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
} from "@spreddpay/ui";
import { apiFetch, requireSession } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireSession();
  const partnerId = session.partnerId;

  const [metrics, payouts] = await Promise.all([
    apiFetch<PartnerDashboardDto>(`/partners/${partnerId}/dashboard`),
    apiFetch<{ data: PayoutDto[] }>(`/partners/${partnerId}/payouts?limit=8`),
  ]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${session.branding?.productName ?? "Your product"} at a glance.`}
        actions={
          <Link href="/payouts/new">
            <Button>New payout</Button>
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active traders" value={String(metrics.activeTraders)} />
        <Stat
          label="Pending KYC"
          value={String(metrics.pendingKyc)}
          tone={metrics.pendingKyc > 0 ? "caution" : "neutral"}
        />
        <Stat label="Active cards" value={String(metrics.activeCards)} />
        <Stat
          label="Needs attention"
          value={String(metrics.operationsRequiringAttention)}
          tone={metrics.operationsRequiringAttention > 0 ? "critical" : "positive"}
        />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Payout volume (month)"
          value={metrics.monthlyPayoutVolume.display}
          sublabel="Completed payouts this calendar month"
        />
        <Stat
          label="Card spend (month)"
          value={metrics.monthlyCardSpend.display}
          sublabel="Authorised and cleared"
        />
        <Stat
          label="Avg spend / active card"
          value={metrics.averageSpendPerActiveCard.display}
        />
        {/*
          Activation rate counts traders holding an active card, and card
          issuance is deferred until the provider's card programme opens. It
          would read near zero for reasons that have nothing to do with the
          partner's performance, so it is hidden rather than shown misleadingly.
          Restore this when issuance is live.
        */}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Payouts pending" value={String(metrics.payouts.pending)} tone="caution" />
        <Stat label="Payouts completed" value={String(metrics.payouts.completed)} tone="positive" />
        <Stat
          label="Payouts failed"
          value={String(metrics.payouts.failed)}
          tone={metrics.payouts.failed > 0 ? "critical" : "neutral"}
        />
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Recent payouts</CardTitle>
          <Link href="/payouts" className="text-xs font-medium text-brand-secondary">
            View all
          </Link>
        </CardHeader>
        {payouts.data.length === 0 ? (
          <EmptyState
            title="No payouts yet"
            description="Create a payout to make funds available on a trader's card."
            action={
              <Link href="/payouts/new">
                <Button size="sm">New payout</Button>
              </Link>
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Reference</Th>
                <Th>Trader</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {payouts.data.map((payout) => (
                <tr key={payout.id}>
                  <Td>
                    <Link
                      href={`/payouts/${payout.id}`}
                      className="font-medium text-brand-secondary"
                    >
                      {payout.externalReference}
                    </Link>
                  </Td>
                  <Td>{payout.traderName}</Td>
                  <Td className="tabular text-right">{payout.amount.display}</Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={payout.status} />
                      {payout.requiresDualApproval && payout.status === "PENDING_APPROVAL" ? (
                        <Badge tone="brand">dual approval</Badge>
                      ) : null}
                    </div>
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
