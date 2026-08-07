/**
 * Demo seed, per TECHNICAL_README section 29.
 *
 *   Partner:      Demo Trading Firm
 *   Product:      Demo Pay
 *   Trader:       Alex Morgan  (TRADER-28491)
 *   KYC:          Approved
 *   Rain account: Active
 *   Virtual card: Active
 *   Payout:       4,850 USDC, Draft
 *   Transaction:  Online Purchase, $84.23, Pending
 *
 * Everything is deterministic: provider ids come from MockRainService's stable
 * hashes and the clock is pinned, so `pnpm demo:reset` produces byte-identical
 * ids every time. Reruns are idempotent — the seed upserts rather than
 * duplicating, so it is safe to run against an existing demo database.
 */

import { hashPassword } from "@spreddpay/auth";
import { parseAmountToMinor } from "@spreddpay/contracts";
import { MockRainService } from "@spreddpay/rain";
import { recordAudit, type Database } from "@spreddpay/db";

/** Shared password for every demo account. Development only. */
export const DEMO_PASSWORD = "SpreddPayDemo123!";

/** Pinned clock so seeded timestamps and derived expiry dates never drift. */
const DEMO_EPOCH = new Date("2026-01-15T09:00:00.000Z");

export interface DemoSeedResult {
  partnerId: string;
  traderId: string;
  cardId: string;
  payoutId: string;
  transactionId: string;
  logins: { role: string; email: string; password: string; portal: string }[];
}

export async function seedDemo(db: Database): Promise<DemoSeedResult> {
  const rain = new MockRainService({ now: () => DEMO_EPOCH, autoApproveKyc: true });
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  // ------------------------------------------------------------- partner

  const partner = await db.partner.upsert({
    where: { slug: "demo-trading-firm" },
    create: {
      legalName: "Demo Trading Firm Ltd",
      displayName: "Demo Trading Firm",
      slug: "demo-trading-firm",
      status: "ACTIVE",
      defaultAsset: "USDC",
      defaultNetwork: "base",
      supportEmail: "support@demotradingfirm.example",
      createdAt: DEMO_EPOCH,
    },
    update: { status: "ACTIVE" },
  });

  await db.partnerBranding.upsert({
    where: { partnerId: partner.id },
    create: {
      partnerId: partner.id,
      productName: "Demo Pay",
      primaryColor: "#0F172A",
      secondaryColor: "#2563EB",
      cardLabel: "Demo Pay Card",
      poweredBySpreddPay: true,
    },
    update: { productName: "Demo Pay", cardLabel: "Demo Pay Card" },
  });

  await db.partnerProgram.upsert({
    where: { partnerId_provider: { partnerId: partner.id, provider: "RAIN" } },
    create: {
      partnerId: partner.id,
      provider: "RAIN",
      asset: "USDC",
      network: "base",
      // Eligibility is explicit; an empty list means "not configured" and the
      // onboarding service refuses to invite anyone.
      supportedCountries: ["US", "GB", "CA", "AU", "DE", "NL", "SG", "AE"],
      dualApprovalThresholdMinor: parseAmountToMinor("1000", "USDC"),
      partnerDailyLimitMinor: parseAmountToMinor("250000", "USDC"),
      singlePayoutMaxMinor: parseAmountToMinor("50000", "USDC"),
      minPayoutMinor: parseAmountToMinor("1", "USDC"),
      active: true,
    },
    update: { active: true },
  });

  // --------------------------------------------------------------- users

  const platformUser = await db.platformUser.upsert({
    where: { email: "ops@spreddpay.com" },
    create: {
      email: "ops@spreddpay.com",
      firstName: "Sam",
      lastName: "Okoye",
      passwordHash,
      status: "ACTIVE",
      mfaEnabled: false,
    },
    update: { passwordHash, status: "ACTIVE" },
  });
  await db.platformRole.upsert({
    where: { platformUserId_role: { platformUserId: platformUser.id, role: "SUPER_ADMIN" } },
    create: { platformUserId: platformUser.id, role: "SUPER_ADMIN" },
    update: {},
  });

  async function partnerUser(
    email: string,
    firstName: string,
    lastName: string,
    roles: ("PARTNER_OWNER" | "PAYOUT_CREATOR" | "PAYOUT_APPROVER")[],
  ) {
    const user = await db.partnerUser.upsert({
      where: { partnerId_email: { partnerId: partner.id, email } },
      create: {
        partnerId: partner.id,
        email,
        firstName,
        lastName,
        passwordHash,
        status: "ACTIVE",
        mfaEnabled: false,
      },
      update: { passwordHash, status: "ACTIVE" },
    });
    for (const role of roles) {
      await db.partnerRole.upsert({
        where: { partnerUserId_role: { partnerUserId: user.id, role } },
        create: { partnerUserId: user.id, role },
        update: {},
      });
    }
    return user;
  }

  const owner = await partnerUser("owner@demotradingfirm.example", "Riley", "Chen", [
    "PARTNER_OWNER",
  ]);
  const creator = await partnerUser("creator@demotradingfirm.example", "Jordan", "Blake", [
    "PAYOUT_CREATOR",
  ]);
  await partnerUser("approver@demotradingfirm.example", "Priya", "Raman", ["PAYOUT_APPROVER"]);

  // -------------------------------------------------------------- trader

  const trader = await db.trader.upsert({
    where: {
      partnerId_externalTraderId: { partnerId: partner.id, externalTraderId: "TRADER-28491" },
    },
    create: {
      partnerId: partner.id,
      externalTraderId: "TRADER-28491",
      email: "alex.morgan@example.com",
      firstName: "Alex",
      lastName: "Morgan",
      countryCode: "US",
      status: "INVITED",
      passwordHash,
      invitedAt: DEMO_EPOCH,
      createdAt: DEMO_EPOCH,
    },
    update: { passwordHash },
  });

  // Walk the provider flow so the stored references are ones the mock will
  // recognise after rehydration.
  const customer = await rain.createCustomer({
    externalId: trader.id,
    email: trader.email,
    firstName: trader.firstName,
    lastName: trader.lastName,
    countryCode: trader.countryCode,
  });
  await rain.startKyc(customer.id);

  const account = await rain.createAccount({
    customerId: customer.id,
    asset: "USDC",
    network: "base",
  });

  const card = await rain.createVirtualCard({
    customerId: customer.id,
    accountId: account.id,
    type: "VIRTUAL",
    cardLabel: "Demo Pay Card",
  });

  await db.trader.update({
    where: { id: trader.id },
    data: {
      rainCustomerId: customer.id,
      status: "VIRTUAL_CARD_ACTIVE",
      acceptedTermsVersion: "2026-01-terms-v1",
      acceptedTermsAt: DEMO_EPOCH,
      activatedAt: DEMO_EPOCH,
    },
  });

  await db.providerCustomer.upsert({
    where: { provider_providerCustomerId: { provider: "RAIN", providerCustomerId: customer.id } },
    create: {
      partnerId: partner.id,
      traderId: trader.id,
      provider: "RAIN",
      providerCustomerId: customer.id,
      status: "ACTIVE",
    },
    update: { status: "ACTIVE" },
  });

  for (const status of ["KYC_PENDING", "KYC_APPROVED", "RAIN_ACCOUNT_ACTIVE"] as const) {
    const existing = await db.traderIdentityStatus.findFirst({
      where: { traderId: trader.id, status },
    });
    if (!existing) {
      await db.traderIdentityStatus.create({
        data: { traderId: trader.id, provider: "RAIN", status, reportedAt: DEMO_EPOCH },
      });
    }
  }

  const financialAccount = await db.financialAccount.upsert({
    where: { provider_providerAccountId: { provider: "RAIN", providerAccountId: account.id } },
    create: {
      partnerId: partner.id,
      traderId: trader.id,
      provider: "RAIN",
      providerAccountId: account.id,
      asset: "USDC",
      network: "base",
      status: "ACTIVE",
      depositAddress: account.depositAddress,
      createdAt: DEMO_EPOCH,
    },
    update: { status: "ACTIVE" },
  });

  const existingSnapshot = await db.balanceSnapshot.findFirst({
    where: { financialAccountId: financialAccount.id },
  });
  if (!existingSnapshot) {
    await db.balanceSnapshot.create({
      data: {
        financialAccountId: financialAccount.id,
        partnerId: partner.id,
        traderId: trader.id,
        asset: "USDC",
        network: "base",
        availableMinor: 0n,
        pendingMinor: 0n,
        reservedMinor: 0n,
        source: "RAIN",
        asOf: DEMO_EPOCH,
      },
    });
  }

  const dbCard = await db.card.upsert({
    where: { provider_providerCardId: { provider: "RAIN", providerCardId: card.id } },
    create: {
      partnerId: partner.id,
      traderId: trader.id,
      provider: "RAIN",
      providerCardId: card.id,
      type: "VIRTUAL",
      last4: card.last4,
      brand: card.brand,
      expiryMonth: card.expiryMonth,
      expiryYear: card.expiryYear,
      status: "ACTIVE",
      cardLabel: "Demo Pay Card",
      createdAt: DEMO_EPOCH,
      activatedAt: DEMO_EPOCH,
    },
    update: { status: "ACTIVE" },
  });

  await db.cardControl.upsert({
    where: { cardId: dbCard.id },
    create: {
      cardId: dbCard.id,
      partnerId: partner.id,
      onlineEnabled: true,
      contactlessEnabled: true,
      atmEnabled: false,
      providerSynced: false,
    },
    update: {},
  });

  // -------------------------------------------------------------- payout

  const existingPayout = await db.payout.findFirst({
    where: { partnerId: partner.id, externalReference: "PO-2026-0001" },
  });

  const payout =
    existingPayout ??
    (await db.payout.create({
      data: {
        partnerId: partner.id,
        traderId: trader.id,
        externalReference: "PO-2026-0001",
        amountMinor: parseAmountToMinor("4850", "USDC"),
        asset: "USDC",
        network: "base",
        status: "DRAFT",
        memo: "January performance payout",
        // 4,850 is above the 1,000 dual-approval threshold, so the demo shows a
        // second approver being required.
        requiresDualApproval: true,
        initiatedByUserId: creator.id,
        createdAt: DEMO_EPOCH,
      },
    }));

  // --------------------------------------------------------- transaction

  const seededTransaction = rain.seedTransaction({
    cardId: card.id,
    customerId: customer.id,
    seed: "demo-online-purchase",
    amountMinor: parseAmountToMinor("84.23", "USD"),
    asset: "USD",
    kind: "AUTHORIZATION",
    status: "PENDING",
    occurredAt: DEMO_EPOCH,
  });

  const transaction = await db.cardTransaction.upsert({
    where: {
      provider_providerTransactionId: {
        provider: "RAIN",
        providerTransactionId: seededTransaction.id,
      },
    },
    create: {
      partnerId: partner.id,
      traderId: trader.id,
      cardId: dbCard.id,
      provider: "RAIN",
      providerTransactionId: seededTransaction.id,
      kind: "AUTHORIZATION",
      status: "PENDING",
      amountMinor: seededTransaction.amountMinor,
      asset: "USD",
      merchantName: "Online Purchase",
      merchantCategory: seededTransaction.merchantCategory,
      merchantCountry: "US",
      merchantId: seededTransaction.merchantId,
      occurredAt: DEMO_EPOCH,
    },
    update: { status: "PENDING" },
  });

  // ------------------------------------------------------- feature flags

  for (const [key, enabled, description] of [
    ["blend_yield_enabled", false, "Phase 2 Blend Earn account. Off until Blend is integrated."],
    ["card_detail_reveal", false, "Reveal full card details via a Rain-approved secure method."],
    ["physical_cards", false, "Physical card issuance."],
    ["digital_wallet_provisioning", false, "Apple Pay / Google Pay provisioning."],
  ] as const) {
    await db.featureFlag.upsert({
      where: { partnerId_key: { partnerId: partner.id, key } },
      create: { partnerId: partner.id, key, enabled, description },
      update: { description },
    });
  }

  // -------------------------------------------------------------- audit

  await db.$transaction(async (tx) => {
    await recordAudit(tx, {
      partnerId: partner.id,
      actor: { type: "SYSTEM", label: "demo-seed" },
      action: "demo.seeded",
      entityType: "Partner",
      entityId: partner.id,
      summary: "Demo data seeded for Demo Trading Firm",
      changes: { traderId: trader.id, payoutId: payout.id, cardId: dbCard.id },
    });
  });

  return {
    partnerId: partner.id,
    traderId: trader.id,
    cardId: dbCard.id,
    payoutId: payout.id,
    transactionId: transaction.id,
    logins: [
      {
        role: "SpreddPay operator (SUPER_ADMIN)",
        email: "ops@spreddpay.com",
        password: DEMO_PASSWORD,
        portal: "admin",
      },
      {
        role: "Partner owner",
        email: owner.email,
        password: DEMO_PASSWORD,
        portal: "partner",
      },
      {
        role: "Payout creator",
        email: creator.email,
        password: DEMO_PASSWORD,
        portal: "partner",
      },
      {
        role: "Payout approver",
        email: "approver@demotradingfirm.example",
        password: DEMO_PASSWORD,
        portal: "partner",
      },
      {
        role: "Trader (Alex Morgan)",
        email: trader.email,
        password: DEMO_PASSWORD,
        portal: "web",
      },
    ],
  };
}
