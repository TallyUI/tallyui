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
  const total = BigInt(totalMinor);
  if (total > weightTotal) throw new RangeError('Order discount exceeds the lines it applies to');
  if (total === 0n) return weights.map(() => 0);

  // BigInt keeps total × weight exact however large the order is.
  const shares = weights.map((weight) => (total * weight) / weightTotal);
  const remainders = weights.map((weight) => (total * weight) % weightTotal);
  let leftover = total - shares.reduce((sum, share) => sum + share, 0n);
  const ranked = remainders.map((_, index) => index)
    .sort((a, b) => remainders[a] === remainders[b] ? a - b : remainders[a] > remainders[b] ? -1 : 1);
  // Each leftover unit goes to a line with a non-zero remainder, whose share is still below its amount.
  for (const index of ranked) {
    if (leftover === 0n) break;
    shares[index] += 1n;
    leftover -= 1n;
  }
  return shares.map(Number);
}
