/**
 * Trader onboarding — the state machine in TECHNICAL_README section 9, driven
 * against the Rain adapter.
 *
 * Spredd Pay stores provider references and statuses. It does not store identity
 * documents: KYC runs in Rain's hosted flow and we keep the session reference
 * and the resulting status, nothing more.
 */

import {
  AppError,
  assertTraderTransition,
  type TraderStatus,
} from "@spreddpay/contracts";
import { recordAudit, type Database } from "@spreddpay/db";
import { requirePermission, type Principal } from "@spreddpay/auth";
import { queueNotification, queuePartnerWebhook, TEMPLATES } from "@spreddpay/notifications";
import type { RainService } from "@spreddpay/rain";

export interface OnboardingDeps {
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

/**
 * Move a trader to a new status, asserting the transition is legal and writing
 * the audit row in the same transaction.
 */
async function transition(
  db: Database,
  traderId: string,
  from: TraderStatus,
  to: TraderStatus,
  actor: { type: "SYSTEM" | "PARTNER_USER" | "TRADER" | "PLATFORM_USER"; id?: string; label?: string },
  summary: string,
) {
  assertTraderTransition(from, to);

  return db.$transaction(async (tx) => {
    const trader = await tx.trader.update({
      where: { id: traderId },
      data: {
        status: to,
        ...(to === "VIRTUAL_CARD_ACTIVE" ? { activatedAt: new Date() } : {}),
      },
    });

    await tx.traderIdentityStatus.create({
      data: { traderId, provider: "RAIN", status: to },
    });

    await recordAudit(tx, {
      partnerId: trader.partnerId,
      actor,
      action: "trader.status_changed",
      entityType: "Trader",
      entityId: traderId,
      summary,
      changes: { status: { from, to } },
    });

    return trader;
  });
}

export interface InviteTraderInput {
  partnerId: string;
  externalTraderId: string;
  email: string;
  firstName: string;
  lastName: string;
  countryCode: string;
}

export async function inviteTrader(
  deps: OnboardingDeps,
  actor: ActorContext,
  input: InviteTraderInput,
) {
  requirePermission(actor.principal, "trader:invite");

  const program = await deps.db.partnerProgram.findFirst({
    where: { partnerId: input.partnerId, provider: "RAIN", active: true },
  });

  // Fail closed: an unconfigured country list is not an open country list.
  if (!program || program.supportedCountries.length === 0) {
    throw new AppError(
      "TRADER_NOT_ELIGIBLE",
      "No supported countries are configured for this partner's program. Configure eligibility before inviting traders.",
    );
  }
  const country = input.countryCode.toUpperCase();
  if (!program.supportedCountries.includes(country)) {
    throw new AppError(
      "TRADER_NOT_ELIGIBLE",
      `${country} is not in this partner's supported countries.`,
    );
  }

  const existing = await deps.db.trader.findFirst({
    where: { partnerId: input.partnerId, externalTraderId: input.externalTraderId },
    select: { id: true },
  });
  if (existing) {
    throw AppError.conflict(
      `A trader with external id "${input.externalTraderId}" already exists for this partner.`,
    );
  }

  const partner = await deps.db.partner.findUnique({
    where: { id: input.partnerId },
    include: { branding: true },
  });
  if (!partner) throw AppError.notFound("Partner not found.");

  return deps.db.$transaction(async (tx) => {
    const trader = await tx.trader.create({
      data: {
        partnerId: input.partnerId,
        externalTraderId: input.externalTraderId,
        email: input.email.toLowerCase(),
        firstName: input.firstName,
        lastName: input.lastName,
        countryCode: country,
        status: "INVITED",
      },
    });

    await recordAudit(tx, {
      partnerId: input.partnerId,
      actor: auditActor(actor),
      action: "trader.invited",
      entityType: "Trader",
      entityId: trader.id,
      summary: `Invited ${input.firstName} ${input.lastName} (${input.externalTraderId})`,
      changes: { email: input.email, countryCode: country },
    });

    const template = TEMPLATES.traderInvited({
      productName: partner.branding?.productName ?? partner.displayName,
      firstName: input.firstName,
      url: `${process.env.APP_URL ?? "http://localhost:3001"}/onboarding?t=${trader.id}`,
    });
    await queueNotification(tx, {
      partnerId: input.partnerId,
      traderId: trader.id,
      channel: "EMAIL",
      ...template,
    });

    await queuePartnerWebhook(tx, {
      partnerId: input.partnerId,
      eventType: "trader.created",
      payload: { traderId: trader.id, externalTraderId: input.externalTraderId },
    });

    return trader;
  });
}

/**
 * Advance a trader one step along the happy path.
 *
 * Each call performs exactly one provider interaction and one state change, so
 * the onboarding UI can drive it as a sequence of visible steps and a failure
 * never leaves the record ambiguous about which step failed.
 */
export async function advanceOnboarding(
  deps: OnboardingDeps,
  input: { traderId: string; acceptedTermsVersion?: string },
  actorType: "SYSTEM" | "TRADER" | "PARTNER_USER" = "SYSTEM",
) {
  const trader = await deps.db.trader.findUnique({
    where: { id: input.traderId },
    include: { partner: { include: { branding: true, programs: true } } },
  });
  if (!trader) throw AppError.notFound("Trader not found.");

  const actor = { type: actorType, id: trader.id, label: `${trader.firstName} ${trader.lastName}` };
  const program = trader.partner.programs.find((p) => p.provider === "RAIN" && p.active);

  switch (trader.status) {
    case "INVITED":
      return transition(
        deps.db,
        trader.id,
        "INVITED",
        "ACCOUNT_CREATED",
        actor,
        "Trader account created",
      );

    case "ACCOUNT_CREATED":
      return transition(
        deps.db,
        trader.id,
        "ACCOUNT_CREATED",
        "TERMS_PENDING",
        actor,
        "Awaiting terms acceptance",
      );

    case "TERMS_PENDING": {
      if (!input.acceptedTermsVersion) {
        throw AppError.badRequest("acceptedTermsVersion is required to accept terms.");
      }
      // Record the accepted version and time, per the product rules.
      await deps.db.trader.update({
        where: { id: trader.id },
        data: {
          acceptedTermsVersion: input.acceptedTermsVersion,
          acceptedTermsAt: new Date(),
        },
      });

      const customer = await deps.rain.createCustomer({
        externalId: trader.id,
        email: trader.email,
        firstName: trader.firstName,
        lastName: trader.lastName,
        countryCode: trader.countryCode,
        programId: program?.providerProgramId ?? null,
      });

      await deps.db.$transaction(async (tx) => {
        await tx.trader.update({
          where: { id: trader.id },
          data: { rainCustomerId: customer.id },
        });
        await tx.providerCustomer.upsert({
          where: { provider_providerCustomerId: { provider: "RAIN", providerCustomerId: customer.id } },
          create: {
            partnerId: trader.partnerId,
            traderId: trader.id,
            provider: "RAIN",
            providerCustomerId: customer.id,
            status: customer.status,
          },
          update: { status: customer.status },
        });
      });

      await deps.rain.startKyc(customer.id);

      const updated = await transition(
        deps.db,
        trader.id,
        "TERMS_PENDING",
        "KYC_PENDING",
        actor,
        "Identity verification started",
      );

      await deps.db.$transaction(async (tx) => {
        await queuePartnerWebhook(tx, {
          partnerId: trader.partnerId,
          eventType: "trader.kyc_pending",
          payload: { traderId: trader.id },
        });
      });

      return updated;
    }

    case "KYC_PENDING":
    case "KYC_REVIEW": {
      if (!trader.rainCustomerId) {
        throw AppError.conflict("Trader has no provider customer record.");
      }
      const kyc = await deps.rain.getKycStatus(trader.rainCustomerId);

      const next: TraderStatus =
        kyc.status === "APPROVED"
          ? "KYC_APPROVED"
          : kyc.status === "REJECTED"
            ? "KYC_REJECTED"
            : kyc.status === "IN_REVIEW"
              ? "KYC_REVIEW"
              : trader.status;

      if (next === trader.status) return trader;

      const updated = await transition(
        deps.db,
        trader.id,
        trader.status,
        next,
        actor,
        `Provider reported identity verification ${kyc.status}`,
      );

      await deps.db.$transaction(async (tx) => {
        await queuePartnerWebhook(tx, {
          partnerId: trader.partnerId,
          eventType: next === "KYC_APPROVED" ? "trader.kyc_approved" : "trader.kyc_rejected",
          payload: { traderId: trader.id, status: kyc.status },
        });
      });

      return updated;
    }

    case "KYC_APPROVED":
      return transition(
        deps.db,
        trader.id,
        "KYC_APPROVED",
        "PROVIDER_ACCOUNT_PENDING",
        actor,
        "Requesting provider account",
      );

    case "PROVIDER_ACCOUNT_PENDING": {
      if (!trader.rainCustomerId) {
        throw AppError.conflict("Trader has no provider customer record.");
      }
      const account = await deps.rain.createAccount({
        customerId: trader.rainCustomerId,
        asset: trader.partner.defaultAsset,
        network: trader.partner.defaultNetwork,
        programId: program?.providerProgramId ?? null,
      });

      await deps.db.financialAccount.upsert({
        where: {
          provider_providerAccountId: { provider: "RAIN", providerAccountId: account.id },
        },
        create: {
          partnerId: trader.partnerId,
          traderId: trader.id,
          provider: "RAIN",
          providerAccountId: account.id,
          asset: account.asset,
          network: account.network,
          status: account.status,
          depositAddress: account.depositAddress,
        },
        update: { status: account.status, depositAddress: account.depositAddress },
      });

      const updated = await transition(
        deps.db,
        trader.id,
        "PROVIDER_ACCOUNT_PENDING",
        "PROVIDER_ACCOUNT_ACTIVE",
        actor,
        "provider account active",
      );

      await deps.db.$transaction(async (tx) => {
        await queuePartnerWebhook(tx, {
          partnerId: trader.partnerId,
          eventType: "account.active",
          payload: { traderId: trader.id, providerAccountId: account.id },
        });
      });

      return updated;
    }

    case "PROVIDER_ACCOUNT_ACTIVE":
      return transition(
        deps.db,
        trader.id,
        "PROVIDER_ACCOUNT_ACTIVE",
        "CARD_ELIGIBLE",
        actor,
        "Eligible for a virtual card",
      );

    default:
      // Terminal or awaiting an external event; nothing to advance.
      return trader;
  }
}

/** Run the onboarding machine until it stops moving. Used by the demo seed. */
export async function runOnboardingToCardEligible(deps: OnboardingDeps, traderId: string) {
  let previous = "";
  for (let step = 0; step < 12; step += 1) {
    const trader = await advanceOnboarding(
      deps,
      { traderId, acceptedTermsVersion: "2026-01-terms-v1" },
      "SYSTEM",
    );
    if (trader.status === previous) break;
    previous = trader.status;
    if (trader.status === "CARD_ELIGIBLE" || trader.status === "VIRTUAL_CARD_ACTIVE") break;
  }
  return deps.db.trader.findUnique({ where: { id: traderId } });
}
