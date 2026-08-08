import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  AppError,
  approvePayoutRequest,
  cancelPayoutRequest,
  createPayoutRequest,
  inviteTraderRequest,
  issueCardRequest,
  listPayoutsQuery,
  listTradersQuery,
  listTransactionsQuery,
  paginationQuery,
  rejectPayoutRequest,
  updateBrandingRequest,
  updateCardControlsRequest,
} from "@spreddpay/contracts";
import { requirePartnerAccess, requirePermission } from "@spreddpay/auth";
import { forPartner, recordAudit } from "@spreddpay/db";
import { partnerDashboard, toCsv } from "@spreddpay/analytics";
import type { AppContext } from "../context";
import { clientContext, requirePartnerUser } from "../plugins/auth";
import { readIdempotencyKey, withIdempotency } from "../plugins/idempotency";
import {
  money,
  toAuditDto,
  toBalanceDto,
  toBrandingDto,
  toCardControlDto,
  toCardDto,
  toPartnerDto,
  toPayoutDto,
  toTraderDto,
  toTransactionDto,
} from "../mappers";
import * as payoutService from "../services/payouts";
import * as onboardingService from "../services/onboarding";
import * as cardService from "../services/cards";
import { latestBalances, syncBalances } from "../services/transactions";

interface PartnerParams {
  partnerId: string;
}

/**
 * Partner API, per TECHNICAL_README section 18.
 *
 * Every route resolves the tenant the same way: `requirePartnerAccess` proves
 * the caller may see this partner, then all queries run through `forPartner`,
 * which pins partnerId into the query itself. Forgetting a filter in a handler
 * below cannot leak another tenant's rows.
 */
export async function registerPartnerRoutes(
  app: FastifyInstance,
  context: AppContext,
): Promise<void> {
  function scope(request: FastifyRequest, partnerId: string) {
    const principal = requirePartnerUser(request);
    requirePartnerAccess(principal, partnerId);
    return {
      principal,
      tdb: forPartner(context.db, partnerId),
      actor: { principal, ...clientContext(request) },
    };
  }

  // ------------------------------------------------------------- partner

  app.get<{ Params: PartnerParams }>("/partners/:partnerId", async (request) => {
    const { partnerId } = request.params;
    scope(request, partnerId);

    const partner = await context.db.partner.findUnique({
      where: { id: partnerId },
      include: { branding: true },
    });
    if (!partner) throw AppError.notFound("Partner not found.");

    return {
      partner: toPartnerDto(partner),
      branding: partner.branding ? toBrandingDto(partner.branding) : null,
    };
  });

  app.get<{ Params: PartnerParams }>("/partners/:partnerId/dashboard", async (request) => {
    const { partnerId } = request.params;
    const { principal } = scope(request, partnerId);
    requirePermission(principal, "report:read");
    return partnerDashboard(context.db, partnerId);
  });

  app.put<{ Params: PartnerParams }>("/partners/:partnerId/branding", async (request) => {
    const { partnerId } = request.params;
    const { principal, actor } = scope(request, partnerId);
    requirePermission(principal, "branding:manage");

    const body = updateBrandingRequest.parse(request.body);

    const branding = await context.db.$transaction(async (tx) => {
      const updated = await tx.partnerBranding.upsert({
        where: { partnerId },
        create: { partnerId, ...body },
        update: body,
      });
      await recordAudit(tx, {
        partnerId,
        actor: {
          type: principal.kind,
          id: principal.userId,
          label: `${principal.firstName} ${principal.lastName}`,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        },
        action: "branding.updated",
        entityType: "PartnerBranding",
        entityId: updated.id,
        summary: `Updated branding for ${body.productName}`,
        changes: body as Record<string, unknown>,
      });
      return updated;
    });

    return toBrandingDto(branding);
  });

  // ------------------------------------------------------------- traders

  app.get<{ Params: PartnerParams }>("/partners/:partnerId/traders", async (request) => {
    const { partnerId } = request.params;
    const { principal, tdb } = scope(request, partnerId);
    requirePermission(principal, "trader:read");

    const query = listTradersQuery.parse(request.query);
    const traders = await tdb.trader.findMany({
      where: {
        ...(query.status ? { status: query.status as never } : {}),
        ...(query.search
          ? {
              OR: [
                { email: { contains: query.search, mode: "insensitive" as const } },
                { firstName: { contains: query.search, mode: "insensitive" as const } },
                { lastName: { contains: query.search, mode: "insensitive" as const } },
                { externalTraderId: { contains: query.search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = traders.length > query.limit;
    const page = hasMore ? traders.slice(0, query.limit) : traders;

    return {
      data: page.map(toTraderDto),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
      hasMore,
    };
  });

  app.post<{ Params: PartnerParams }>("/partners/:partnerId/traders", async (request, reply) => {
    const { partnerId } = request.params;
    const { actor } = scope(request, partnerId);
    const body = inviteTraderRequest.parse(request.body);
    const key = readIdempotencyKey(request);

    return withIdempotency(
      context.db,
      reply,
      {
        partnerId,
        endpoint: "POST /partners/:partnerId/traders",
        key,
        body,
        statusCode: 201,
      },
      async () => {
        const trader = await onboardingService.inviteTrader(
          { db: context.db, rain: context.rain },
          actor,
          { partnerId, ...body },
        );
        return toTraderDto(trader);
      },
    );
  });

  app.get<{ Params: PartnerParams & { traderId: string } }>(
    "/partners/:partnerId/traders/:traderId",
    async (request) => {
      const { partnerId, traderId } = request.params;
      const { principal, tdb } = scope(request, partnerId);
      requirePermission(principal, "trader:read");

      const trader = await tdb.trader.findFirst({ where: { id: traderId } });
      if (!trader) throw AppError.notFound("Trader not found.");

      const [cards, payouts, balances] = await Promise.all([
        tdb.card.findMany({ where: { traderId }, orderBy: { createdAt: "desc" } }),
        tdb.payout.findMany({
          where: { traderId },
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { trader: true, initiatedBy: true, approvedBy: true },
        }),
        latestBalances(context.db, partnerId, traderId),
      ]);

      return {
        trader: toTraderDto(trader),
        cards: cards.map(toCardDto),
        payouts: payouts.map(toPayoutDto),
        balances: balances.map(toBalanceDto),
      };
    },
  );

  app.post<{ Params: PartnerParams & { traderId: string } }>(
    "/partners/:partnerId/traders/:traderId/advance",
    async (request) => {
      const { partnerId, traderId } = request.params;
      const { principal, tdb } = scope(request, partnerId);
      requirePermission(principal, "trader:write");

      const existing = await tdb.trader.findFirst({ where: { id: traderId } });
      if (!existing) throw AppError.notFound("Trader not found.");

      const trader = await onboardingService.advanceOnboarding(
        { db: context.db, rain: context.rain },
        { traderId, acceptedTermsVersion: "2026-01-terms-v1" },
        "PARTNER_USER",
      );
      return toTraderDto(trader);
    },
  );

  // ------------------------------------------------------------- payouts

  app.get<{ Params: PartnerParams }>("/partners/:partnerId/payouts", async (request) => {
    const { partnerId } = request.params;
    const { principal, tdb } = scope(request, partnerId);
    requirePermission(principal, "payout:read");

    const query = listPayoutsQuery.parse(request.query);
    const payouts = await tdb.payout.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.traderId ? { traderId: query.traderId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { trader: true, initiatedBy: true, approvedBy: true },
    });

    const hasMore = payouts.length > query.limit;
    const page = hasMore ? payouts.slice(0, query.limit) : payouts;

    return {
      data: page.map(toPayoutDto),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
      hasMore,
    };
  });

  app.post<{ Params: PartnerParams }>("/partners/:partnerId/payouts", async (request, reply) => {
    const { partnerId } = request.params;
    const { actor } = scope(request, partnerId);
    const body = createPayoutRequest.parse(request.body);
    const key = readIdempotencyKey(request);

    return withIdempotency(
      context.db,
      reply,
      { partnerId, endpoint: "POST /partners/:partnerId/payouts", key, body, statusCode: 201 },
      async () => {
        const payout = await payoutService.createPayout(
          { db: context.db, rain: context.rain },
          actor,
          {
            partnerId,
            traderId: body.traderId,
            externalReference: body.externalReference,
            amount: body.amount,
            asset: body.asset,
            network: body.network,
            memo: body.memo,
            submitForApproval: body.submitForApproval,
            idempotencyKey: key,
          },
        );
        return toPayoutDto(payout);
      },
    );
  });

  app.get<{ Params: PartnerParams & { payoutId: string } }>(
    "/partners/:partnerId/payouts/:payoutId",
    async (request) => {
      const { partnerId, payoutId } = request.params;
      const { principal, tdb } = scope(request, partnerId);
      requirePermission(principal, "payout:read");

      const payout = await tdb.payout.findFirst({
        where: { id: payoutId },
        include: {
          trader: true,
          initiatedBy: true,
          approvedBy: true,
          approvals: { include: { partnerUser: true }, orderBy: { createdAt: "asc" } },
        },
      });
      if (!payout) throw AppError.notFound("Payout not found.");

      return {
        payout: toPayoutDto(payout),
        approvals: payout.approvals.map((approval) => ({
          id: approval.id,
          decision: approval.decision,
          note: approval.note,
          by: `${approval.partnerUser.firstName} ${approval.partnerUser.lastName}`,
          createdAt: approval.createdAt.toISOString(),
        })),
      };
    },
  );

  app.post<{ Params: PartnerParams & { payoutId: string } }>(
    "/partners/:partnerId/payouts/:payoutId/approve",
    async (request) => {
      const { partnerId, payoutId } = request.params;
      const { actor } = scope(request, partnerId);
      const body = approvePayoutRequest.parse(request.body ?? {});

      const deps = { db: context.db, rain: context.rain };
      await payoutService.approvePayout(deps, actor, { partnerId, payoutId, note: body.note });

      // Approval releases the payout to the provider immediately. If submission
      // is unavailable the payout lands in MANUAL_REVIEW with an ops task, and
      // that is reported here rather than swallowed.
      try {
        await payoutService.submitPayout(deps, actor, { partnerId, payoutId });

        /**
         * In mock mode there is no provider to send a settlement webhook, so a
         * payout would sit at SUBMITTED_TO_PROVIDER forever and the trader's
         * balance would never move. Settle inline instead: the mock provider
         * is instant by definition.
         *
         * With a real provider this stays untouched — settlement arrives as a
         * webhook and the worker calls completePayout, which is the same code
         * path. Nothing here fakes a settlement that a real provider has not
         * confirmed.
         */
        if (context.env.RAIN_MODE === "mock" && context.env.DAKOTA_MODE === "mock") {
          const completed = await payoutService.completePayout(deps, { payoutId });
          return { payout: toPayoutDto(completed), submitted: true, settled: true };
        }

        const current = await context.db.payout.findFirst({
          where: { id: payoutId, partnerId },
          include: { trader: true, initiatedBy: true, approvedBy: true },
        });
        return { payout: current ? toPayoutDto(current) : null, submitted: true, settled: false };
      } catch (error) {
        const current = await context.db.payout.findFirst({
          where: { id: payoutId, partnerId },
          include: { trader: true, initiatedBy: true, approvedBy: true },
        });
        return {
          payout: current ? toPayoutDto(current) : null,
          submitted: false,
          submissionError: error instanceof Error ? error.message : "Unknown provider error",
        };
      }
    },
  );

  app.post<{ Params: PartnerParams & { payoutId: string } }>(
    "/partners/:partnerId/payouts/:payoutId/reject",
    async (request) => {
      const { partnerId, payoutId } = request.params;
      const { actor } = scope(request, partnerId);
      const body = rejectPayoutRequest.parse(request.body);

      const payout = await payoutService.rejectPayout(
        { db: context.db, rain: context.rain },
        actor,
        { partnerId, payoutId, reason: body.reason },
      );
      return toPayoutDto(payout);
    },
  );

  app.post<{ Params: PartnerParams & { payoutId: string } }>(
    "/partners/:partnerId/payouts/:payoutId/cancel",
    async (request) => {
      const { partnerId, payoutId } = request.params;
      const { actor } = scope(request, partnerId);
      const body = cancelPayoutRequest.parse(request.body);

      const payout = await payoutService.cancelPayout(
        { db: context.db, rain: context.rain },
        actor,
        { partnerId, payoutId, reason: body.reason },
      );
      return toPayoutDto(payout);
    },
  );

  // --------------------------------------------------------------- cards

  app.get<{ Params: PartnerParams }>("/partners/:partnerId/cards", async (request) => {
    const { partnerId } = request.params;
    const { principal, tdb } = scope(request, partnerId);
    requirePermission(principal, "card:read");

    const query = paginationQuery.parse(request.query);
    const cards = await tdb.card.findMany({
      orderBy: { createdAt: "desc" },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { trader: true },
    });

    const hasMore = cards.length > query.limit;
    const page = hasMore ? cards.slice(0, query.limit) : cards;

    return {
      data: page.map((card) => ({
        ...toCardDto(card),
        traderName: `${card.trader.firstName} ${card.trader.lastName}`,
      })),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
      hasMore,
    };
  });

  app.post<{ Params: PartnerParams }>("/partners/:partnerId/cards", async (request, reply) => {
    const { partnerId } = request.params;
    const { actor } = scope(request, partnerId);
    const body = issueCardRequest.parse(request.body);
    const key = readIdempotencyKey(request);

    return withIdempotency(
      context.db,
      reply,
      { partnerId, endpoint: "POST /partners/:partnerId/cards", key, body, statusCode: 201 },
      async () => {
        const card = await cardService.issueVirtualCard(
          { db: context.db, rain: context.rain },
          actor,
          { partnerId, traderId: body.traderId },
        );
        return toCardDto(card);
      },
    );
  });

  app.get<{ Params: PartnerParams & { cardId: string } }>(
    "/partners/:partnerId/cards/:cardId",
    async (request) => {
      const { partnerId, cardId } = request.params;
      const { principal, tdb } = scope(request, partnerId);
      requirePermission(principal, "card:read");

      const card = await tdb.card.findFirst({
        where: { id: cardId },
        include: { control: true, trader: true },
      });
      if (!card) throw AppError.notFound("Card not found.");

      const partner = await context.db.partner.findUnique({
        where: { id: partnerId },
        select: { defaultAsset: true },
      });

      return {
        card: toCardDto(card),
        traderName: `${card.trader.firstName} ${card.trader.lastName}`,
        control: card.control
          ? toCardControlDto(card.control, partner?.defaultAsset ?? "USDC")
          : null,
      };
    },
  );

  app.put<{ Params: PartnerParams & { cardId: string } }>(
    "/partners/:partnerId/cards/:cardId/controls",
    async (request) => {
      const { partnerId, cardId } = request.params;
      const { actor } = scope(request, partnerId);
      const body = updateCardControlsRequest.parse(request.body);

      const partner = await context.db.partner.findUnique({
        where: { id: partnerId },
        select: { defaultAsset: true },
      });
      const asset = partner?.defaultAsset ?? "USDC";

      const control = await cardService.updateCardControls(
        { db: context.db, rain: context.rain },
        actor,
        { partnerId, cardId, asset, update: body },
      );
      return toCardControlDto(control, asset);
    },
  );

  app.post<{ Params: PartnerParams & { cardId: string } }>(
    "/partners/:partnerId/cards/:cardId/freeze",
    async (request) => {
      const { partnerId, cardId } = request.params;
      const { actor } = scope(request, partnerId);
      const card = await cardService.freezeCard(
        { db: context.db, rain: context.rain },
        actor,
        { partnerId, cardId },
      );
      return toCardDto(card);
    },
  );

  app.post<{ Params: PartnerParams & { cardId: string } }>(
    "/partners/:partnerId/cards/:cardId/unfreeze",
    async (request) => {
      const { partnerId, cardId } = request.params;
      const { actor } = scope(request, partnerId);
      const card = await cardService.unfreezeCard(
        { db: context.db, rain: context.rain },
        actor,
        { partnerId, cardId },
      );
      return toCardDto(card);
    },
  );

  // -------------------------------------------------------- transactions

  app.get<{ Params: PartnerParams }>("/partners/:partnerId/transactions", async (request) => {
    const { partnerId } = request.params;
    const { principal, tdb } = scope(request, partnerId);
    requirePermission(principal, "transaction:read");

    const query = listTransactionsQuery.parse(request.query);
    const transactions = await tdb.cardTransaction.findMany({
      where: {
        ...(query.traderId ? { traderId: query.traderId } : {}),
        ...(query.cardId ? { cardId: query.cardId } : {}),
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.from || query.to
          ? {
              occurredAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { occurredAt: "desc" },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = transactions.length > query.limit;
    const page = hasMore ? transactions.slice(0, query.limit) : transactions;

    return {
      data: page.map(toTransactionDto),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
      hasMore,
    };
  });

  app.get<{ Params: PartnerParams }>(
    "/partners/:partnerId/transactions.csv",
    async (request, reply) => {
      const { partnerId } = request.params;
      const { principal, tdb } = scope(request, partnerId);
      requirePermission(principal, "transaction:export");

      const transactions = await tdb.cardTransaction.findMany({
        orderBy: { occurredAt: "desc" },
        take: 5000,
      });

      const csv = toCsv(
        transactions.map((transaction) => ({
          id: transaction.id,
          providerTransactionId: transaction.providerTransactionId,
          occurredAt: transaction.occurredAt,
          kind: transaction.kind,
          status: transaction.status,
          // Minor units as a string keeps the export lossless.
          amountMinor: transaction.amountMinor.toString(),
          asset: transaction.asset,
          merchantName: transaction.merchantName,
          merchantCategory: transaction.merchantCategory,
          merchantCountry: transaction.merchantCountry,
        })),
      );

      reply.header("content-type", "text/csv; charset=utf-8");
      reply.header("content-disposition", 'attachment; filename="transactions.csv"');
      return csv;
    },
  );

  // ------------------------------------------------------------ balances

  app.get<{ Params: PartnerParams }>("/partners/:partnerId/balances", async (request) => {
    const { partnerId } = request.params;
    const { principal, tdb } = scope(request, partnerId);
    requirePermission(principal, "report:read");

    const traders = await tdb.trader.findMany({ select: { id: true } });
    const rows = [];
    for (const trader of traders) {
      const snapshots = await latestBalances(context.db, partnerId, trader.id);
      for (const snapshot of snapshots) {
        rows.push({ traderId: trader.id, ...toBalanceDto(snapshot) });
      }
    }
    return { data: rows };
  });

  app.post<{ Params: PartnerParams & { traderId: string } }>(
    "/partners/:partnerId/traders/:traderId/sync-balances",
    async (request) => {
      const { partnerId, traderId } = request.params;
      const { principal } = scope(request, partnerId);
      requirePermission(principal, "trader:read");

      const written = await syncBalances(
        { db: context.db, rain: context.rain },
        { partnerId, traderId },
      );
      const snapshots = await latestBalances(context.db, partnerId, traderId);
      return { written, balances: snapshots.map(toBalanceDto) };
    },
  );

  // ------------------------------------------------------------- revenue

  app.get<{ Params: PartnerParams }>("/partners/:partnerId/revenue", async (request) => {
    const { partnerId } = request.params;
    const { principal, tdb } = scope(request, partnerId);
    requirePermission(principal, "revenue:read");

    const [rules, events] = await Promise.all([
      tdb.revenueRule.findMany({ orderBy: { effectiveFrom: "desc" } }),
      tdb.revenueEvent.findMany({ orderBy: { occurredAt: "desc" }, take: 100 }),
    ]);

    let gross = 0n;
    let spreddPay = 0n;
    let partnerShare = 0n;
    for (const event of events) {
      gross += event.grossMinor;
      spreddPay += event.spreddPayMinor;
      partnerShare += event.partnerMinor;
    }

    return {
      rules: rules.map((rule) => ({
        id: rule.id,
        source: rule.source,
        calculationType: rule.calculationType,
        spreddPayShareBps: rule.spreddPayShareBps,
        partnerShareBps: rule.partnerShareBps,
        effectiveFrom: rule.effectiveFrom.toISOString(),
        effectiveTo: rule.effectiveTo ? rule.effectiveTo.toISOString() : null,
      })),
      totals: {
        gross: money(gross, "USDC"),
        spreddPay: money(spreddPay, "USDC"),
        partner: money(partnerShare, "USDC"),
      },
      events: events.map((event) => ({
        id: event.id,
        source: event.source,
        occurredAt: event.occurredAt.toISOString(),
        gross: money(event.grossMinor, event.asset),
        spreddPay: money(event.spreddPayMinor, event.asset),
        partner: money(event.partnerMinor, event.asset),
        realized: event.realized,
      })),
    };
  });

  app.get<{ Params: PartnerParams }>("/partners/:partnerId/settlements", async (request) => {
    const { partnerId } = request.params;
    const { principal, tdb } = scope(request, partnerId);
    requirePermission(principal, "revenue:read");

    const settlements = await tdb.partnerSettlement.findMany({
      orderBy: { periodStart: "desc" },
    });

    return {
      data: settlements.map((settlement) => ({
        id: settlement.id,
        periodStart: settlement.periodStart.toISOString(),
        periodEnd: settlement.periodEnd.toISOString(),
        status: settlement.status,
        gross: money(settlement.grossMinor, settlement.asset),
        providerFee: money(settlement.providerFeeMinor, settlement.asset),
        spreddPay: money(settlement.spreddPayMinor, settlement.asset),
        partner: money(settlement.partnerMinor, settlement.asset),
        paidAt: settlement.paidAt ? settlement.paidAt.toISOString() : null,
      })),
    };
  });

  // --------------------------------------------------------------- team

  app.get<{ Params: PartnerParams }>("/partners/:partnerId/team", async (request) => {
    const { partnerId } = request.params;
    const { principal, tdb } = scope(request, partnerId);
    requirePermission(principal, "team:manage");

    const users = await tdb.partnerUser.findMany({
      include: { roles: true },
      orderBy: { createdAt: "asc" },
    });

    return {
      data: users.map((user) => ({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status,
        mfaEnabled: user.mfaEnabled,
        roles: user.roles.map((role) => role.role),
        lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      })),
    };
  });

  // -------------------------------------------------------------- audit

  app.get<{ Params: PartnerParams }>("/partners/:partnerId/audit", async (request) => {
    const { partnerId } = request.params;
    const { principal, tdb } = scope(request, partnerId);
    requirePermission(principal, "report:read");

    const query = paginationQuery.parse(request.query);
    const events = await tdb.auditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: query.limit,
    });
    return { data: events.map(toAuditDto) };
  });
}
