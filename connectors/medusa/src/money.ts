import { CustomerServiceError, minorUnitDigits } from '@tallyui/core';

/**
 * Medusa v2 sends money as JSON numbers in major units with sub-cent fractions (ADR-037), so every conversion here is
 * exact: BigInt on the number's shortest round-trip text (`String(n)`), rounded once, half away from zero.
 */

/** A finite number as `digits × 10^-scale`, exactly as `String(n)` spells it (exponent form included). */
function decimal(value: unknown): { digits: bigint; scale: number } {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new CustomerServiceError('server', 'unexpected response');
  const [, int = '', frac = '', exp = '0'] = /^(-?\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(String(value))!;
  const scale = frac.length - Number(exp);
  const digits = BigInt(`${int}${frac}`);
  return scale >= 0 ? { digits, scale } : { digits: digits * 10n ** BigInt(-scale), scale: 0 };
}

/** The exact decimal sum of `add` minus `subtract`, rounded once to the currency's minor units, half away from zero. */
export function medusaSumMinor(currency: string, add: readonly unknown[], subtract: readonly unknown[] = []): number {
  const minorDigits = minorUnitDigits(currency);
  const terms = [...add.map((value) => [decimal(value), 1n] as const), ...subtract.map((value) => [decimal(value), -1n] as const)];
  const scale = Math.max(minorDigits, ...terms.map(([term]) => term.scale));
  let total = 0n;
  for (const [term, sign] of terms) total += sign * term.digits * 10n ** BigInt(scale - term.scale);
  const divisor = 10n ** BigInt(scale - minorDigits);
  const rounded = ((total < 0n ? -total : total) + divisor / 2n) / divisor;
  return Number(total < 0n ? -rounded : rounded);
}

/** One Medusa amount in minor units. */
export const medusaMinor = (amount: unknown, currency: string): number => medusaSumMinor(currency, [amount]);

/** `gross − tax`, exactly, rounded once: the net such that net + tax is the gross rounded once. */
export const medusaNetMinor = (gross: unknown, tax: unknown, currency: string): number => medusaSumMinor(currency, [gross], [tax]);
