import Link from "next/link";
import type { CardControlDto, CardDto } from "@spreddpay/contracts";
import {
  Badge,
  Callout,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  PageHeader,
  StatusBadge,
  VirtualCard,
} from "@spreddpay/ui";
import { apiFetch, requireSession } from "@/lib/api";
import { CardActions } from "./actions";

export const dynamic = "force-dynamic";

interface CardDetail {
  card: CardDto;
  traderName: string;
  control: CardControlDto | null;
}

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ cardId: string }>;
}) {
  const { cardId } = await params;
  const session = await requireSession();
  const { card, traderName, control } = await apiFetch<CardDetail>(
    `/partners/${session.partnerId}/cards/${cardId}`,
  );

  return (
    <>
      <PageHeader
        title={`Card •••• ${card.last4 ?? "????"}`}
        description={`${card.cardLabel} · ${traderName}`}
        actions={
          <CardActions
            partnerId={session.partnerId}
            cardId={card.id}
            status={card.status}
            canManage={session.user.permissions.includes("card:manage")}
          />
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem),1fr]">
        <div>
          <VirtualCard
            card={card}
            productName={session.branding?.productName ?? "Spredd Pay"}
            cardLabel={card.cardLabel}
            cardBackground={session.branding?.cardBackground}
            holderName={traderName}
          />
          <p className="mt-3 text-xs text-ink-subtle">
            Masked details only. Full card number and CVV are never stored by Spredd Pay and are
            revealed, when supported, through the provider&apos;s own secure method.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Card</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-2 text-sm">
                <dt className="text-ink-subtle">Status</dt>
                <dd>
                  <StatusBadge status={card.status} />
                </dd>
                <dt className="text-ink-subtle">Type</dt>
                <dd>{card.type.toLowerCase()}</dd>
                <dt className="text-ink-subtle">Trader</dt>
                <dd>
                  <Link href={`/traders/${card.traderId}`} className="text-brand-secondary">
                    {traderName}
                  </Link>
                </dd>
                <dt className="text-ink-subtle">Provider card</dt>
                <dd className="tabular break-all text-xs">{card.providerCardId}</dd>
                <dt className="text-ink-subtle">Issued</dt>
                <dd>{new Date(card.createdAt).toLocaleString()}</dd>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Spending controls</CardTitle>
            </CardHeader>
            <CardBody>
              {control ? (
                <>
                  <dl className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-2 text-sm">
                    <dt className="text-ink-subtle">Spend limit</dt>
                    <dd className="tabular">
                      {control.spendLimit
                        ? `${control.spendLimit.display} ${control.spendLimitInterval?.toLowerCase() ?? ""}`
                        : "No limit set"}
                    </dd>
                    <dt className="text-ink-subtle">Online</dt>
                    <dd>{control.onlineEnabled ? "Allowed" : "Blocked"}</dd>
                    <dt className="text-ink-subtle">Contactless</dt>
                    <dd>{control.contactlessEnabled ? "Allowed" : "Blocked"}</dd>
                    <dt className="text-ink-subtle">ATM</dt>
                    <dd>{control.atmEnabled ? "Allowed" : "Blocked"}</dd>
                    <dt className="text-ink-subtle">Blocked categories</dt>
                    <dd>
                      {control.blockedCategories.length > 0
                        ? control.blockedCategories.join(", ")
                        : "None"}
                    </dd>
                  </dl>

                  <div className="mt-4">
                    <Callout tone="caution" title="Recorded, not yet enforced by the network">
                      These controls are stored by Spredd Pay. Pushing them to the card network
                      is enabled once card issuing goes live. <Badge tone="caution">not synced</Badge>
                    </Callout>
                  </div>
                </>
              ) : (
                <p className="text-sm text-ink-subtle">No controls configured.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
