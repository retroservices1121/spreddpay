/**
 * Card issuance and controls.
 *
 * The invariant this file protects: full PAN, CVV and provider tokens never
 * enter SpreddPay's database, logs or API responses. What is stored is the
 * provider card id, the last four digits and the expiry — enough to render a
 * card and reconcile a transaction, and nothing that is worth stealing.
 */

import {
  AppError,
  assertCardTransition,
  assertTraderTransition,
  parseAmountToMinor,
  type CardStatus,
} from "@spreddpay/contracts";
import { recordAudit, type Database } from "@spreddpay/db";
import { requirePermission, type Principal } from "@spreddpay/auth";
import { queueNotification, queuePartnerWebhook, TEMPLATES } from "@spreddpay/notifications";
import type { RainService } from "@spreddpay/rain";

export interface CardDeps {
  db: Database;
  rain: RainService;
}

export interface ActorContext {
  principal: Principal;
  ipAddress: string | null;
  userAgent: string | null;
}

function auditActor(actor: ActorContext) {
  return {
    type: actor.principal.kind,
    id: actor.principal.userId,
    label: `${actor.principal.firstName} ${actor.principal.lastName}`,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  } as const;
}

export async function issueVirtualCard(
  deps: CardDeps,
  actor: ActorContext,
  input: { partnerId: string; traderId: string },
) {
  if (actor.principal.kind !== "TRADER") {
    requirePermission(actor.principal, "card:manage");
  }

  const trader = await deps.db.trader.findFirst({
    where: { id: input.traderId, partnerId: input.partnerId },
    include: { partner: { include: { branding: true, programs: true } } },
  });
  if (!trader) throw AppError.notFound("Trader not found.");

  if (trader.status !== "CARD_ELIGIBLE") {
    throw new AppError(
      "TRADER_NOT_ELIGIBLE",
      `Trader is ${trader.status}; a card requires CARD_ELIGIBLE.`,
    );
  }

  const account = await deps.db.financialAccount.findFirst({
    where: { partnerId: input.partnerId, traderId: trader.id, provider: "RAIN" },
  });
  if (!account || !trader.rainCustomerId) {
    throw AppError.conflict("Trader has no Rain account.");
  }

  const cardLabel = trader.partner.branding?.cardLabel ?? "Payout Card";
  const program = trader.partner.programs.find((p) => p.provider === "RAIN" && p.active);

  // Mark the intent before calling the provider, so a provider timeout leaves a
  // record that a card was requested rather than a silent gap.
  await deps.db.trader.update({
    where: { id: trader.id },
    data: { status: "VIRTUAL_CARD_PENDING" },
  });
  assertTraderTransition("CARD_ELIGIBLE", "VIRTUAL_CARD_PENDING");

  try {
    const providerCard = await deps.rain.createVirtualCard({
      customerId: trader.rainCustomerId,
      accountId: account.providerAccountId,
      type: "VIRTUAL",
      cardLabel,
      programId: program?.providerProgramId ?? null,
    });

    return await deps.db.$transaction(async (tx) => {
      const card = await tx.card.upsert({
        where: {
          provider_providerCardId: { provider: "RAIN", providerCardId: providerCard.id },
        },
        create: {
          partnerId: input.partnerId,
          traderId: trader.id,
          provider: "RAIN",
          providerCardId: providerCard.id,
          type: "VIRTUAL",
          last4: providerCard.last4,
          brand: providerCard.brand,
          expiryMonth: providerCard.expiryMonth,
          expiryYear: providerCard.expiryYear,
          status: providerCard.status,
          cardLabel,
          activatedAt: providerCard.activatedAt,
        },
        update: { status: providerCard.status, activatedAt: providerCard.activatedAt },
      });

      await tx.cardControl.upsert({
        where: { cardId: card.id },
        create: { cardId: card.id, partnerId: input.partnerId },
        update: {},
      });

      await tx.trader.update({
        where: { id: trader.id },
        data: { status: "VIRTUAL_CARD_ACTIVE", activatedAt: new Date() },
      });

      await recordAudit(tx, {
        partnerId: input.partnerId,
        actor: auditActor(actor),
        action: "card.issued",
        entityType: "Card",
        entityId: card.id,
        summary: `Issued virtual card ending ${card.last4 ?? "????"} to ${trader.firstName} ${trader.lastName}`,
        changes: { providerCardId: providerCard.id, status: providerCard.status },
      });

      const template = TEMPLATES.cardIssued({
        productName: trader.partner.branding?.productName ?? trader.partner.displayName,
        last4: card.last4 ?? "????",
      });
      await queueNotification(tx, {
        partnerId: input.partnerId,
        traderId: trader.id,
        channel: "EMAIL",
        ...template,
      });

      await queuePartnerWebhook(tx, {
        partnerId: input.partnerId,
        eventType: "card.active",
        payload: { cardId: card.id, traderId: trader.id, last4: card.last4 },
      });

      return card;
    });
  } catch (error) {
    await deps.db.trader.update({
      where: { id: trader.id },
      data: { status: "PROVIDER_ERROR" },
    });
    throw error;
  }
}

async function setCardStatus(
  deps: CardDeps,
  actor: ActorContext,
  input: { partnerId: string; cardId: string; next: CardStatus; action: string },
) {
  const card = await deps.db.card.findFirst({
    where: { id: input.cardId, partnerId: input.partnerId },
  });
  if (!card) throw AppError.notFound("Card not found.");

  assertCardTransition(card.status, input.next);

  if (input.next === "FROZEN") await deps.rain.freezeCard(card.providerCardId);
  if (input.next === "ACTIVE" && card.status === "FROZEN") {
    await deps.rain.unfreezeCard(card.providerCardId);
  }

  return deps.db.$transaction(async (tx) => {
    const updated = await tx.card.update({
      where: { id: card.id },
      data: { status: input.next },
    });

    await recordAudit(tx, {
      partnerId: input.partnerId,
      actor: auditActor(actor),
      action: input.action,
      entityType: "Card",
      entityId: card.id,
      summary: `Card ending ${card.last4 ?? "????"} ${input.next.toLowerCase()}`,
      changes: { status: { from: card.status, to: input.next } },
    });

    if (input.next === "FROZEN") {
      await queuePartnerWebhook(tx, {
        partnerId: input.partnerId,
        eventType: "card.frozen",
        payload: { cardId: card.id },
      });
    }

    return updated;
  });
}

export async function freezeCard(
  deps: CardDeps,
  actor: ActorContext,
  input: { partnerId: string; cardId: string },
) {
  if (actor.principal.kind !== "TRADER") requirePermission(actor.principal, "card:manage");
  return setCardStatus(deps, actor, { ...input, next: "FROZEN", action: "card.frozen" });
}

export async function unfreezeCard(
  deps: CardDeps,
  actor: ActorContext,
  input: { partnerId: string; cardId: string },
) {
  if (actor.principal.kind !== "TRADER") requirePermission(actor.principal, "card:manage");
  return setCardStatus(deps, actor, { ...input, next: "ACTIVE", action: "card.unfrozen" });
}

export interface CardControlUpdate {
  spendLimit?: string | null | undefined;
  spendLimitInterval?: "DAILY" | "WEEKLY" | "MONTHLY" | "PER_TRANSACTION" | null | undefined;
  allowedCategories?: string[] | undefined;
  blockedCategories?: string[] | undefined;
  allowedCountries?: string[] | undefined;
  onlineEnabled?: boolean | undefined;
  contactlessEnabled?: boolean | undefined;
  atmEnabled?: boolean | undefined;
}

/**
 * Update stored spending controls.
 *
 * `providerSynced` stays false until a Rain endpoint for pushing controls is
 * verified. The UI reads that flag and labels unsynced controls as pending, so
 * nothing on screen claims a limit is being enforced by the network when it is
 * only recorded here.
 */
export async function updateCardControls(
  deps: CardDeps,
  actor: ActorContext,
  input: { partnerId: string; cardId: string; asset: string; update: CardControlUpdate },
) {
  if (actor.principal.kind !== "TRADER") requirePermission(actor.principal, "card:manage");

  const card = await deps.db.card.findFirst({
    where: { id: input.cardId, partnerId: input.partnerId },
  });
  if (!card) throw AppError.notFound("Card not found.");

  const spendLimitMinor =
    input.update.spendLimit === undefined
      ? undefined
      : input.update.spendLimit === null
        ? null
        : parseAmountToMinor(input.update.spendLimit, input.asset);

  return deps.db.$transaction(async (tx) => {
    const control = await tx.cardControl.upsert({
      where: { cardId: card.id },
      create: {
        cardId: card.id,
        partnerId: input.partnerId,
        spendLimitMinor: spendLimitMinor ?? null,
        spendLimitInterval: input.update.spendLimitInterval ?? null,
        allowedCategories: input.update.allowedCategories ?? [],
        blockedCategories: input.update.blockedCategories ?? [],
        allowedCountries: input.update.allowedCountries ?? [],
        onlineEnabled: input.update.onlineEnabled ?? true,
        contactlessEnabled: input.update.contactlessEnabled ?? true,
        atmEnabled: input.update.atmEnabled ?? false,
        providerSynced: false,
      },
      update: {
        ...(spendLimitMinor === undefined ? {} : { spendLimitMinor }),
        ...(input.update.spendLimitInterval === undefined
          ? {}
          : { spendLimitInterval: input.update.spendLimitInterval }),
        ...(input.update.allowedCategories === undefined
          ? {}
          : { allowedCategories: input.update.allowedCategories }),
        ...(input.update.blockedCategories === undefined
          ? {}
          : { blockedCategories: input.update.blockedCategories }),
        ...(input.update.allowedCountries === undefined
          ? {}
          : { allowedCountries: input.update.allowedCountries }),
        ...(input.update.onlineEnabled === undefined
          ? {}
          : { onlineEnabled: input.update.onlineEnabled }),
        ...(input.update.contactlessEnabled === undefined
          ? {}
          : { contactlessEnabled: input.update.contactlessEnabled }),
        ...(input.update.atmEnabled === undefined ? {} : { atmEnabled: input.update.atmEnabled }),
        providerSynced: false,
      },
    });

    await recordAudit(tx, {
      partnerId: input.partnerId,
      actor: auditActor(actor),
      action: "card.controls_updated",
      entityType: "Card",
      entityId: card.id,
      summary: `Updated spending controls on card ending ${card.last4 ?? "????"}`,
      changes: input.update as Record<string, unknown>,
    });

    return control;
  });
}
