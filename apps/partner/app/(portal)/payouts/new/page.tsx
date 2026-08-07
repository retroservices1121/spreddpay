import type { TraderDto } from "@spreddpay/contracts";
import { Callout, PageHeader } from "@spreddpay/ui";
import { apiFetch, requireSession } from "@/lib/api";
import { NewPayoutForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NewPayoutPage() {
  const session = await requireSession();
  const traders = await apiFetch<{ data: TraderDto[] }>(
    `/partners/${session.partnerId}/traders?limit=100`,
  );

  // Only traders with an active Rain account can receive funds.
  const eligible = traders.data.filter((trader) =>
    ["RAIN_ACCOUNT_ACTIVE", "CARD_ELIGIBLE", "VIRTUAL_CARD_PENDING", "VIRTUAL_CARD_ACTIVE"].includes(
      trader.status,
    ),
  );

  return (
    <>
      <PageHeader
        title="New payout"
        description="Funds become available on the trader's card through the approved Rain flow."
      />

      {eligible.length === 0 ? (
        <Callout tone="caution" title="No eligible traders">
          A payout can only be created for a trader with an active Rain account. Complete onboarding
          for at least one trader first.
        </Callout>
      ) : (
        <div className="max-w-xl">
          <NewPayoutForm partnerId={session.partnerId} traders={eligible} />
        </div>
      )}
    </>
  );
}
