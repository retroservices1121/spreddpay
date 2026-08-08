import Link from "next/link";
import type { TraderDto } from "@spreddpay/contracts";
import {
  Card,
  EmptyState,
  PageHeader,
  StatusBadge,
  Table,
  Td,
  Th,
} from "@spreddpay/ui";
import { apiFetch, requireSession } from "@/lib/api";
import { InviteTraderForm } from "./invite-form";

export const dynamic = "force-dynamic";

export default async function TradersPage() {
  const session = await requireSession();
  const traders = await apiFetch<{ data: TraderDto[] }>(
    `/partners/${session.partnerId}/traders?limit=50`,
  );

  const canInvite = session.user.permissions.includes("trader:invite");

  return (
    <>
      <PageHeader
        title="Traders"
        description="Onboarding status for every trader on your program."
      />

      {canInvite ? (
        <div className="mb-6">
          <InviteTraderForm partnerId={session.partnerId} />
        </div>
      ) : null}

      <Card>
        {traders.data.length === 0 ? (
          <EmptyState
            title="No traders yet"
            description="Invite a trader to start onboarding."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Trader</Th>
                <Th>External ID</Th>
                <Th>Country</Th>
                <Th>Status</Th>
                <Th>Invited</Th>
              </tr>
            </thead>
            <tbody>
              {traders.data.map((trader) => (
                <tr key={trader.id}>
                  <Td>
                    <Link
                      href={`/traders/${trader.id}`}
                      className="font-medium text-brand-secondary"
                    >
                      {trader.firstName} {trader.lastName}
                    </Link>
                    <div className="text-xs text-ink-subtle">{trader.email}</div>
                  </Td>
                  <Td className="tabular">{trader.externalTraderId}</Td>
                  <Td>{trader.countryCode}</Td>
                  <Td>
                    <StatusBadge status={trader.status} />
                  </Td>
                  <Td className="text-ink-muted">
                    {new Date(trader.createdAt).toLocaleDateString()}
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
