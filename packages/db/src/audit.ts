/**
 * Audit trail.
 *
 * Every financial or administrative mutation writes one of these, inside the
 * same database transaction as the change itself. If the mutation rolls back so
 * does the audit row, and there is no path where a change lands without a
 * record of who made it.
 */

import type { DatabaseTransaction } from "./client";

export type AuditActorType = "PARTNER_USER" | "PLATFORM_USER" | "TRADER" | "SYSTEM" | "PROVIDER";

export interface AuditActor {
  type: AuditActorType;
  id?: string | null;
  label?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditInput {
  partnerId?: string | null;
  actor: AuditActor;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  changes?: Record<string, unknown> | null;
}

/** Keys whose values are replaced with "[redacted]" before an audit row lands. */
const REDACTED_KEYS = [
  "password",
  "passwordhash",
  "secret",
  "secretcipher",
  "token",
  "tokenhash",
  "apikey",
  "keyhash",
  "authorization",
  "pan",
  "cardnumber",
  "cvv",
  "cvc",
  "mfasecret",
  "privatekey",
];

function shouldRedact(key: string): boolean {
  const normalised = key.toLowerCase().replace(/[^a-z]/g, "");
  return REDACTED_KEYS.some((needle) => normalised.includes(needle));
}

/**
 * Deep-redact secrets and stringify bigints so the payload is valid JSON.
 * Audit rows are read by support staff; they must never carry card data.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = shouldRedact(key) ? "[redacted]" : redact(inner, depth + 1);
    }
    return out;
  }

  return value;
}

/**
 * Write an audit event. Always call with the transaction client so the record
 * shares the fate of the mutation.
 */
export async function recordAudit(tx: DatabaseTransaction, input: AuditInput): Promise<void> {
  await tx.auditEvent.create({
    data: {
      partnerId: input.partnerId ?? null,
      actorType: input.actor.type,
      actorId: input.actor.id ?? null,
      actorLabel: input.actor.label ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      changes: input.changes ? (redact(input.changes) as object) : undefined,
      ipAddress: input.actor.ipAddress ?? null,
      userAgent: input.actor.userAgent ?? null,
    },
  });
}

/** Build a `changes` payload from a before/after pair, keeping only diffs. */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, next] of Object.entries(after)) {
    const previous = before[key];
    if (previous !== next) {
      changes[key] = { from: redact(previous), to: redact(next) };
    }
  }
  return changes;
}
