// Moved from @tallyui/pos tax/exact.ts (arch 1a): the till's and the servers' exact rounding.
/** #287: `half_up` is Math.round's rule, Vendure's DefaultMoneyStrategy (default-money-strategy.js:19-21). */
export type RoundingMode = 'half_away_from_zero' | 'half_up';

/** `n / d` (d > 0) rounded to an integer in `mode`, exactly; the modes differ only on exact negative halves. */
export function roundRatio(n: bigint, d: bigint, mode: RoundingMode = 'half_away_from_zero'): bigint {
  if (mode === 'half_away_from_zero' && n < 0n) return -roundRatio(-n, d, mode);
  const a = 2n * n + d, b = 2n * d; // floor(n / d + 1/2)
  return a / b - (a < 0n && a % b !== 0n ? 1n : 0n);
}
