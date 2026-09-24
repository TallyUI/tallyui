import type { Money, ProductPrice, ResolvedPrice } from './types/money';

const digitsCache = new Map<string, number>();

/** Number of minor-unit digits for an ISO 4217 code (2 for EUR, 0 for JPY). */
export function minorUnitDigits(currency: string): number {
  const code = currency.toUpperCase();
  let digits = digitsCache.get(code);
  if (digits === undefined) {
    try {
      digits = new Intl.NumberFormat('en', { style: 'currency', currency: code })
        .resolvedOptions().maximumFractionDigits ?? 2;
    } catch {
      // Unknown or placeholder code (e.g. 'XXX'): assume cents.
      digits = 2;
    }
    digitsCache.set(code, digits);
  }
  return digits;
}

/**
 * Converts a major-unit amount ('12.50', 12.5) into Money.
 * Returns undefined for empty or non-numeric input.
 */
export function moneyFromMajor(
  value: string | number | null | undefined,
  currency: string,
): Money | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const major = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(major)) return undefined;
  const code = currency.toUpperCase();
  return { amount: Math.round(major * 10 ** minorUnitDigits(code)), currency: code };
}

/** Parses trimmed decimal text into safe integer minor units, without rounding. */
export function moneyFromDecimalString(text: string, currency: string): Money | undefined {
  const trimmed = text.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return undefined;
  const code = currency.toUpperCase();
  const digits = minorUnitDigits(code);
  const [whole, fraction = ''] = trimmed.split('.');
  if (fraction.length > digits) return undefined;
  const amount = Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, '0'));
  return Number.isSafeInteger(amount) ? { amount, currency: code } : undefined;
}

/** Converts Money back to a major-unit number, e.g. for Intl formatting. */
export function moneyToMajor(money: Money): number {
  return money.amount / 10 ** minorUnitDigits(money.currency);
}

const formatters = new Map<string, Intl.NumberFormat>();

/**
 * Formats Money for display with Intl, e.g. '€12.50' or '¥1,200'.
 * Returns undefined for 'XXX' (currency unknown), so callers can fall back.
 */
export function formatMoney(money: Money, locale?: string): string | undefined {
  if (money.currency === 'XXX') return undefined;
  const key = `${money.currency}:${locale ?? ''}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat(locale, { style: 'currency', currency: money.currency });
    } catch {
      return undefined;
    }
    formatters.set(key, formatter);
  }
  return formatter.format(moneyToMajor(money));
}

/**
 * Picks the price to charge from a price list, in `currency` if given, else in
 * the first currency listed. A sale entry wins over the base entry.
 */
export function resolvePrice(
  prices: ProductPrice[],
  currency?: string,
): ResolvedPrice | undefined {
  const code = (currency ?? prices[0]?.currency)?.toUpperCase();
  const inCurrency = prices.filter((p) => p.currency === code);
  const base = inCurrency.find((p) => p.kind === 'base');
  const sale = inCurrency.find((p) => p.kind === 'sale');
  const strip = (p: ProductPrice): Money => ({ amount: p.amount, currency: p.currency });

  if (sale && (!base || sale.amount < base.amount)) {
    return { current: strip(sale), was: base ? strip(base) : undefined };
  }
  return base ? { current: strip(base) } : undefined;
}

/**
 * The lowest and highest price to charge across variants, in `currency` if
 * given, else each variant's first currency; undefined when no variant
 * resolves. Only amounts in the first resolved variant's currency are
 * compared; a variant that resolves to another currency is skipped.
 */
export function resolvePriceRange(
  variants: Array<{ prices: ProductPrice[] }>,
  currency?: string,
): { min: Money; max: Money } | undefined {
  let range: { min: Money; max: Money } | undefined;
  for (const variant of variants) {
    const resolved = resolvePrice(variant.prices, currency);
    if (!resolved) continue;
    const money = resolved.current;
    if (!range) {
      range = { min: money, max: money };
    } else if (money.currency === range.min.currency) {
      if (money.amount < range.min.amount) range.min = money;
      if (money.amount > range.max.amount) range.max = money;
    }
  }
  return range;
}
