import type { FastifyInstance } from "fastify";
import { AppError, paginationQuery, startOnboardingRequest, TRADER_HAPPY_PATH } from "@spreddpay/contracts";
import type { AppContext } from "../context";
import { clientContext, requireTrader } from "../plugins/auth";
import {
  toBalanceDto,
  toCardDto,
  toPayoutDto,
  toTraderDto,
  toTransactionDto,
} from "../mappers";
import * as onboardingService from "../services/onboarding";
import * as cardService from "../services/cards";
import { latestBalances, syncBalances } from "../services/transactions";

/**
 * Trader API, per TECHNICAL_README section 18.
 *
 * Every route here scopes to `principal.traderId`. A trader id never comes from
 * the request — there is no path parameter to tamper with, which is the
 * simplest way to guarantee "traders can access only their own records".
 */
export async function registerTraderRoutes(
  app: FastifyInstance,
  context: AppContext,
): Promise<void> {
  app.get("/me", async (request) => {
    const principal = requireTrader(request);

    const trader = await context.db.trader.findUnique({
      where: { id: principal.traderId! },
      include: { partner: { include: { branding: true } } },
    });
    if (!trader) throw AppError.notFound("Trader not found.");

    return {
      trader: toTraderDto(trader),
      partner: {
        id: trader.partner.id,
        displayName: trader.partner.displayName,
        supportEmail: trader.partner.supportEmail,
      },
      branding: trader.partner.branding
        ? {
            partnerId: trader.partner.branding.partnerId,
            productName: trader.partner.branding.productName,
            logoUrl: trader.partner.branding.logoUrl,
            iconUrl: trader.partner.branding.iconUrl,
            primaryColor: trader.partner.branding.primaryColor,
            secondaryColor: trader.partner.branding.secondaryColor,
            cardBackground: trader.partner.branding.cardBackground,
            cardLabel: trader.partner.branding.cardLabel,
            poweredBySpreddPay: trader.partner.branding.poweredBySpreddPay,
          }
        : null,
    };
  });

  app.get("/me/onboarding", async (request) => {
    const principal = requireTrader(request);
    const trader = await context.db.trader.findUnique({ where: { id: principal.traderId! } });
    if (!trader) throw AppError.notFound("Trader not found.");

    const index = TRADER_HAPPY_PATH.indexOf(trader.status);
    return {
      status: trader.status,
      steps: TRADER_HAPPY_PATH.map((step, position) => ({
        status: step,
        state: index < 0 ? "pending" : position < index ? "done" : position === index ? "current" : "pending",
      })),
      acceptedTermsVersion: trader.acceptedTermsVersion,
      acceptedTermsAt: trader.acceptedTermsAt ? trader.acceptedTermsAt.toISOString() : null,
    };
  });

  app.post("/me/onboarding/start", async (request) => {
    const principal = requireTrader(request);
    const body = startOnboardingRequest.parse(request.body ?? { acceptedTermsVersion: "2026-01-terms-v1" });

    const trader = await onboardingService.advanceOnboarding(
      { db: context.db, rain: context.rain },
      { traderId: principal.traderId!, acceptedTermsVersion: body.acceptedTermsVersion },
      "TRADER",
    );
    return toTraderDto(trader);
  });

  app.get("/me/balances", async (request) => {
    const principal = requireTrader(request);
    await syncBalances(
      { db: context.db, rain: context.rain },
      { partnerId: principal.partnerId!, traderId: principal.traderId! },
    );
    const snapshots = await latestBalances(context.db, principal.partnerId!, principal.traderId!);
    return { data: snapshots.map(toBalanceDto) };
  });

  app.get("/me/payouts", async (request) => {
    const principal = requireTrader(request);
    const query = paginationQuery.parse(request.query);

    const payouts = await context.db.payout.findMany({
      where: { traderId: principal.traderId!, partnerId: principal.partnerId! },
      orderBy: { createdAt: "desc" },
      take: query.limit,
      include: { trader: true, initiatedBy: true, approvedBy: true },
    });
    return { data: payouts.map(toPayoutDto) };
  });

  app.get("/me/cards", async (request) => {
    const principal = requireTrader(request);
    const cards = await context.db.card.findMany({
      where: { traderId: principal.traderId!, partnerId: principal.partnerId! },
      orderBy: { createdAt: "desc" },
      include: { control: true },
    });
    return { data: cards.map(toCardDto) };
  });

  app.post("/me/cards", async (request, reply) => {
    const principal = requireTrader(request);
    const card = await cardService.issueVirtualCard(
      { db: context.db, rain: context.rain },
      { principal, ...clientContext(request) },
      { partnerId: principal.partnerId!, traderId: principal.traderId! },
    );
    reply.status(201);
    return toCardDto(card);
  });

  app.post<{ Params: { id: string } }>("/me/cards/:id/freeze", async (request) => {
    const principal = requireTrader(request);
    await assertOwnCard(context, principal.traderId!, request.params.id);

    const card = await cardService.freezeCard(
      { db: context.db, rain: context.rain },
      { principal, ...clientContext(request) },
      { partnerId: principal.partnerId!, cardId: request.params.id },
    );
    return toCardDto(card);
  });

  app.post<{ Params: { id: string } }>("/me/cards/:id/unfreeze", async (request) => {
    const principal = requireTrader(request);
    await assertOwnCard(context, principal.traderId!, request.params.id);

    const card = await cardService.unfreezeCard(
      { db: context.db, rain: context.rain },
      { principal, ...clientContext(request) },
      { partnerId: principal.partnerId!, cardId: request.params.id },
    );
    return toCardDto(card);
  });

  app.get("/me/transactions", async (request) => {
    const principal = requireTrader(request);
    const query = paginationQuery.parse(request.query);

    const transactions = await context.db.cardTransaction.findMany({
      where: { traderId: principal.traderId!, partnerId: principal.partnerId! },
      orderBy: { occurredAt: "desc" },
      take: query.limit,
    });
    return { data: transactions.map(toTransactionDto) };
  });
}

/** A trader may only act on a card that is theirs. */
async function assertOwnCard(context: AppContext, traderId: string, cardId: string): Promise<void> {
  const card = await context.db.card.findFirst({
    where: { id: cardId, traderId },
    select: { id: true },
  });
  if (!card) throw AppError.notFound("Card not found.");
}
