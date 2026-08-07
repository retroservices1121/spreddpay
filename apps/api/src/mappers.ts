/**
 * Database rows to transport DTOs.
 *
 * The one job that matters here: every bigint becomes a decimal string before
 * it reaches JSON. A number would silently lose precision above 2^53, which for
 * USDC minor units is about 9 billion — reachable, and not a bug anyone wants
 * to find in a settlement report.
 */

import { formatMoney } from "@spreddpay/contracts";
import type {
  BalanceDto,
  CardControlDto,
  CardDto,
  MoneyDto,
  PartnerBrandingDto,
  PartnerDto,
  PayoutDto,
  SessionUserDto,
  TraderDto,
  TransactionDto,
  AuditEventDto,
} from "@spreddpay/contracts";
import type {
  AuditEvent,
  BalanceSnapshot,
  Card,
  CardControl,
  Partner,
  PartnerBranding,
  Payout,
  Trader,
  CardTransaction,
} from "@spreddpay/db";
import type { Principal } from "@spreddpay/auth";

export function money(amountMinor: bigint, asset: string): MoneyDto {
  return {
    amountMinor: amountMinor.toString(),
    asset,
    display: formatMoney(amountMinor, asset),
  };
}

export function toPartnerDto(partner: Partner): PartnerDto {
  return {
    id: partner.id,
    legalName: partner.legalName,
    displayName: partner.displayName,
    slug: partner.slug,
    status: partner.status,
    rainProgramId: partner.rainProgramId,
    defaultAsset: partner.defaultAsset,
    defaultNetwork: partner.defaultNetwork,
    supportEmail: partner.supportEmail,
    createdAt: partner.createdAt.toISOString(),
  };
}

export function toBrandingDto(branding: PartnerBranding): PartnerBrandingDto {
  return {
    partnerId: branding.partnerId,
    productName: branding.productName,
    logoUrl: branding.logoUrl,
    iconUrl: branding.iconUrl,
    primaryColor: branding.primaryColor,
    secondaryColor: branding.secondaryColor,
    cardBackground: branding.cardBackground,
    cardLabel: branding.cardLabel,
    poweredBySpreddPay: branding.poweredBySpreddPay,
  };
}

export function toTraderDto(trader: Trader): TraderDto {
  return {
    id: trader.id,
    partnerId: trader.partnerId,
    externalTraderId: trader.externalTraderId,
    email: trader.email,
    firstName: trader.firstName,
    lastName: trader.lastName,
    countryCode: trader.countryCode,
    status: trader.status,
    rainCustomerId: trader.rainCustomerId,
    createdAt: trader.createdAt.toISOString(),
  };
}

export function toBalanceDto(snapshot: BalanceSnapshot): BalanceDto {
  return {
    asset: snapshot.asset,
    network: snapshot.network,
    available: money(snapshot.availableMinor, snapshot.asset),
    pending: money(snapshot.pendingMinor, snapshot.asset),
    reserved: money(snapshot.reservedMinor, snapshot.asset),
    source: snapshot.source,
    asOf: snapshot.asOf.toISOString(),
  };
}

export function toCardDto(card: Card): CardDto {
  return {
    id: card.id,
    partnerId: card.partnerId,
    traderId: card.traderId,
    provider: "RAIN",
    providerCardId: card.providerCardId,
    type: card.type,
    last4: card.last4,
    brand: card.brand,
    expiryMonth: card.expiryMonth,
    expiryYear: card.expiryYear,
    status: card.status,
    cardLabel: card.cardLabel,
    createdAt: card.createdAt.toISOString(),
    activatedAt: card.activatedAt ? card.activatedAt.toISOString() : null,
  };
}

export function toCardControlDto(control: CardControl, asset: string): CardControlDto {
  return {
    cardId: control.cardId,
    spendLimit: control.spendLimitMinor === null ? null : money(control.spendLimitMinor, asset),
    spendLimitInterval: control.spendLimitInterval,
    allowedCategories: control.allowedCategories,
    blockedCategories: control.blockedCategories,
    allowedCountries: control.allowedCountries,
    onlineEnabled: control.onlineEnabled,
    contactlessEnabled: control.contactlessEnabled,
    atmEnabled: control.atmEnabled,
    updatedAt: control.updatedAt.toISOString(),
  };
}

type PayoutWithNames = Payout & {
  trader?: { firstName: string; lastName: string } | null;
  initiatedBy?: { firstName: string; lastName: string } | null;
  approvedBy?: { firstName: string; lastName: string } | null;
};

export function toPayoutDto(payout: PayoutWithNames): PayoutDto {
  const name = (person?: { firstName: string; lastName: string } | null) =>
    person ? `${person.firstName} ${person.lastName}` : null;

  return {
    id: payout.id,
    partnerId: payout.partnerId,
    traderId: payout.traderId,
    traderName: name(payout.trader) ?? payout.traderId,
    externalReference: payout.externalReference,
    amount: money(payout.amountMinor, payout.asset),
    network: payout.network,
    status: payout.status,
    operationMode: payout.operationMode,
    rainTransferId: payout.rainTransferId,
    blockchainTxHash: payout.blockchainTxHash,
    initiatedByUserId: payout.initiatedByUserId,
    initiatedByName: name(payout.initiatedBy),
    approvedByUserId: payout.approvedByUserId,
    approvedByName: name(payout.approvedBy),
    requiresDualApproval: payout.requiresDualApproval,
    failureCode: payout.failureCode,
    failureMessage: payout.failureMessage,
    createdAt: payout.createdAt.toISOString(),
    approvedAt: payout.approvedAt ? payout.approvedAt.toISOString() : null,
    completedAt: payout.completedAt ? payout.completedAt.toISOString() : null,
  };
}

export function toTransactionDto(transaction: CardTransaction): TransactionDto {
  return {
    id: transaction.id,
    partnerId: transaction.partnerId,
    traderId: transaction.traderId,
    cardId: transaction.cardId,
    providerTransactionId: transaction.providerTransactionId,
    kind: transaction.kind,
    status: transaction.status,
    amount: money(transaction.amountMinor, transaction.asset),
    merchantName: transaction.merchantName,
    merchantCategory: transaction.merchantCategory,
    merchantCountry: transaction.merchantCountry,
    occurredAt: transaction.occurredAt.toISOString(),
    postedAt: transaction.postedAt ? transaction.postedAt.toISOString() : null,
  };
}

export function toAuditDto(event: AuditEvent): AuditEventDto {
  return {
    id: event.id,
    partnerId: event.partnerId,
    actorType: event.actorType,
    actorId: event.actorId,
    actorLabel: event.actorLabel,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    summary: event.summary,
    ipAddress: event.ipAddress,
    createdAt: event.createdAt.toISOString(),
  };
}

export function toSessionUserDto(principal: Principal): SessionUserDto {
  return {
    id: principal.userId,
    email: principal.email,
    firstName: principal.firstName,
    lastName: principal.lastName,
    kind: principal.kind,
    partnerId: principal.partnerId,
    traderId: principal.traderId,
    partnerRoles: [...principal.partnerRoles],
    platformRoles: [...principal.platformRoles],
    permissions: [...principal.permissions],
    mfaEnabled: principal.mfaEnabled,
    mfaVerified: principal.mfaVerified,
  };
}
