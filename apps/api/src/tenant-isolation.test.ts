/**
 * Tenant isolation, proved against a real database.
 *
 * The principal guards in @spreddpay/auth are one layer; this tests the other.
 * `forPartner` injects partnerId into the query itself, so the question these
 * tests answer is: if a route handler forgets its where clause entirely, can it
 * still see another tenant's rows? The answer has to be no.
 *
 * Skipped when DATABASE_URL is not set, so `pnpm test` works without a database.
 * CI always sets one, so this always runs there.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CrossTenantAccessError, db, forPartner } from "@spreddpay/db";

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)("tenant isolation (database)", () => {
  const suffix = process.env.VITEST_WORKER_ID ?? "0";
  const slugA = `iso-test-a-${suffix}`;
  const slugB = `iso-test-b-${suffix}`;

  let partnerA = "";
  let partnerB = "";
  let traderA = "";
  let traderB = "";

  beforeAll(async () => {
    const a = await db.partner.upsert({
      where: { slug: slugA },
      create: {
        legalName: "Isolation Test A",
        displayName: "Isolation A",
        slug: slugA,
        supportEmail: "a@isolation.test",
        status: "ACTIVE",
      },
      update: {},
    });
    const b = await db.partner.upsert({
      where: { slug: slugB },
      create: {
        legalName: "Isolation Test B",
        displayName: "Isolation B",
        slug: slugB,
        supportEmail: "b@isolation.test",
        status: "ACTIVE",
      },
      update: {},
    });

    partnerA = a.id;
    partnerB = b.id;

    const ta = await db.trader.upsert({
      where: { partnerId_externalTraderId: { partnerId: partnerA, externalTraderId: "ISO-A-1" } },
      create: {
        partnerId: partnerA,
        externalTraderId: "ISO-A-1",
        email: `iso-a-${suffix}@isolation.test`,
        firstName: "Ada",
        lastName: "Alpha",
        countryCode: "US",
      },
      update: {},
    });
    const tb = await db.trader.upsert({
      where: { partnerId_externalTraderId: { partnerId: partnerB, externalTraderId: "ISO-B-1" } },
      create: {
        partnerId: partnerB,
        externalTraderId: "ISO-B-1",
        email: `iso-b-${suffix}@isolation.test`,
        firstName: "Bo",
        lastName: "Beta",
        countryCode: "US",
      },
      update: {},
    });

    traderA = ta.id;
    traderB = tb.id;
  });

  afterAll(async () => {
    // Traders and partners are not append-only, so the fixtures can be removed.
    await db.trader.deleteMany({ where: { partnerId: { in: [partnerA, partnerB] } } });
    await db.partner.deleteMany({ where: { slug: { in: [slugA, slugB] } } });
    await db.$disconnect();
  });

  it("an unfiltered findMany still only returns the scoped tenant's rows", async () => {
    const scoped = forPartner(db, partnerA);

    // Deliberately no where clause — the extension has to supply it.
    const traders = await scoped.trader.findMany();

    expect(traders.length).toBeGreaterThan(0);
    expect(traders.every((trader) => trader.partnerId === partnerA)).toBe(true);
    expect(traders.some((trader) => trader.id === traderB)).toBe(false);
  });

  it("findUnique on another tenant's id returns null, not the row", async () => {
    const scoped = forPartner(db, partnerA);
    const stolen = await scoped.trader.findUnique({ where: { id: traderB } });
    expect(stolen).toBeNull();
  });

  it("findFirst cannot be widened past the scope", async () => {
    const scoped = forPartner(db, partnerA);
    const stolen = await scoped.trader.findFirst({ where: { id: traderB } });
    expect(stolen).toBeNull();
  });

  it("count is scoped too", async () => {
    const scopedA = forPartner(db, partnerA);
    const scopedB = forPartner(db, partnerB);

    const [countA, countB, total] = await Promise.all([
      scopedA.trader.count(),
      scopedB.trader.count(),
      db.trader.count({ where: { partnerId: { in: [partnerA, partnerB] } } }),
    ]);

    expect(countA).toBe(1);
    expect(countB).toBe(1);
    expect(countA + countB).toBe(total);
  });

  it("updating another tenant's record throws rather than silently succeeding", async () => {
    const scoped = forPartner(db, partnerA);
    await expect(
      scoped.trader.update({ where: { id: traderB }, data: { firstName: "Hijacked" } }),
    ).rejects.toThrow(CrossTenantAccessError);

    const untouched = await db.trader.findUnique({ where: { id: traderB } });
    expect(untouched?.firstName).toBe("Bo");
  });

  it("deleting another tenant's record throws and leaves the row intact", async () => {
    const scoped = forPartner(db, partnerA);
    await expect(scoped.trader.delete({ where: { id: traderB } })).rejects.toThrow(
      CrossTenantAccessError,
    );

    // The guard has to run before the delete, not after — throwing afterwards
    // would not put the row back.
    const survivor = await db.trader.findUnique({ where: { id: traderB } });
    expect(survivor).not.toBeNull();
  });

  it("deleteMany cannot reach outside the scope", async () => {
    const scoped = forPartner(db, partnerA);
    const before = await db.trader.count({ where: { partnerId: partnerB } });

    // No where clause at all — the extension has to supply the tenant filter.
    const scratch = await db.trader.create({
      data: {
        partnerId: partnerA,
        externalTraderId: `ISO-A-DELETEMANY-${suffix}`,
        email: `iso-a-deletemany-${suffix}@isolation.test`,
        firstName: "Eve",
        lastName: "Epsilon",
        countryCode: "US",
      },
    });

    await scoped.trader.deleteMany({ where: { id: scratch.id } });

    expect(await db.trader.findUnique({ where: { id: scratch.id } })).toBeNull();
    expect(await db.trader.count({ where: { partnerId: partnerB } })).toBe(before);
  });

  it("updateMany cannot reach outside the scope", async () => {
    const scoped = forPartner(db, partnerA);
    const result = await scoped.trader.updateMany({ data: { countryCode: "GB" } });

    expect(result.count).toBe(1);
    const other = await db.trader.findUnique({ where: { id: traderB } });
    expect(other?.countryCode).toBe("US");

    await db.trader.update({ where: { id: traderA }, data: { countryCode: "US" } });
  });

  it("creates are stamped with the scoped partner even if the caller omits it", async () => {
    const scoped = forPartner(db, partnerA);
    const created = await scoped.trader.create({
      data: {
        externalTraderId: `ISO-A-CREATE-${suffix}`,
        email: `iso-a-create-${suffix}@isolation.test`,
        firstName: "Cy",
        lastName: "Gamma",
        countryCode: "US",
      } as never,
    });

    expect(created.partnerId).toBe(partnerA);
    await db.trader.delete({ where: { id: created.id } });
  });

  it("a create that names another tenant is overridden, not honoured", async () => {
    const scoped = forPartner(db, partnerA);
    const created = await scoped.trader.create({
      data: {
        partnerId: partnerB,
        externalTraderId: `ISO-A-OVERRIDE-${suffix}`,
        email: `iso-a-override-${suffix}@isolation.test`,
        firstName: "Di",
        lastName: "Delta",
        countryCode: "US",
      } as never,
    });

    expect(created.partnerId).toBe(partnerA);
    await db.trader.delete({ where: { id: created.id } });
  });

  it("refuses to build a scope with no partner", () => {
    expect(() => forPartner(db, "")).toThrow();
  });
});
