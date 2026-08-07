/**
 * Replay SpreddPay's own provider references back into the mock Rain service at
 * boot.
 *
 * In `mock` mode the adapter's state lives in memory, so after a restart it
 * would not recognise the customer, account or card ids stored by the demo
 * seed — a freeze would fail with "card not found" for a card the platform
 * plainly has. This reads those ids back out of the database and restores them.
 *
 * It runs only in mock mode. In sandbox and production the provider is the
 * source of truth and there is nothing to rehydrate.
 */

import type { Database } from "@spreddpay/db";
import { MockRainService } from "@spreddpay/rain";
import type { RainService } from "@spreddpay/rain";

export async function hydrateMockRain(db: Database, rain: RainService): Promise<number> {
  if (!(rain instanceof MockRainService)) return 0;

  let restored = 0;

  const customers = await db.providerCustomer.findMany({
    where: { provider: "RAIN" },
    include: { trader: true },
  });
  for (const customer of customers) {
    rain.restoreCustomer({
      id: customer.providerCustomerId,
      externalId: customer.traderId,
      email: customer.trader.email,
      firstName: customer.trader.firstName,
      lastName: customer.trader.lastName,
      countryCode: customer.trader.countryCode,
      status: customer.status === "ACTIVE" ? "ACTIVE" : "PENDING",
      createdAt: customer.createdAt,
    });
    restored += 1;
  }

  const accounts = await db.financialAccount.findMany({ where: { provider: "RAIN" } });
  for (const account of accounts) {
    const latest = await db.balanceSnapshot.findFirst({
      where: { financialAccountId: account.id },
      orderBy: { asOf: "desc" },
    });

    rain.restoreAccount(
      {
        id: account.providerAccountId,
        customerId: "",
        asset: account.asset,
        network: account.network,
        status: account.status === "ACTIVE" ? "ACTIVE" : "PENDING",
        depositAddress: account.depositAddress,
        createdAt: account.createdAt,
      },
      latest
        ? {
            availableMinor: latest.availableMinor,
            pendingMinor: latest.pendingMinor,
            reservedMinor: latest.reservedMinor,
            asOf: latest.asOf,
          }
        : undefined,
    );
    restored += 1;
  }

  const cards = await db.card.findMany({ where: { provider: "RAIN" }, include: { trader: true } });
  for (const card of cards) {
    rain.restoreCard({
      id: card.providerCardId,
      customerId: card.trader.rainCustomerId ?? "",
      accountId: "",
      type: card.type,
      status: card.status,
      last4: card.last4,
      brand: card.brand,
      expiryMonth: card.expiryMonth,
      expiryYear: card.expiryYear,
      createdAt: card.createdAt,
      activatedAt: card.activatedAt,
    });
    restored += 1;
  }

  const transactions = await db.cardTransaction.findMany({
    where: { provider: "RAIN" },
    orderBy: { occurredAt: "desc" },
    take: 500,
    include: { card: true, trader: true },
  });
  for (const transaction of transactions) {
    rain.restoreTransaction({
      id: transaction.providerTransactionId,
      cardId: transaction.card?.providerCardId ?? null,
      customerId: transaction.trader.rainCustomerId ?? "",
      parentId: transaction.providerParentId,
      kind: transaction.kind,
      status: transaction.status,
      amountMinor: transaction.amountMinor,
      asset: transaction.asset,
      originalAmountMinor: transaction.originalAmountMinor,
      originalAsset: transaction.originalAsset,
      merchantName: transaction.merchantName,
      merchantCategory: transaction.merchantCategory,
      merchantCountry: transaction.merchantCountry,
      merchantId: transaction.merchantId,
      declineReason: transaction.declineReason,
      occurredAt: transaction.occurredAt,
      postedAt: transaction.postedAt,
    });
    restored += 1;
  }

  return restored;
}
