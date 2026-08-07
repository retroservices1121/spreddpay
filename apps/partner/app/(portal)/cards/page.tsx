import Link from "next/link";
import type { CardDto } from "@spreddpay/contracts";
import { Card, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@spreddpay/ui";
import { apiFetch, requireSession } from "@/lib/api";

export const dynamic = "force-dynamic";

type CardRow = CardDto & { traderName: string };

export default async function CardsPage() {
  const session = await requireSession();
  const cards = await apiFetch<{ data: CardRow[] }>(`/partners/${session.partnerId}/cards?limit=50`);

  return (
    <>
      <PageHeader title="Cards" description="Branded virtual cards issued on your program." />

      <Card>
        {cards.data.length === 0 ? (
          <EmptyState
            title="No cards issued"
            description="A card can be issued once a trader reaches card eligibility."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Card</Th>
                <Th>Trader</Th>
                <Th>Label</Th>
                <Th>Expires</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {cards.data.map((card) => (
                <tr key={card.id}>
                  <Td className="tabular">
                    <Link href={`/cards/${card.id}`} className="text-brand-secondary">
                      {card.brand ?? "Card"} •••• {card.last4 ?? "????"}
                    </Link>
                  </Td>
                  <Td>
                    <Link href={`/traders/${card.traderId}`} className="text-ink">
                      {card.traderName}
                    </Link>
                  </Td>
                  <Td className="text-ink-muted">{card.cardLabel}</Td>
                  <Td className="tabular text-ink-muted">
                    {card.expiryMonth && card.expiryYear
                      ? `${String(card.expiryMonth).padStart(2, "0")}/${String(card.expiryYear).slice(-2)}`
                      : "—"}
                  </Td>
                  <Td>
                    <StatusBadge status={card.status} />
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
