/**
 * Double-entry journal.
 *
 * Rules from TECHNICAL_README section 16, enforced here rather than by
 * convention:
 *   * every entry balances (debits === credits);
 *   * postings are append-only;
 *   * corrections use reversals;
 *   * every entry references a business event;
 *   * ledger and payout changes occur in one database transaction.
 *
 * This ledger is for workflow and reporting. It does not claim custody — the
 * provider's balance is the source of truth and is reconciled against, never
 * replaced by, these numbers.
 */

import type { LedgerAccountCode } from "@spreddpay/contracts";
import { LEDGER_ACCOUNT_TYPE_BY_CODE, sumMinor } from "@spreddpay/contracts";
import type { DatabaseTransaction } from "@spreddpay/db";

export class UnbalancedEntryError extends Error {
  readonly debits: bigint;
  readonly credits: bigint;

  constructor(debits: bigint, credits: bigint) {
    super(
      `Journal entry does not balance: debits ${debits} vs credits ${credits} (difference ${debits - credits}).`,
    );
    this.name = "UnbalancedEntryError";
    this.debits = debits;
    this.credits = credits;
  }
}

export class InvalidPostingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPostingError";
  }
}

export type PostingDirection = "DEBIT" | "CREDIT";

export interface PostingInput {
  account: LedgerAccountCode;
  direction: PostingDirection;
  /** Always positive. `direction` carries the sign. */
  amountMinor: bigint;
  asset?: string;
}

export interface JournalEntryInput {
  partnerId: string;
  /** Business event that caused the entry, e.g. "payout.completed". */
  eventType: string;
  entityType: string;
  entityId: string;
  description: string;
  payoutId?: string | null;
  asset?: string;
  postings: readonly PostingInput[];
}

/**
 * Validate a set of postings without touching the database. Exported because
 * this is the rule the unit tests pin down, and because callers can check a
 * draft entry before opening a transaction.
 */
export function validatePostings(postings: readonly PostingInput[]): {
  debits: bigint;
  credits: bigint;
} {
  if (postings.length < 2) {
    throw new InvalidPostingError("A journal entry needs at least two postings.");
  }

  for (const posting of postings) {
    if (posting.amountMinor <= 0n) {
      throw new InvalidPostingError(
        `Posting to ${posting.account} must be positive; direction carries the sign (received ${posting.amountMinor}).`,
      );
    }
    if (!(posting.account in LEDGER_ACCOUNT_TYPE_BY_CODE)) {
      throw new InvalidPostingError(`Unknown ledger account "${posting.account}".`);
    }
  }

  const debits = sumMinor(
    postings.filter((p) => p.direction === "DEBIT").map((p) => p.amountMinor),
  );
  const credits = sumMinor(
    postings.filter((p) => p.direction === "CREDIT").map((p) => p.amountMinor),
  );

  if (debits !== credits) {
    throw new UnbalancedEntryError(debits, credits);
  }

  return { debits, credits };
}

/**
 * Resolve (creating on first use) the LedgerAccount row for a code. Accounts
 * are per partner and per asset so a partner's USDC and EUR books never mix.
 */
async function resolveAccountId(
  tx: DatabaseTransaction,
  partnerId: string,
  code: LedgerAccountCode,
  asset: string,
): Promise<string> {
  const existing = await tx.ledgerAccount.findFirst({
    where: { partnerId, code, asset },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await tx.ledgerAccount.create({
    data: {
      partnerId,
      code,
      asset,
      name: code
        .toLowerCase()
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" "),
      type: LEDGER_ACCOUNT_TYPE_BY_CODE[code],
    },
    select: { id: true },
  });
  return created.id;
}

export interface PostedEntry {
  entryId: string;
  debits: bigint;
  credits: bigint;
}

/**
 * Write a balanced journal entry. Must be called with a transaction client so
 * the entry commits or rolls back with the business change that caused it.
 */
export async function postEntry(
  tx: DatabaseTransaction,
  input: JournalEntryInput,
): Promise<PostedEntry> {
  const asset = input.asset ?? "USDC";
  const { debits, credits } = validatePostings(input.postings);

  const entry = await tx.ledgerEntry.create({
    data: {
      partnerId: input.partnerId,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      description: input.description,
      payoutId: input.payoutId ?? null,
    },
    select: { id: true },
  });

  for (const posting of input.postings) {
    const postingAsset = posting.asset ?? asset;
    const accountId = await resolveAccountId(tx, input.partnerId, posting.account, postingAsset);
    await tx.ledgerPosting.create({
      data: {
        entryId: entry.id,
        accountId,
        partnerId: input.partnerId,
        direction: posting.direction,
        amountMinor: posting.amountMinor,
        asset: postingAsset,
      },
    });
  }

  return { entryId: entry.id, debits, credits };
}

/**
 * Reverse an existing entry by writing its mirror image. History is never
 * edited; a correction is always a new, linked entry.
 */
export async function reverseEntry(
  tx: DatabaseTransaction,
  entryId: string,
  reason: string,
): Promise<PostedEntry> {
  const original = await tx.ledgerEntry.findUnique({
    where: { id: entryId },
    include: { postings: { include: { account: true } } },
  });

  if (!original) {
    throw new InvalidPostingError(`Ledger entry ${entryId} not found.`);
  }

  const mirrored: PostingInput[] = original.postings.map((posting) => ({
    account: posting.account.code as LedgerAccountCode,
    direction: posting.direction === "DEBIT" ? "CREDIT" : "DEBIT",
    amountMinor: posting.amountMinor,
    asset: posting.asset,
  }));

  const { debits, credits } = validatePostings(mirrored);

  const reversal = await tx.ledgerEntry.create({
    data: {
      partnerId: original.partnerId,
      eventType: `${original.eventType}.reversed`,
      entityType: original.entityType,
      entityId: original.entityId,
      description: `Reversal of ${original.id}: ${reason}`,
      payoutId: original.payoutId,
      reversesEntryId: original.id,
    },
    select: { id: true },
  });

  for (const posting of mirrored) {
    const accountId = await resolveAccountId(
      tx,
      original.partnerId,
      posting.account,
      posting.asset ?? "USDC",
    );
    await tx.ledgerPosting.create({
      data: {
        entryId: reversal.id,
        accountId,
        partnerId: original.partnerId,
        direction: posting.direction,
        amountMinor: posting.amountMinor,
        asset: posting.asset ?? "USDC",
      },
    });
  }

  return { entryId: reversal.id, debits, credits };
}

/**
 * Net balance of an account, signed by its normal side: debit-normal accounts
 * (assets, expenses) report debits minus credits, the rest the other way round.
 */
export async function accountBalance(
  tx: DatabaseTransaction,
  partnerId: string,
  code: LedgerAccountCode,
  asset = "USDC",
): Promise<bigint> {
  const account = await tx.ledgerAccount.findFirst({
    where: { partnerId, code, asset },
    select: { id: true, type: true },
  });
  if (!account) return 0n;

  const postings = await tx.ledgerPosting.findMany({
    where: { accountId: account.id },
    select: { direction: true, amountMinor: true },
  });

  let debits = 0n;
  let credits = 0n;
  for (const posting of postings) {
    if (posting.direction === "DEBIT") debits += posting.amountMinor;
    else credits += posting.amountMinor;
  }

  const debitNormal = account.type === "ASSET" || account.type === "EXPENSE";
  return debitNormal ? debits - credits : credits - debits;
}

/**
 * Whole-book check: across every posting for a partner, debits must equal
 * credits. Run by the reconciliation job and asserted in tests.
 */
export async function assertBooksBalance(
  tx: DatabaseTransaction,
  partnerId: string,
): Promise<{ debits: bigint; credits: bigint }> {
  const postings = await tx.ledgerPosting.findMany({
    where: { partnerId },
    select: { direction: true, amountMinor: true },
  });

  let debits = 0n;
  let credits = 0n;
  for (const posting of postings) {
    if (posting.direction === "DEBIT") debits += posting.amountMinor;
    else credits += posting.amountMinor;
  }

  if (debits !== credits) {
    throw new UnbalancedEntryError(debits, credits);
  }
  return { debits, credits };
}
