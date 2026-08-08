/** Zod schemas for every mutating API surface, per TECHNICAL_README section 18. */

import { z } from "zod";
import { PARTNER_ROLES, TRANSACTION_KINDS, TRANSACTION_STATUSES, PAYOUT_STATUSES } from "./enums";

export const cuidLike = z.string().min(8).max(64);

/** A decimal amount as a string. Numbers are rejected — JSON floats lose cents. */
export const decimalAmount = z
  .string()
  .trim()
  .regex(/^\d{1,15}(\.\d{1,8})?$/, "Amount must be a positive decimal string, e.g. \"4850.00\".");

export const isoCountry = z
  .string()
  .length(2)
  .transform((value) => value.toUpperCase());

export const hexColor = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Expected a hex colour.");

export const paginationQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

// ------------------------------------------------------------------- auth

export const loginRequest = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ---------------------------------------------------------------- partners

export const createPartnerRequest = z.object({
  legalName: z.string().min(2).max(200),
  displayName: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Slug must be lowercase alphanumeric with hyphens."),
  supportEmail: z.string().email(),
  defaultAsset: z.string().default("USDC"),
  defaultNetwork: z.string().default("base"),
});

export const updateBrandingRequest = z.object({
  productName: z.string().min(1).max(80),
  logoUrl: z.string().url().nullable().optional(),
  iconUrl: z.string().url().nullable().optional(),
  primaryColor: hexColor,
  secondaryColor: hexColor,
  cardBackground: z.string().max(200).nullable().optional(),
  cardLabel: z.string().min(1).max(40),
  poweredBySpreddPay: z.boolean().default(true),
});

// ----------------------------------------------------------------- traders

export const inviteTraderRequest = z.object({
  externalTraderId: z.string().min(1).max(80),
  email: z.string().email(),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  countryCode: isoCountry,
});

export const listTradersQuery = paginationQuery.extend({
  status: z.string().optional(),
  search: z.string().max(120).optional(),
});

// ----------------------------------------------------------------- payouts

export const createPayoutRequest = z.object({
  traderId: cuidLike,
  /** Partner-side reference. Unique per partner — this is the duplicate guard. */
  externalReference: z.string().min(1).max(120),
  amount: decimalAmount,
  asset: z.string().default("USDC"),
  network: z.string().optional(),
  memo: z.string().max(280).optional(),
  /** Submit straight for approval instead of leaving a draft. */
  submitForApproval: z.boolean().default(true),
});

export const approvePayoutRequest = z.object({
  note: z.string().max(280).optional(),
});

export const rejectPayoutRequest = z.object({
  reason: z.string().min(1).max(280),
});

export const cancelPayoutRequest = z.object({
  reason: z.string().min(1).max(280),
});

export const listPayoutsQuery = paginationQuery.extend({
  status: z.enum(PAYOUT_STATUSES).optional(),
  traderId: cuidLike.optional(),
});

// ------------------------------------------------------------------- cards

export const issueCardRequest = z.object({
  traderId: cuidLike,
  type: z.enum(["VIRTUAL"]).default("VIRTUAL"),
});

export const updateCardControlsRequest = z.object({
  spendLimit: decimalAmount.nullable().optional(),
  spendLimitInterval: z
    .enum(["DAILY", "WEEKLY", "MONTHLY", "PER_TRANSACTION"])
    .nullable()
    .optional(),
  allowedCategories: z.array(z.string().max(40)).max(64).optional(),
  blockedCategories: z.array(z.string().max(40)).max(64).optional(),
  allowedCountries: z.array(isoCountry).max(64).optional(),
  onlineEnabled: z.boolean().optional(),
  contactlessEnabled: z.boolean().optional(),
  atmEnabled: z.boolean().optional(),
});

// ------------------------------------------------------------ transactions

export const listTransactionsQuery = paginationQuery.extend({
  traderId: cuidLike.optional(),
  cardId: cuidLike.optional(),
  kind: z.enum(TRANSACTION_KINDS).optional(),
  status: z.enum(TRANSACTION_STATUSES).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// -------------------------------------------------------------------- team

export const invitePartnerUserRequest = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  roles: z.array(z.enum(PARTNER_ROLES)).min(1).max(PARTNER_ROLES.length),
});

export const updatePartnerUserRolesRequest = z.object({
  roles: z.array(z.enum(PARTNER_ROLES)).min(1).max(PARTNER_ROLES.length),
});

export const setPartnerUserStatusRequest = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "DISABLED"]),
});

// ---------------------------------------------------------------- webhooks

export const createWebhookEndpointRequest = z.object({
  url: z.string().url(),
  events: z.array(z.string().min(3)).min(1),
  description: z.string().max(200).optional(),
});

// ------------------------------------------------------------------ traders (self)

export const startOnboardingRequest = z.object({
  acceptedTermsVersion: z.string().min(1).max(40),
});

export type LoginRequest = z.infer<typeof loginRequest>;
export type CreatePartnerRequest = z.infer<typeof createPartnerRequest>;
export type UpdateBrandingRequest = z.infer<typeof updateBrandingRequest>;
export type InviteTraderRequest = z.infer<typeof inviteTraderRequest>;
export type CreatePayoutRequest = z.infer<typeof createPayoutRequest>;
export type ApprovePayoutRequest = z.infer<typeof approvePayoutRequest>;
export type RejectPayoutRequest = z.infer<typeof rejectPayoutRequest>;
export type CancelPayoutRequest = z.infer<typeof cancelPayoutRequest>;
export type IssueCardRequest = z.infer<typeof issueCardRequest>;
export type UpdateCardControlsRequest = z.infer<typeof updateCardControlsRequest>;
export type InvitePartnerUserRequest = z.infer<typeof invitePartnerUserRequest>;
export type UpdatePartnerUserRolesRequest = z.infer<typeof updatePartnerUserRolesRequest>;
export type SetPartnerUserStatusRequest = z.infer<typeof setPartnerUserStatusRequest>;
export type ListPayoutsQuery = z.infer<typeof listPayoutsQuery>;
export type ListTradersQuery = z.infer<typeof listTradersQuery>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuery>;
