import type { FastifyInstance } from "fastify";
import {
  AppError,
  findRoleConflict,
  invitePartnerUserRequest,
  setPartnerUserStatusRequest,
  updatePartnerUserRolesRequest,
} from "@spreddpay/contracts";
import { generateToken, hashPassword, requirePartnerAccess, requirePermission } from "@spreddpay/auth";
import { forPartner, recordAudit } from "@spreddpay/db";
import { queueNotification } from "@spreddpay/notifications";
import type { AppContext } from "../context";
import { clientContext, requirePartnerUser } from "../plugins/auth";
import { readIdempotencyKey, withIdempotency } from "../plugins/idempotency";

/**
 * Partner team management.
 *
 * A funded trading firm provisions its own staff — Spredd Pay operations are
 * not in the loop to add an approver. `team:manage` is held by PARTNER_OWNER
 * and PARTNER_ADMIN only.
 *
 * The rule this file exists to enforce, beyond the obvious CRUD: one person
 * cannot hold both PAYOUT_CREATOR and PAYOUT_APPROVER. Dual approval compares
 * user ids, so that combination would let a single account approve its own
 * work — the control would pass while its intent was defeated.
 */
export async function registerTeamRoutes(app: FastifyInstance, context: AppContext): Promise<void> {
  interface Params {
    partnerId: string;
  }

  function scope(request: Parameters<typeof requirePartnerUser>[0], partnerId: string) {
    const principal = requirePartnerUser(request);
    requirePartnerAccess(principal, partnerId);
    requirePermission(principal, "team:manage");
    return {
      principal,
      tdb: forPartner(context.db, partnerId),
      actor: {
        type: principal.kind,
        id: principal.userId,
        label: `${principal.firstName} ${principal.lastName}`,
        ...clientContext(request),
      } as const,
    };
  }

  // ------------------------------------------------------------------ invite

  app.post<{ Params: Params }>("/partners/:partnerId/team", async (request, reply) => {
    const { partnerId } = request.params;
    const { principal, actor } = scope(request, partnerId);
    const body = invitePartnerUserRequest.parse(request.body);
    const key = readIdempotencyKey(request);

    const conflict = findRoleConflict(body.roles);
    if (conflict) {
      throw new AppError("FORBIDDEN", conflict.reason, { roles: conflict.roles });
    }

    const email = body.email.toLowerCase();

    return withIdempotency(
      context.db,
      reply,
      { partnerId, endpoint: "POST /partners/:partnerId/team", key, body, statusCode: 201 },
      async () => {
        const existing = await context.db.partnerUser.findFirst({
          where: { partnerId, email },
          select: { id: true },
        });
        if (existing) {
          throw AppError.conflict(`${email} is already on this team.`);
        }

        /**
         * The invited user is created without a usable password. There is no
         * self-service acceptance flow yet, so the invite token is recorded on
         * the notification for an operator to pass on — rather than setting a
         * password here that someone would have to communicate out of band.
         */
        const inviteToken = generateToken(24);
        const placeholder = await hashPassword(generateToken(32));

        const created = await context.db.$transaction(async (tx) => {
          const user = await tx.partnerUser.create({
            data: {
              partnerId,
              email,
              firstName: body.firstName,
              lastName: body.lastName,
              passwordHash: placeholder,
              status: "INVITED",
            },
          });

          for (const role of body.roles) {
            await tx.partnerRole.create({
              data: { partnerUserId: user.id, role, grantedBy: principal.userId },
            });
          }

          await recordAudit(tx, {
            partnerId,
            actor,
            action: "team.invited",
            entityType: "PartnerUser",
            entityId: user.id,
            summary: `Invited ${body.firstName} ${body.lastName} (${email}) as ${body.roles.join(", ")}`,
            changes: { email, roles: body.roles },
          });

          await queueNotification(tx, {
            partnerId,
            channel: "EMAIL",
            template: "team.invited",
            subject: `You have been invited to ${partnerId}`,
            body: `${principal.firstName} ${principal.lastName} invited you to join the team. Invite reference: ${inviteToken}`,
            payload: { inviteToken, roles: body.roles },
          });

          return user;
        });

        return {
          id: created.id,
          email: created.email,
          firstName: created.firstName,
          lastName: created.lastName,
          status: created.status,
          roles: body.roles,
        };
      },
    );
  });

  // ------------------------------------------------------------------- roles

  app.put<{ Params: Params & { userId: string } }>(
    "/partners/:partnerId/team/:userId/roles",
    async (request) => {
      const { partnerId, userId } = request.params;
      const { principal, tdb, actor } = scope(request, partnerId);
      const body = updatePartnerUserRolesRequest.parse(request.body);

      const conflict = findRoleConflict(body.roles);
      if (conflict) {
        throw new AppError("FORBIDDEN", conflict.reason, { roles: conflict.roles });
      }

      const target = await tdb.partnerUser.findFirst({
        where: { id: userId },
        include: { roles: true },
      });
      if (!target) throw AppError.notFound("Team member not found.");

      const previous = target.roles.map((role) => role.role);

      /**
       * Do not let someone remove their own last route back in. Changing your
       * own roles to something without team:manage would lock the partner out
       * of team management entirely if you were the only one who had it.
       */
      if (
        target.id === principal.userId &&
        !body.roles.includes("PARTNER_OWNER") &&
        !body.roles.includes("PARTNER_ADMIN")
      ) {
        throw AppError.forbidden(
          "You cannot remove your own team-management role. Ask another owner or admin to change it.",
        );
      }

      await context.db.$transaction(async (tx) => {
        await tx.partnerRole.deleteMany({ where: { partnerUserId: target.id } });
        for (const role of body.roles) {
          await tx.partnerRole.create({
            data: { partnerUserId: target.id, role, grantedBy: principal.userId },
          });
        }
        await recordAudit(tx, {
          partnerId,
          actor,
          action: "team.roles_changed",
          entityType: "PartnerUser",
          entityId: target.id,
          summary: `Changed roles for ${target.email}: ${previous.join(", ") || "none"} → ${body.roles.join(", ")}`,
          changes: { from: previous, to: body.roles },
        });
      });

      return { id: target.id, roles: body.roles };
    },
  );

  // ------------------------------------------------------------------ status

  app.put<{ Params: Params & { userId: string } }>(
    "/partners/:partnerId/team/:userId/status",
    async (request) => {
      const { partnerId, userId } = request.params;
      const { principal, tdb, actor } = scope(request, partnerId);
      const body = setPartnerUserStatusRequest.parse(request.body);

      const target = await tdb.partnerUser.findFirst({ where: { id: userId } });
      if (!target) throw AppError.notFound("Team member not found.");

      if (target.id === principal.userId && body.status !== "ACTIVE") {
        throw AppError.forbidden("You cannot deactivate your own account.");
      }

      // Losing the last active owner or admin would leave nobody able to manage
      // the team — including nobody able to undo this.
      if (body.status !== "ACTIVE") {
        const remaining = await tdb.partnerUser.count({
          where: {
            status: "ACTIVE",
            id: { not: target.id },
            roles: { some: { role: { in: ["PARTNER_OWNER", "PARTNER_ADMIN"] } } },
          },
        });
        const targetManages = await tdb.partnerUser.findFirst({
          where: {
            id: target.id,
            roles: { some: { role: { in: ["PARTNER_OWNER", "PARTNER_ADMIN"] } } },
          },
          select: { id: true },
        });
        if (targetManages && remaining === 0) {
          throw AppError.conflict(
            "This is the last active owner or admin. Promote someone else before deactivating them.",
          );
        }
      }

      await context.db.$transaction(async (tx) => {
        await tx.partnerUser.update({
          where: { id: target.id },
          data: { status: body.status },
        });

        // A deactivated user's live sessions end immediately, rather than
        // lasting until their cookie happens to expire.
        if (body.status !== "ACTIVE") {
          await tx.session.updateMany({
            where: { partnerUserId: target.id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }

        await recordAudit(tx, {
          partnerId,
          actor,
          action: "team.status_changed",
          entityType: "PartnerUser",
          entityId: target.id,
          summary: `${target.email} set to ${body.status.toLowerCase()}`,
          changes: { from: target.status, to: body.status },
        });
      });

      return { id: target.id, status: body.status };
    },
  );
}
