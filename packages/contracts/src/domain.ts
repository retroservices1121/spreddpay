/**
 * Transport-shaped domain objects. These are what crosses the API boundary:
 * bigint money is serialised as a decimal string so JSON never truncates it,
 * and dates are ISO strings.
 */

import type {
  BalanceSource,
  CardStatus,
  CardType,
  OperationMode,
  PartnerRoleName,
  PartnerStatus,
  PayoutStatus,
  PlatformRoleName,
  TraderStatus,
  TransactionKind,
  TransactionStatus,
} from "./enums";

/** A money value on the wire: exact minor units plus a rendered form. */
export interface MoneyDto {
  /** Integer minor units, as a string. Parse with BigInt(), never Number(). */
  amountMinor: string;
  asset: string;
  /** Presentational only, e.g. "4,850.00 USDC". */
  display: string;
}

export interface PartnerDto {
  id: string;
  legalName: string;
  displayName: string;
  slug: string;
  status: PartnerStatus;
  rainProgramId: string | null;
  defaultAsset: string;
  defaultNetwork: string;
  supportEmail: string;
  createdAt: string;
}

export interface PartnerBrandingDto {
  partnerId: string;
  productName: string;
  logoUrl: string | null;
  iconUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  cardBackground: string | null;
  cardLabel: string;
  poweredBySpreddPay: boolean;
}

export interface TraderDto {
  id: string;
  partnerId: string;
  externalTraderId: string;
  email: string;
  firstName: string;
  lastName: string;
  countryCode: string;
  status: TraderStatus;
  rainCustomerId: string | null;
  createdAt: string;
}

export interface BalanceDto {
  asset: string;
  network: string | null;
  available: MoneyDto;
  pending: MoneyDto;
  reserved: MoneyDto;
  source: BalanceSource;
  asOf: string;
}

export interface CardDto {
  id: string;
  partnerId: string;
  traderId: string;
  provider: "RAIN";
  providerCardId: string;
  type: CardType;
  last4: string | null;
  brand: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  status: CardStatus;
  cardLabel: string;
  createdAt: string;
  activatedAt: string | null;
}

export interface CardControlDto {
  cardId: string;
  spendLimit: MoneyDto | null;
  spendLimitInterval: "DAILY" | "WEEKLY" | "MONTHLY" | "PER_TRANSACTION" | null;
  allowedCategories: string[];
  blockedCategories: string[];
  allowedCountries: string[];
  onlineEnabled: boolean;
  contactlessEnabled: boolean;
  atmEnabled: boolean;
  updatedAt: string;
}

export interface PayoutDto {
  id: string;
  partnerId: string;
  traderId: string;
  traderName: string;
  externalReference: string;
  amount: MoneyDto;
  network: string;
  status: PayoutStatus;
  operationMode: OperationMode;
  rainTransferId: string | null;
  blockchainTxHash: string | null;
  initiatedByUserId: string;
  initiatedByName: string | null;
  approvedByUserId: string | null;
  approvedByName: string | null;
  requiresDualApproval: boolean;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  approvedAt: string | null;
  completedAt: string | null;
}

export interface TransactionDto {
  id: string;
  partnerId: string;
  traderId: string;
  cardId: string | null;
  providerTransactionId: string;
  kind: TransactionKind;
  status: TransactionStatus;
  amount: MoneyDto;
  merchantName: string | null;
  merchantCategory: string | null;
  merchantCountry: string | null;
  occurredAt: string;
  postedAt: string | null;
}

export interface SessionUserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  kind: "PARTNER_USER" | "PLATFORM_USER" | "TRADER";
  partnerId: string | null;
  traderId: string | null;
  partnerRoles: PartnerRoleName[];
  platformRoles: PlatformRoleName[];
  permissions: string[];
  mfaEnabled: boolean;
  mfaVerified: boolean;
}

export interface PartnerDashboardDto {
  activeTraders: number;
  pendingKyc: number;
  activeCards: number;
  payouts: {
    pending: number;
    completed: number;
    failed: number;
  };
  monthlyPayoutVolume: MoneyDto;
  monthlyCardSpend: MoneyDto;
  averageSpendPerActiveCard: MoneyDto;
  /** Share of invited traders that reached VIRTUAL_CARD_ACTIVE, in basis points. */
  activationRateBps: number;
  operationsRequiringAttention: number;
}

export interface AuditEventDto {
  id: string;
  partnerId: string | null;
  actorType: string;
  actorId: string | null;
  actorLabel: string | null;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  ipAddress: string | null;
  createdAt: string;
}

export interface Paginated<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}
