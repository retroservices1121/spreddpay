import { describe, expect, it } from "vitest";
import { MockRainService } from "./mock";
import { RainProviderError } from "./types";

const NOW = new Date("2026-01-15T09:00:00.000Z");

function service(options = {}) {
  return new MockRainService({ now: () => NOW, autoApproveKyc: true, ...options });
}

describe("MockRainService", () => {
  it("is deterministic — same input, same provider ids", async () => {
    const a = service();
    const b = service();

    const customerA = await a.createCustomer({
      externalId: "trader-1",
      email: "a@example.com",
      firstName: "Alex",
      lastName: "Morgan",
      countryCode: "US",
    });
    const customerB = await b.createCustomer({
      externalId: "trader-1",
      email: "a@example.com",
      firstName: "Alex",
      lastName: "Morgan",
      countryCode: "US",
    });

    expect(customerA.id).toBe(customerB.id);
  });

  it("refuses an account until KYC is approved", async () => {
    const rain = service({ autoApproveKyc: false });
    const customer = await rain.createCustomer({
      externalId: "trader-2",
      email: "b@example.com",
      firstName: "Sam",
      lastName: "Lee",
      countryCode: "US",
    });
    await rain.startKyc(customer.id);

    await expect(
      rain.createAccount({ customerId: customer.id, asset: "USDC", network: "base" }),
    ).rejects.toThrow(RainProviderError);
  });

  it("refuses a card until the account is active", async () => {
    const rain = service();
    await expect(
      rain.createVirtualCard({
        customerId: "nope",
        accountId: "nope",
        type: "VIRTUAL",
        cardLabel: "Card",
      }),
    ).rejects.toThrow(RainProviderError);
  });

  it("walks the full onboarding flow", async () => {
    const rain = service();
    const customer = await rain.createCustomer({
      externalId: "trader-3",
      email: "c@example.com",
      firstName: "Riley",
      lastName: "Chen",
      countryCode: "US",
    });
    await rain.startKyc(customer.id);
    expect((await rain.getKycStatus(customer.id)).status).toBe("APPROVED");

    const account = await rain.createAccount({
      customerId: customer.id,
      asset: "USDC",
      network: "base",
    });
    expect(account.status).toBe("ACTIVE");

    const card = await rain.createVirtualCard({
      customerId: customer.id,
      accountId: account.id,
      type: "VIRTUAL",
      cardLabel: "Demo Pay Card",
    });
    expect(card.status).toBe("ACTIVE");
    expect(card.last4).toMatch(/^\d{4}$/);
  });

  it("freezes and unfreezes, and refuses illegal transitions", async () => {
    const rain = service();
    const customer = await rain.createCustomer({
      externalId: "trader-4",
      email: "d@example.com",
      firstName: "Kai",
      lastName: "Ito",
      countryCode: "US",
    });
    await rain.startKyc(customer.id);
    const account = await rain.createAccount({ customerId: customer.id, asset: "USDC" });
    const card = await rain.createVirtualCard({
      customerId: customer.id,
      accountId: account.id,
      type: "VIRTUAL",
      cardLabel: "Card",
    });

    await rain.freezeCard(card.id);
    expect((await rain.getCard(card.id)).status).toBe("FROZEN");

    // Freezing twice is not a silent no-op; the provider says no.
    await expect(rain.freezeCard(card.id)).rejects.toThrow(RainProviderError);

    await rain.unfreezeCard(card.id);
    expect((await rain.getCard(card.id)).status).toBe("ACTIVE");
  });

  it("treats the idempotency key as the payout identity", async () => {
    const rain = service();
    const customer = await rain.createCustomer({
      externalId: "trader-5",
      email: "e@example.com",
      firstName: "Nia",
      lastName: "Bell",
      countryCode: "US",
    });
    await rain.startKyc(customer.id);
    const account = await rain.createAccount({ customerId: customer.id, asset: "USDC" });

    const input = {
      reference: "payout-1",
      customerId: customer.id,
      accountId: account.id,
      amountMinor: 4_850_000_000n,
      asset: "USDC",
      network: "base",
      idempotencyKey: "key-abc-123",
    };

    const first = await rain.createPayout(input);
    const replay = await rain.createPayout(input);
    expect(replay.id).toBe(first.id);
  });

  it("credits the destination account on settlement", async () => {
    const rain = service();
    const customer = await rain.createCustomer({
      externalId: "trader-6",
      email: "f@example.com",
      firstName: "Ola",
      lastName: "Diaz",
      countryCode: "US",
    });
    await rain.startKyc(customer.id);
    const account = await rain.createAccount({ customerId: customer.id, asset: "USDC" });

    const payout = await rain.createPayout({
      reference: "payout-2",
      customerId: customer.id,
      accountId: account.id,
      amountMinor: 4_850_000_000n,
      asset: "USDC",
      network: "base",
      idempotencyKey: "key-settle",
    });

    rain.settlePayout(payout.id, account.id);

    const [balance] = await rain.getBalances(account.id);
    expect(balance?.availableMinor).toBe(4_850_000_000n);
  });

  it("verifies its own webhook signature and rejects a forged one", async () => {
    const rain = service({ webhookSecret: "shhh" });
    const body = JSON.stringify({ id: "evt_1", type: "ping" });

    const valid = await rain.verifyWebhook({ "x-rain-signature": rain.signWebhook(body) }, body);
    expect(valid.valid).toBe(true);
    expect(valid.eventId).toBe("evt_1");

    const forged = await rain.verifyWebhook({ "x-rain-signature": "deadbeef" }, body);
    expect(forged.valid).toBe(false);
  });

  it("reports why a destination is not valid", async () => {
    const rain = service();
    const result = await rain.validatePayoutDestination("unknown-customer");
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain("no_provider_account");
  });
});
