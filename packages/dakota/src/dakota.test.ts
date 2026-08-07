import { describe, expect, it } from "vitest";
import { toMinorUnits } from "./client";
import { MockDakotaService } from "./mock";
import { createDakotaService, DakotaError } from "./index";

const NOW = new Date("2026-01-15T09:00:00.000Z");
const svc = (options = {}) => new MockDakotaService({ now: () => NOW, ...options });

describe("toMinorUnits", () => {
  it("shifts the decimal textually, never through a float", () => {
    expect(toMinorUnits("4850.00", 6)).toBe(4_850_000_000n);
    expect(toMinorUnits("0.000001", 6)).toBe(1n);
    // Number("0.1") * 1e6 is 100000.00000000001; this must not be.
    expect(toMinorUnits("0.1", 6)).toBe(100_000n);
    expect(toMinorUnits("0.3", 6)).toBe(toMinorUnits("0.1", 6) + toMinorUnits("0.2", 6));
  });

  it("keeps precision past Number.MAX_SAFE_INTEGER", () => {
    expect(toMinorUnits("99999999999.999999", 6)).toBe(99_999_999_999_999_999n);
  });

  it("handles negatives and bare integers", () => {
    expect(toMinorUnits("-12.5", 6)).toBe(-12_500_000n);
    expect(toMinorUnits("7", 6)).toBe(7_000_000n);
  });

  it("refuses to silently truncate excess precision", () => {
    expect(() => toMinorUnits("1.0000001", 6)).toThrow(/decimal places/);
  });
});

describe("MockDakotaService — onboarding", () => {
  it("is deterministic for the same external id", async () => {
    const a = await svc().createCustomer({ name: "Demo", customerType: "business", externalId: "p1" });
    const b = await svc().createCustomer({ name: "Demo", customerType: "business", externalId: "p1" });
    expect(a.id).toBe(b.id);
  });

  it("returns a hosted application url rather than collecting documents", async () => {
    const customer = await svc({ autoApproveKyb: false }).createCustomer({
      name: "Demo Trading Firm",
      customerType: "business",
      externalId: "partner-1",
    });
    expect(customer.applicationUrl).toContain("/apply/");
    expect(customer.kybStatus).toBe("pending");
  });

  it("never reports an unknown customer as approved", async () => {
    const service = svc({ autoApproveKyb: false });
    const customer = await service.createCustomer({
      name: "X",
      customerType: "business",
      externalId: "x",
    });
    expect(customer.kybStatus).not.toBe("active");
    service.setKybStatus(customer.id, "active");
    expect((await service.getCustomer(customer.id)).kybStatus).toBe("active");
  });
});

describe("MockDakotaService — wallets", () => {
  it("refuses a wallet with no governance, as Dakota does", async () => {
    await expect(
      svc().createWallet({ name: "w", family: "evm", signerGroups: [], policies: [] }),
    ).rejects.toThrow(DakotaError);
  });

  it("creates a wallet with an address once governed", async () => {
    const wallet = await svc().createWallet({
      name: "partner-treasury",
      family: "evm",
      signerGroups: ["sg_1"],
      policies: ["pol_1"],
    });
    expect(wallet.address).toMatch(/^0x[0-9a-f]{40}$/);
  });

  it("refuses an unsigned transaction", async () => {
    const service = svc();
    const wallet = await service.createWallet({
      name: "w",
      family: "evm",
      signerGroups: ["sg"],
      policies: ["p"],
    });
    await expect(
      service.submitWalletTransaction({
        walletId: wallet.id,
        signatures: [],
        intent: {
          walletId: wallet.id,
          caip2: "eip155:8453",
          operation: { kind: "transfer", from: wallet.address!, to: "0xabc", amount: "1", assetId: "USDC" },
          idempotencyKey: "k1",
        },
      }),
    ).rejects.toThrow(/signed/);
  });

  it("refuses a transfer larger than the balance", async () => {
    const service = svc();
    const wallet = await service.createWallet({
      name: "w2",
      family: "evm",
      signerGroups: ["sg"],
      policies: ["p"],
    });
    service.credit(wallet.id, 1_000_000n);

    // Assert on the machine-readable code, not the prose.
    await expect(
      service.submitWalletTransaction({
        walletId: wallet.id,
        signatures: ["sig"],
        intent: {
          walletId: wallet.id,
          caip2: "eip155:8453",
          operation: { kind: "transfer", from: wallet.address!, to: "0xabc", amount: "9000000", assetId: "USDC" },
          idempotencyKey: "k2",
        },
      }),
    ).rejects.toMatchObject({ code: "insufficient_balance" });
  });

  it("treats the idempotency key as the transaction identity", async () => {
    const service = svc();
    const wallet = await service.createWallet({
      name: "w3",
      family: "evm",
      signerGroups: ["sg"],
      policies: ["p"],
    });
    service.credit(wallet.id, 10_000_000n);

    const intent = {
      walletId: wallet.id,
      caip2: "eip155:8453",
      operation: { kind: "transfer" as const, from: wallet.address!, to: "0xabc", amount: "4850000000".slice(0, 7), assetId: "USDC" },
      idempotencyKey: "same-key",
    };
    const first = await service.submitWalletTransaction({ walletId: wallet.id, signatures: ["s"], intent });
    const replay = await service.submitWalletTransaction({ walletId: wallet.id, signatures: ["s"], intent });

    expect(replay.id).toBe(first.id);
    // The balance moved once, not twice.
    const [balance] = await service.getWalletBalances(wallet.id);
    expect(balance?.amountMinor).toBe(10_000_000n - BigInt(intent.operation.amount));
  });
});

describe("webhooks", () => {
  it("throws rather than reporting an unverified event as authentic", async () => {
    await expect(svc().verifyWebhook()).rejects.toThrow(/not implemented/i);
  });
});

describe("createDakotaService", () => {
  it("refuses production", () => {
    expect(() => createDakotaService({ mode: "production" })).toThrow(/disabled/);
  });

  it("requires an api key for sandbox", () => {
    expect(() => createDakotaService({ mode: "sandbox" })).toThrow(/DAKOTA_API_KEY/);
  });

  it("returns the mock for mock mode", () => {
    expect(createDakotaService({ mode: "mock" }).mode).toBe("mock");
  });
});
