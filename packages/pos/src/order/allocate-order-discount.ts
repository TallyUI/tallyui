import { apportionLargestRemainders } from './apportion';

/**
 * Splits an order discount across lines in proportion to each line's pre-order-discount amount,
 * in its own tax mode (ADR-062), with largest-remainder rounding to the minor unit.
 *
 * - The shares sum exactly to `totalMinor`, and no share exceeds its line's amount.
 * - Leftover units go to the largest remainders; ties go to the earlier line, so the result is deterministic.
 * - A line with a zero or negative amount gets 0.
 *
 * Throws RangeError unless every input is a safe integer and 0 ≤ totalMinor ≤ Σ positive amounts.
 */
export function allocateOrderDiscount(lineAmountsMinor: readonly number[], totalMinor: number): number[] {
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0 || !lineAmountsMinor.every(Number.isSafeInteger)) {
    throw new RangeError('Amounts must be safe integers and the discount non-negative');
  }
  const weights = lineAmountsMinor.map((amount) => BigInt(Math.max(0, amount)));
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0n);
  if (BigInt(totalMinor) > weightTotal) throw new RangeError('Order discount exceeds the lines it applies to');
  // totalMinor > 0 implies weightTotal > 0 here, so the fallback index is never used.
  return apportionLargestRemainders(weights, totalMinor, 0);
}
