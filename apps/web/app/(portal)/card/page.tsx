import type { CardDto } from "@spreddpay/contracts";
import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  PageHeader,
  StatusBadge,
  VirtualCard,
} from "@spreddpay/ui";
import { apiFetch, requireTraderSession } from "@/lib/api";
import { CardControls } from "./controls";

export const dynamic = "force-dynamic";

/**
 * Card issuance is deferred until the provider's card programme is available.
 *
 * The screen is kept rather than removed: the data model, the state machine and
 * this UI all still work, and a trader who already has a card keeps full use of
 * it. What changes is that nobody new can be issued one, and the screen says so
 * plainly instead of offering something the platform cannot currently deliver.
 */
export default async function CardPage() {
  const session = await requireTraderSession();
  const cards = await apiFetch<{ data: CardDto[] }>("/me/cards");
  const card = cards.data[0];
  const productName = session.branding?.productName ?? "your account";

  if (!card) {
    return (
      <>
        <PageHeader title="Card" description="Spend your payout balance directly." />

        <div className="grid max-w-2xl gap-4">
          <Card>
            <CardBody className="py-10 text-center">
              {/* A muted placeholder in the card's own shape, so the screen
                  communicates "this is coming" rather than "this is broken". */}
              <div className="mx-auto mb-5 aspect-[1.586/1] w-full max-w-[19rem] rounded-2xl border border-dashed border-edge bg-surface-muted" />
              <p className="text-sm font-medium text-ink">Your card is coming soon</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-ink-subtle">
                {productName} cards are not being issued yet. Your payout balance is already
                available and you can withdraw it at any time.
              </p>
            </CardBody>
          </Card>

          <Callout tone="neutral" title="What you can do now">
            Payouts from your firm land in your account and appear under Payouts. Withdrawals go to
            a destination you control. Card spending is added once our card programme opens.
          </Callout>
        </div>
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
            never by this app.
          </Callout>
        </div>
      </div>
    </>
  );
}
