import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { IDEMPOTENCY_HEADER } from "@spreddpay/config";
import { AppError } from "@spreddpay/contracts";
import type { Database } from "@spreddpay/db";

/**
 * Idempotency for mutating endpoints, per TECHNICAL_README section 12.
 *
 * The first request for a key claims it and runs. A replay with the same body
 * returns the stored response. A replay with a *different* body is a 409 — a
 * reused key with changed contents is a client bug, and quietly honouring it is
 * how duplicate payouts happen.
 *
 * Keys expire after 24 hours; the worker sweeps them.
 */

const TTL_MS = 24 * 60 * 60 * 1000;

function hashBody(body: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(body ?? null, (_key, value) => (typeof value === "bigint" ? value.toString() : value)))
    .digest("hex");
}

export interface IdempotencyClaim {
  key: string;
  recordId: string;
  /** Present when the key has already produced a response. */
  replay: { statusCode: number; body: unknown } | null;
}

export function readIdempotencyKey(request: FastifyRequest, required?: true): string;
export function readIdempotencyKey(request: FastifyRequest, required: false): string | null;
export function readIdempotencyKey(request: FastifyRequest, required = true): string | null {
  const raw = request.headers[IDEMPOTENCY_HEADER];
  const key = Array.isArray(raw) ? raw[0] : raw;

  if (!key) {
    if (required) {
      throw AppError.badRequest(
        `An "${IDEMPOTENCY_HEADER}" header is required on this endpoint.`,
      );
    }
    return null;
  }
  if (key.length < 8 || key.length > 200) {
    throw AppError.badRequest(`"${IDEMPOTENCY_HEADER}" must be between 8 and 200 characters.`);
  }
  return key;
}

export async function claimIdempotency(
  db: Database,
  input: { partnerId: string | null; endpoint: string; key: string; body: unknown },
): Promise<IdempotencyClaim> {
  const requestHash = hashBody(input.body);

  const existing = await db.idempotencyRecord.findFirst({
    where: { partnerId: input.partnerId, endpoint: input.endpoint, key: input.key },
  });

  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new AppError(
        "IDEMPOTENCY_MISMATCH",
        `Idempotency key "${input.key}" was already used with a different request body.`,
      );
    }
    if (existing.inFlight) {
      throw new AppError(
        "CONFLICT",
        `A request with idempotency key "${input.key}" is still in progress.`,
      );
    }
    return {
      key: input.key,
      recordId: existing.id,
      replay: {
        statusCode: existing.responseCode ?? 200,
        body: existing.responseBody,
      },
    };
  }

  const record = await db.idempotencyRecord.create({
    data: {
      partnerId: input.partnerId,
      endpoint: input.endpoint,
      key: input.key,
      requestHash,
      inFlight: true,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
    select: { id: true },
  });

  return { key: input.key, recordId: record.id, replay: null };
}

export async function completeIdempotency(
  db: Database,
  recordId: string,
  statusCode: number,
  body: unknown,
): Promise<void> {
  await db.idempotencyRecord.update({
    where: { id: recordId },
    data: {
      inFlight: false,
      responseCode: statusCode,
      responseBody: body as object,
    },
  });
}

/** Release a claim when the handler failed, so the caller can retry the key. */
export async function releaseIdempotency(db: Database, recordId: string): Promise<void> {
  await db.idempotencyRecord.deleteMany({ where: { id: recordId } });
}

/**
 * Wrap a handler so the whole claim/complete/release dance is one call.
 */
export async function withIdempotency<T>(
  db: Database,
  reply: FastifyReply,
  input: { partnerId: string | null; endpoint: string; key: string; body: unknown; statusCode?: number },
  handler: () => Promise<T>,
): Promise<T | unknown> {
  const claim = await claimIdempotency(db, input);
  if (claim.replay) {
    reply.status(claim.replay.statusCode);
    reply.header("idempotent-replay", "true");
    return claim.replay.body;
  }

  try {
    const result = await handler();
    const statusCode = input.statusCode ?? 200;
    await completeIdempotency(db, claim.recordId, statusCode, result);
    reply.status(statusCode);
    return result;
  } catch (error) {
    await releaseIdempotency(db, claim.recordId);
    throw error;
  }
}
