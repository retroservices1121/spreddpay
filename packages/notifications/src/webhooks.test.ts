import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  nextRetryDelayMs,
  signPartnerWebhook,
  verifyPartnerWebhookSignature,
} from "./index";

describe("partner webhook signatures", () => {
  const secret = "whsec_test_partner_secret";
  const body = JSON.stringify({ id: "d1", type: "payout.completed" });

  it("verifies a signature it produced", () => {
    const { signature, timestamp } = signPartnerWebhook(secret, body);
    expect(verifyPartnerWebhookSignature(secret, body, timestamp, signature)).toBe(true);
  });

  it("rejects a signature made with a different secret", () => {
    const { signature, timestamp } = signPartnerWebhook("other_secret", body);
    expect(verifyPartnerWebhookSignature(secret, body, timestamp, signature)).toBe(false);
  });

  it("rejects a modified body", () => {
    const { signature, timestamp } = signPartnerWebhook(secret, body);
    const tampered = JSON.stringify({ id: "d1", type: "payout.failed" });
    expect(verifyPartnerWebhookSignature(secret, tampered, timestamp, signature)).toBe(false);
  });

  it("binds the signature to the timestamp, so a replay at another time fails", () => {
    const { signature, timestamp } = signPartnerWebhook(secret, body);
    expect(verifyPartnerWebhookSignature(secret, body, timestamp + 1, signature)).toBe(false);
  });

  it("rejects a signature older than the tolerance window", () => {
    const stale = Math.floor(Date.now() / 1000) - 600;
    const { signature } = signPartnerWebhook(secret, body, stale);
    expect(verifyPartnerWebhookSignature(secret, body, stale, signature)).toBe(false);
    // …but accepts it if the caller widens the window deliberately.
    expect(verifyPartnerWebhookSignature(secret, body, stale, signature, 900)).toBe(true);
  });

  it("rejects a signature of the wrong length without throwing", () => {
    const { timestamp } = signPartnerWebhook(secret, body);
    expect(verifyPartnerWebhookSignature(secret, body, timestamp, "short")).toBe(false);
    expect(verifyPartnerWebhookSignature(secret, body, timestamp, "")).toBe(false);
  });
});

describe("delivery backoff", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("grows exponentially", () => {
    expect(nextRetryDelayMs(1)).toBe(60_000);
    expect(nextRetryDelayMs(2)).toBe(300_000);
    expect(nextRetryDelayMs(3)).toBe(1_500_000);
  });

  it("caps at six hours so a dead endpoint never schedules a year out", () => {
    const cap = 6 * 60 * 60 * 1000;
    expect(nextRetryDelayMs(8)).toBe(cap);
    expect(nextRetryDelayMs(50)).toBe(cap);
  });

  it("is monotonic", () => {
    let previous = 0;
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const delay = nextRetryDelayMs(attempt);
      expect(delay).toBeGreaterThanOrEqual(previous);
      previous = delay;
    }
  });
});
