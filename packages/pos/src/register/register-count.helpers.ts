/**
 * The pure maths behind a register count: variance against the expected float, a display
 * string for it, and the denomination arithmetic the counting keypad uses. Port provenance
 * (ADR-032 amendment 1): WCPOS `next` `3b5331b5c`.
 *
 * Money here is TallyUI's convention: integer minor units. Everywhere WCPOS assumed two
 * decimals, these take the currency's `exponent` instead — 0 for JPY, 3 for KWD — except
 * `validAmount`, which like WCPOS still takes the cashier's typed text.
 */

/**
 * Parses a decimal string the cashier typed into integer minor units at `exponent` decimal
 * places, without rounding. Returns `NaN` when the string carries more precision than the
 * currency allows, so a safe-integer check on the result also rejects it.
 */
export function parseMinor(text: string, exponent: number): number {
  const [whole, fraction = ''] = text.trim().split('.');
  if (fraction.length > exponent) return NaN;
  return Number(whole || '0') * 10 ** exponent + Number(fraction.padEnd(exponent, '0') || '0');
}

export const validAmount = (value: string, exponent: number) =>
  /^(?:\d+\.?\d*|\.\d+)$/.test(value) &&
  Number.isFinite(Number(value)) &&
  Number.isSafeInteger(parseMinor(value, exponent));

/** Counted minus expected, both already in minor units. */
export const countVariance = (countedMinor: number, expectedMinor: number) =>
  countedMinor - expectedMinor;

/** Whether the variance exceeds the store's configured threshold (minor units; none means never). */
export const overThreshold = (variance: number, thresholdMinor?: number | null) =>
  thresholdMinor != null && Math.abs(variance) > thresholdMinor;

/** Sums denomination face values (already minor units) by piece count. */
export const denominationTotal = (pieces: Record<number, number>) =>
  Object.entries(pieces).reduce((sum, [value, count]) => sum + Number(value) * count, 0);

/**
 * The variance line under the count: exact, short or over. `format` takes a major-unit
 * amount, as an app's currency formatter expects, so `exponent` converts `variance` back for
 * it; `t` supplies the translated words for the `register.exact`/`register.short`/
 * `register.over` keys. Both are the app's own — neutral here.
 */
export function varianceText(
  variance: number,
  exponent: number,
  format: (value: number) => string,
  t: (key: string) => string,
) {
  if (!variance) return t('register.exact');
  return `${variance < 0 ? '−' : '+'}${format(Math.abs(variance) / 10 ** exponent)} ${t(variance < 0 ? 'register.short' : 'register.over')}`;
}
