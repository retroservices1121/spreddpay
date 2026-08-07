import Link from "next/link";
import type { PartnerDto } from "@spreddpay/contracts";
import {
  Card,
  EmptyState,
  PageHeader,
  Stat,
  StatusBadge,
  Table,
  Td,
  Th,
} from "@spreddpay/ui";
import { apiFetch, requireOperator } from "@/lib/api";

export const dynamic = "force-dynamic";

type PartnerRow = PartnerDto & {
  productName: string;
  counts: { traders: number; cards: number; payouts: number };
};

interface Overview {
  partners: number;
  activePartners: number;
  traders: number;
  activeCards: number;
  payoutsAwaitingAttention: number;
  openManualOperations: number;
  unprocessedWebhookEvents: number;
}

export default async function PartnersPage() {
  await requireOperator();

  const [overview, partners] = await Promise.all([
    apiFetch<Overview>("/admin/overview"),
    apiFetch<{ data: PartnerRow[] }>("/admin/partners"),
  ]);

  return (
    <>
      <PageHeader title="Partners" description="Every funded trading firm on the platform." />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Partners"
          value={String(overview.partners)}
          sublabel={`${overview.activePartners} active`}
        />
        <Stat label="Traders" value={String(overview.traders)} />
        <Stat label="Active cards" value={String(overview.activeCards)} />
        <Stat
          label="Needs attention"
          value={String(overview.payoutsAwaitingAttention + overview.openManualOperations)}
          tone={
            overview.payoutsAwaitingAttention + overview.openManualOperations > 0
              ? "critical"
              : "positive"
          }
          sublabel={`${overview.unprocessedWebhookEvents} unprocessed provider events`}
        />
      </div>

      <Card>
        {partners.data.length === 0 ? (
          <EmptyState title="No partners yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Partner</Th>
                <Th>Product</Th>
                <Th>Status</Th>
                <Th className="text-right">Traders</Th>
                <Th className="text-right">Cards</Th>
                <Th className="text-right">Payouts</Th>
              </tr>
            </thead>
            <tbody>
              {partners.data.map((partner) => (
                <tr key={partner.id}>
                  <Td>
                    <Link
                      href={`/partners/${partner.id}`}
                      className="font-medium text-brand-secondary"
                    >
                      {partner.displayName}
                    </Link>
                    <div className="text-xs text-ink-subtle">{partner.slug}</div>
                  </Td>
                  <Td>{partner.productName}</Td>
                  <Td>
                    <StatusBadge status={partner.status} />
                  </Td>
                  <Td className="tabular text-right">{partner.counts.traders}</Td>
                  <Td className="tabular text-right">{partner.counts.cards}</Td>
                  <Td className="tabular text-right">{partner.counts.payouts}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
