/**
 * Exact money arithmetic.
 *
 * Every financial value in Spredd Pay is a bigint count of minor units (USDC has
 * six). Nothing in this file converts to `number` for arithmetic — IEEE-754
 * cannot represent 4850.10 exactly, and a payout engine that rounds is a payout
 * engine that loses money.
 */

import { ASSET_DECIMALS } from "@spreddpay/config";

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

/** Minor-unit exponent for an asset, e.g. USDC -> 6. */
export function decimalsFor(asset: string): number {
  const decimals = ASSET_DECIMALS[asset.toUpperCase()];
  if (decimals === undefined) {
    throw new MoneyError(`Unknown asset "${asset}" — add it to ASSET_DECIMALS before using it.`);
  }
  return decimals;
}

const DECIMAL_PATTERN = /^(-)?(\d+)(?:\.(\d+))?$/;

/**
 * Parse a human decimal string ("4850.10") into minor units. Rejects anything
 * with more precision than the asset supports rather than silently truncating.
 */
export function parseAmountToMinor(input: string, asset: string): bigint {
  const decimals = decimalsFor(asset);
  const trimmed = input.trim().replace(/,/g, "");
  const match = DECIMAL_PATTERN.exec(trimmed);
  if (!match) {
    throw new MoneyError(`"${input}" is not a valid decimal amount.`);
  }

  const [, sign, whole = "0", fraction = ""] = match;
  if (fraction.length > decimals) {
    throw new MoneyError(
      `${asset} supports ${decimals} decimal places; "${input}" has ${fraction.length}.`,
    );
  }

  const padded = fraction.padEnd(decimals, "0");
  const magnitude = BigInt(whole + padded);
  return sign === "-" ? -magnitude : magnitude;
}

/** Render minor units as a plain decimal string ("4850.100000"). */
export function formatMinor(minor: bigint, asset: string): string {
  const decimals = decimalsFor(asset);
  const negative = minor < 0n;
  const magnitude = negative ? -minor : minor;
  const divisor = 10n ** BigInt(decimals);
  const whole = magnitude / divisor;
  const fraction = magnitude % divisor;
  const body =
    decimals === 0
      ? whole.toString()
      : `${whole}.${fraction.toString().padStart(decimals, "0")}`;
  return negative ? `-${body}` : body;
}

const GROUP_PATTERN = /\B(?=(\d{3})+(?!\d))/g;

/**
 * Render minor units for display: `4,850.00 USDC`.
 *
 * `displayDecimals` defaults to 2 because a trader reading a balance does not
 * want six zeros. Truncation here is toward zero and presentational only — the
 * stored value is never rounded.
 */
export function formatMoney(
  minor: bigint,
  asset: string,
  options: { displayDecimals?: number; withAsset?: boolean } = {},
): string {
  const decimals = decimalsFor(asset);
  const displayDecimals = Math.min(options.displayDecimals ?? Math.min(decimals, 2), decimals);
  const withAsset = options.withAsset ?? true;

  const negative = minor < 0n;
  const magnitude = negative ? -minor : minor;
  const divisor = 10n ** BigInt(decimals);
  const whole = (magnitude / divisor).toString().replace(GROUP_PATTERN, ",");
  const fractionDigits = (magnitude % divisor).toString().padStart(decimals, "0");

  const shown = displayDecimals > 0 ? `${whole}.${fractionDigits.slice(0, displayDecimals)}` : whole;
  const signed = negative ? `-${shown}` : shown;
  return withAsset ? `${signed} ${asset.toUpperCase()}` : signed;
}

/** Multiply by a basis-point rate with banker-free floor rounding, exactly. */
export function applyBasisPoints(minor: bigint, bps: number): bigint {
  if (!Number.isInteger(bps)) {
    throw new MoneyError(`Basis points must be an integer, received ${bps}.`);
  }
  if (bps < 0) {
    throw new MoneyError(`Basis points must not be negative, received ${bps}.`);
  }
  return (minor * BigInt(bps)) / 10_000n;
}

/**
 * Split `minor` across `weights` (basis points) so the parts always sum back to
 * the whole. Remainder from integer division goes to the largest weight, which
 * keeps revenue statements reconciling to the cent.
 */
export function allocate(minor: bigint, weights: readonly number[]): bigint[] {
  if (weights.length === 0) {
    throw new MoneyError("allocate() requires at least one weight.");
  }
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) {
    throw new MoneyError("allocate() weights must sum to a positive value.");
  }

  const parts = weights.map((weight) => (minor * BigInt(weight)) / BigInt(total));
  const distributed = parts.reduce((sum, part) => sum + part, 0n);
  const remainder = minor - distributed;

  if (remainder !== 0n) {
    let largestIndex = 0;
    for (let i = 1; i < weights.length; i += 1) {
      if ((weights[i] ?? 0) > (weights[largestIndex] ?? 0)) largestIndex = i;
    }
    parts[largestIndex] = (parts[largestIndex] ?? 0n) + remainder;
  }

  return parts;
}

export function sumMinor(values: Iterable<bigint>): bigint {
  let total = 0n;
  for (const value of values) total += value;
  return total;
}

export function maxMinor(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

export function minMinor(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}
