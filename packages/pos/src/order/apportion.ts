/**
 * Splits `totalMinor` (a safe integer >= 0) over `weights` by largest remainders (docs/contract/order-create-v9.md):
 * take each share's floor of totalMinor × w / Σw, then give the leftover units, one each, to the largest fractional parts.
 * Ties go to the lower index. A negative weight counts as 0. When every weight is 0 and totalMinor is not,
 * the whole total goes to `fallbackIndex`. Exact BigInt arithmetic throughout.
 */
export function apportionLargestRemainders(weights: readonly bigint[], totalMinor: number, fallbackIndex: number): number[] {
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0) throw new RangeError('Total must be a safe integer >= 0');
  if (totalMinor === 0) return weights.map(() => 0);
  const positive = weights.map((weight) => weight < 0n ? 0n : weight);
  const sum = positive.reduce((total, weight) => total + weight, 0n);
  if (sum === 0n) {
    if (!Number.isInteger(fallbackIndex) || fallbackIndex < 0 || fallbackIndex >= weights.length)
      throw new RangeError('Fallback index is out of range');
    return weights.map((_, index) => index === fallbackIndex ? totalMinor : 0);
  }
  const total = BigInt(totalMinor);
  const shares = positive.map((weight) => total * weight / sum);
  const remainders = positive.map((weight) => total * weight % sum);
  let leftover = total - shares.reduce((amount, share) => amount + share, 0n);
  const ranked = remainders.map((_, index) => index)
    .sort((a, b) => remainders[a] === remainders[b] ? a - b : remainders[a] > remainders[b] ? -1 : 1);
  for (const index of ranked) {
    if (leftover === 0n) break;
    shares[index] += 1n;
    leftover -= 1n;
  }
  return shares.map(Number);
}
