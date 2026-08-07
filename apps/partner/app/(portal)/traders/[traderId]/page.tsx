import Link from "next/link";
import type { BalanceDto, CardDto, PayoutDto, TraderDto } from "@spreddpay/contracts";
import { TRADER_HAPPY_PATH } from "@spreddpay/contracts";
import {
  Card,
  CardBody,
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
import { TraderActions } from "./actions";

export const dynamic = "force-dynamic";

interface TraderDetail {
  trader: TraderDto;
  cards: CardDto[];
  payouts: PayoutDto[];
  balances: BalanceDto[];
}

export default async function TraderDetailPage({
  params,
}: {
  params: Promise<{ traderId: string }>;
}) {
  const { traderId } = await params;
  const session = await requireSession();

  const detail = await apiFetch<TraderDetail>(
    `/partners/${session.partnerId}/traders/${traderId}`,
  );
  const { trader, cards, payouts, balances } = detail;

  const stepIndex = TRADER_HAPPY_PATH.indexOf(trader.status);
  const available = balances[0]?.available.display ?? "0.00 USDC";

  return (
    <>
      <PageHeader
        title={`${trader.firstName} ${trader.lastName}`}
        description={`${trader.externalTraderId} · ${trader.email} · ${trader.countryCode}`}
        actions={
          <TraderActions
            partnerId={session.partnerId}
            traderId={trader.id}
            status={trader.status}
            canAdvance={session.user.permissions.includes("trader:write")}
            canIssueCard={session.user.permissions.includes("card:manage")}
          />
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Status" value={trader.status.replace(/_/g, " ").toLowerCase()} />
        <Stat label="Available balance" value={available} />
        <Stat label="Active cards" value={String(cards.filter((c) => c.status === "ACTIVE").length)} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Onboarding</CardTitle>
          </CardHeader>
          <CardBody>
            <ol className="flex flex-col gap-2">
              {TRADER_HAPPY_PATH.map((step, index) => {
                const state =
                  stepIndex < 0 ? "pending" : index < stepIndex ? "done" : index === stepIndex ? "current" : "pending";
                return (
                  <li key={step} className="flex items-center gap-3 text-sm">
                    <span
                      className={
                        state === "done"
                          ? "grid h-5 w-5 place-items-center rounded-full bg-positive text-[10px] text-white"
                          : state === "current"
                            ? "grid h-5 w-5 place-items-center rounded-full bg-brand-secondary text-[10px] text-white"
                            : "grid h-5 w-5 place-items-center rounded-full border border-edge text-[10px] text-ink-subtle"
                      }
                    >
                      {state === "done" ? "✓" : index + 1}
                    </span>
                    <span className={state === "pending" ? "text-ink-subtle" : "text-ink"}>
                      {step.replace(/_/g, " ").toLowerCase()}
                    </span>
                  </li>
                );
              })}
            </ol>
            {stepIndex < 0 ? (
              <p className="mt-4 text-xs text-critical">
                Trader is in the exceptional state {trader.status.replace(/_/g, " ").toLowerCase()}.
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cards</CardTitle>
          </CardHeader>
          {cards.length === 0 ? (
            <EmptyState title="No card issued" description="A card can be issued once the trader is card eligible." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Card</Th>
                  <Th>Type</Th>
                  <Th>Status</Th>
                  <Th>Issued</Th>
                </tr>
              </thead>
              <tbody>
                {cards.map((card) => (
                  <tr key={card.id}>
                    <Td className="tabular">
                      <Link href={`/cards/${card.id}`} className="text-brand-secondary">
                        •••• {card.last4 ?? "????"}
                      </Link>
                    </Td>
                    <Td>{card.type.toLowerCase()}</Td>
                    <Td>
                      <StatusBadge status={card.status} />
                    </Td>
                    <Td className="text-ink-muted">
                      {new Date(card.createdAt).toLocaleDateString()}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payouts</CardTitle>
        </CardHeader>
        {payouts.length === 0 ? (
          <EmptyState title="No payouts yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Reference</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((payout) => (
                <tr key={payout.id}>
                  <Td>
                    <Link href={`/payouts/${payout.id}`} className="text-brand-secondary">
                      {payout.externalReference}
                    </Link>
                  </Td>
                  <Td className="tabular text-right">{payout.amount.display}</Td>
                  <Td>
                    <StatusBadge status={payout.status} />
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
