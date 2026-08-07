import type { CardDto } from "@spreddpay/contracts";
import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  StatusBadge,
  VirtualCard,
} from "@spreddpay/ui";
import { apiFetch, requireTraderSession } from "@/lib/api";
import { CardControls } from "./controls";

export const dynamic = "force-dynamic";

export default async function CardPage() {
  const session = await requireTraderSession();
  const cards = await apiFetch<{ data: CardDto[] }>("/me/cards");
  const card = cards.data[0];
  const productName = session.branding?.productName ?? "your account";

  if (!card) {
    return (
      <>
        <PageHeader title="Card" />
        <Card>
          <EmptyState
            title="No card yet"
            description="Your virtual card is issued once your account is ready."
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Card" description={card.cardLabel} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem),1fr]">
        <div>
          <VirtualCard
            card={card}
            productName={productName}
            cardLabel={card.cardLabel}
            cardBackground={session.branding?.cardBackground}
            holderName={`${session.user.firstName} ${session.user.lastName}`}
          />
          <div className="mt-4">
            <CardControls cardId={card.id} status={card.status} />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-2 text-sm">
                <dt className="text-ink-subtle">Status</dt>
                <dd>
                  <StatusBadge status={card.status} />
                </dd>
                <dt className="text-ink-subtle">Card number</dt>
                <dd className="tabular">•••• •••• •••• {card.last4 ?? "????"}</dd>
                <dt className="text-ink-subtle">Expires</dt>
                <dd className="tabular">
                  {card.expiryMonth && card.expiryYear
                    ? `${String(card.expiryMonth).padStart(2, "0")}/${String(card.expiryYear).slice(-2)}`
                    : "—"}
                </dd>
                <dt className="text-ink-subtle">Type</dt>
                <dd>{card.type.toLowerCase()}</dd>
              </dl>
            </CardBody>
          </Card>

          <Callout tone="neutral" title="Where are my full card details?">
            Your full card number and security code are held by our card infrastructure provider,
            never by this app. Revealing them securely, and adding the card to Apple Pay or Google
            Pay, arrive in a later release.
          </Callout>
        </div>
      </div>
    </>
  );
}
