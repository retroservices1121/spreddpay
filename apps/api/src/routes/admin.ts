import type { FastifyInstance } from "fastify";
import {
  AppError,
  createPartnerRequest,
  paginationQuery,
} from "@spreddpay/contracts";
import { requirePermission } from "@spreddpay/auth";
import { recordAudit } from "@spreddpay/db";
import { platformOverview } from "@spreddpay/analytics";
import { assertBooksBalance } from "@spreddpay/ledger";
import type { AppContext } from "../context";
import { clientContext, requirePlatformUser } from "../plugins/auth";
import { money, toAuditDto, toPartnerDto, toPayoutDto } from "../mappers";

/** SpreddPay operations API, backing the admin portal in section 15. */
export async function registerAdminRoutes(
  app: FastifyInstance,
  context: AppContext,
): Promise<void> {
  app.get("/admin/overview", async (request) => {
    const principal = requirePlatformUser(request);
    requirePermission(principal, "platform:partner:read");
    return platformOverview(context.db);
  });

  app.get("/admin/partners", async (request) => {
    const principal = requirePlatformUser(request);
    requirePermission(principal, "platform:partner:read");

    const partners = await context.db.partner.findMany({
      orderBy: { createdAt: "desc" },
      include: { branding: true, _count: { select: { traders: true, cards: true, payouts: true } } },
    });

    return {
      data: partners.map((partner) => ({
        ...toPartnerDto(partner),
        productName: partner.branding?.productName ?? partner.displayName,
        counts: partner._count,
      })),
    };
  });

  app.post("/admin/partners", async (request, reply) => {
    const principal = requirePlatformUser(request);
    requirePermission(principal, "platform:partner:write");

    const body = createPartnerRequest.parse(request.body);
    const client = clientContext(request);

    const partner = await context.db.$transaction(async (tx) => {
      const created = await tx.partner.create({
        data: {
          legalName: body.legalName,
          displayName: body.displayName,
          slug: body.slug,
          supportEmail: body.supportEmail,
          defaultAsset: body.defaultAsset,
          defaultNetwork: body.defaultNetwork,
          status: "ONBOARDING",
        },
      });

      await tx.partnerBranding.create({
        data: { partnerId: created.id, productName: body.displayName },
      });

      // A partner starts with no supported countries, which the onboarding
      // check reads as "not configured" and refuses. Eligibility is opt-in.
      await tx.partnerProgram.create({
        data: {
          partnerId: created.id,
          provider: "RAIN",
          asset: body.defaultAsset,
          network: body.defaultNetwork,
          supportedCountries: [],
        },
      });

      await recordAudit(tx, {
        partnerId: created.id,
        actor: {
          type: "PLATFORM_USER",
          id: principal.userId,
          label: `${principal.firstName} ${principal.lastName}`,
          ipAddress: client.ipAddress,
          userAgent: client.userAgent,
        },
        action: "partner.created",
        entityType: "Partner",
        entityId: created.id,
        summary: `Created partner ${body.displayName}`,
        changes: body as Record<string, unknown>,
      });

      return created;
    });

    reply.status(201);
    return toPartnerDto(partner);
  });

  app.get<{ Params: { partnerId: string } }>("/admin/partners/:partnerId", async (request) => {
    const principal = requirePlatformUser(request);
    requirePermission(principal, "platform:partner:read");

    const partner = await context.db.partner.findUnique({
      where: { id: request.params.partnerId },
      include: { branding: true, programs: true, users: { include: { roles: true } } },
    });
    if (!partner) throw AppError.notFound("Partner not found.");

    return {
      partner: toPartnerDto(partner),
      programs: partner.programs.map((program) => ({
        id: program.id,
        provider: program.provider,
        providerProgramId: program.providerProgramId,
        asset: program.asset,
        network: program.network,
        active: program.active,
        supportedCountries: program.supportedCountries,
        dualApprovalThreshold: money(program.dualApprovalThresholdMinor, program.asset),
        partnerDailyLimit: money(program.partnerDailyLimitMinor, program.asset),
        singlePayoutMax: money(program.singlePayoutMaxMinor, program.asset),
        minPayout: money(program.minPayoutMinor, program.asset),
      })),
      users: partner.users.map((user) => ({
        id: user.id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        status: user.status,
        roles: user.roles.map((role) => role.role),
      })),
    };
  });

  app.get("/admin/payouts", async (request) => {
    const principal = requirePlatformUser(request);
    requirePermission(principal, "platform:payout:read");

    const query = paginationQuery.parse(request.query);
    const payouts = await context.db.payout.findMany({
      orderBy: { createdAt: "desc" },
      take: query.limit,
      include: { trader: true, initiatedBy: true, approvedBy: true, partner: true },
    });

    return {
      data: payouts.map((payout) => ({
        ...toPayoutDto(payout),
        partnerName: payout.partner.displayName,
      })),
    };
  });

  app.get("/admin/manual-operations", async (request) => {
    const principal = requirePlatformUser(request);
    requirePermission(principal, "platform:manual_operation:manage");

    const operations = await context.db.manualOperation.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { partner: true, owner: true },
    });

    return {
      data: operations.map((operation) => ({
        id: operation.id,
        kind: operation.kind,
        status: operation.status,
        summary: operation.summary,
        detail: operation.detail,
        partnerName: operation.partner?.displayName ?? null,
        owner: operation.owner ? `${operation.owner.firstName} ${operation.owner.lastName}` : null,
        providerReference: operation.providerReference,
        createdAt: operation.createdAt.toISOString(),
        completedAt: operation.completedAt ? operation.completedAt.toISOString() : null,
      })),
    };
  });

  app.post<{ Params: { id: string } }>(
    "/admin/manual-operations/:id/claim",
    async (request) => {
      const principal = requirePlatformUser(request);
      requirePermission(principal, "platform:manual_operation:manage");

      const operation = await context.db.manualOperation.update({
        where: { id: request.params.id },
        data: { status: "IN_PROGRESS", ownerUserId: principal.userId },
      });
      return { id: operation.id, status: operation.status };
    },
  );

  app.post<{ Params: { id: string }; Body: { providerReference?: string; evidenceUrl?: string } }>(
    "/admin/manual-operations/:id/complete",
    async (request) => {
      const principal = requirePlatformUser(request);
      requirePermission(principal, "platform:manual_operation:manage");

      const body = request.body ?? {};
      const operation = await context.db.$transaction(async (tx) => {
        const updated = await tx.manualOperation.update({
          where: { id: request.params.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            reviewedBy: principal.userId,
            providerReference: body.providerReference ?? null,
            evidenceUrl: body.evidenceUrl ?? null,
          },
        });

        await recordAudit(tx, {
          partnerId: updated.partnerId,
          actor: {
            type: "PLATFORM_USER",
            id: principal.userId,
            label: `${principal.firstName} ${principal.lastName}`,
          },
          action: "manual_operation.completed",
          entityType: "ManualOperation",
          entityId: updated.id,
          summary: `Completed manual operation: ${updated.summary}`,
          changes: { providerReference: body.providerReference ?? null },
        });

        return updated;
      });

      return { id: operation.id, status: operation.status };
    },
  );

  app.get("/admin/provider-events", async (request) => {
    const principal = requirePlatformUser(request);
    requirePermission(principal, "platform:provider_event:read");

    const query = paginationQuery.parse(request.query);
    const events = await context.db.webhookEvent.findMany({
      orderBy: { receivedAt: "desc" },
      take: query.limit,
    });

    return {
      data: events.map((event) => ({
        id: event.id,
        provider: event.provider,
        providerEventId: event.providerEventId,
        eventType: event.eventType,
        status: event.status,
        signatureValid: event.signatureValid,
        attempts: event.attempts,
        lastError: event.lastError,
        receivedAt: event.receivedAt.toISOString(),
        processedAt: event.processedAt ? event.processedAt.toISOString() : null,
      })),
    };
  });

  /**
   * Reconciliation: prove the books balance for every partner, and surface any
   * drift between the internal ledger and the latest provider snapshot. The
   * ledger never overwrites the provider — it reports the difference.
   */
  app.get("/admin/reconciliation", async (request) => {
    const principal = requirePlatformUser(request);
    requirePermission(principal, "platform:reconciliation:manage");

    const partners = await context.db.partner.findMany({ select: { id: true, displayName: true } });
    const results = [];

    for (const partner of partners) {
      try {
        const { debits, credits } = await assertBooksBalance(context.db, partner.id);
        results.push({
          partnerId: partner.id,
          partnerName: partner.displayName,
          balanced: true,
          debitsMinor: debits.toString(),
          creditsMinor: credits.toString(),
          error: null,
        });
      } catch (error) {
        results.push({
          partnerId: partner.id,
          partnerName: partner.displayName,
          balanced: false,
          debitsMinor: null,
          creditsMinor: null,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    return { data: results };
  });

  app.get("/admin/audit", async (request) => {
    const principal = requirePlatformUser(request);
    requirePermission(principal, "platform:audit:read");

    const query = paginationQuery.parse(request.query);
    const events = await context.db.auditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: query.limit,
    });
    return { data: events.map(toAuditDto) };
  });

  app.get("/admin/system", async (request) => {
    const principal = requirePlatformUser(request);
    requirePermission(principal, "platform:system:manage");

    const flags = await context.db.featureFlag.findMany({ orderBy: { key: "asc" } });

    return {
      integrationModes: { rain: context.env.RAIN_MODE, blend: context.env.BLEND_MODE },
      nodeEnv: context.env.NODE_ENV,
      featureFlags: flags.map((flag) => ({
        id: flag.id,
        key: flag.key,
        partnerId: flag.partnerId,
        enabled: flag.enabled,
        description: flag.description,
      })),
    };
  });
}
