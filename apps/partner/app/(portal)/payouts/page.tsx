import Link from "next/link";
import type { PayoutDto } from "@spreddpay/contracts";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  StatusBadge,
  Table,
  Td,
  Th,
} from "@spreddpay/ui";
import { apiFetch, requireSession } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function PayoutsPage() {
  const session = await requireSession();
  const payouts = await apiFetch<{ data: PayoutDto[] }>(
    `/partners/${session.partnerId}/payouts?limit=50`,
  );

  const canCreate = session.user.permissions.includes("payout:create");

  return (
    <>
      <PageHeader
        title="Payouts"
        description="Approved instructions to make funds available to your traders."
        actions={
          canCreate ? (
            <Link href="/payouts/new">
              <Button>New payout</Button>
            </Link>
          ) : null
        }
      />

      <Card>
        {payouts.data.length === 0 ? (
          <EmptyState
            title="No payouts yet"
            description="Create a payout to make funds available on a trader's card."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Reference</Th>
                <Th>Trader</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
                <Th>Created by</Th>
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
                      {payout.requiresDualApproval ? <Badge tone="brand">dual</Badge> : null}
                    </div>
                  </Td>
                  <Td className="text-ink-muted">{payout.initiatedByName ?? "—"}</Td>
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
