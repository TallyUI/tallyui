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

const symbolCache = new Map<string, string>();

/** The currency's symbol for a plain-English label ('€' for EUR, '$' for USD), not a full amount. */
export function currencySymbol(currency: string, locale?: string): string {
  const code = currency.toUpperCase();
  const key = `${code}:${locale ?? ''}`;
  let symbol = symbolCache.get(key);
  if (symbol === undefined) {
    try {
      const part = new Intl.NumberFormat(locale, { style: 'currency', currency: code })
        .formatToParts(0)
        .find((p) => p.type === 'currency');
      symbol = part?.value ?? code;
    } catch {
      symbol = code;
    }
    symbolCache.set(key, symbol);
  }
  return symbol;
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

/**
 * Converts Money back to a major-unit number, e.g. for Intl formatting.
 * @deprecated Use `minorToMajor(money.amount, minorUnitDigits(money.currency))`, which returns an exact decimal string instead of a float.
 */
export function moneyToMajor(money: Money): number {
  return money.amount / 10 ** minorUnitDigits(money.currency);
}

const formatters = new Map<string, Intl.NumberFormat>();

/** A store's own money format (WCPOS v2 General settings); a field left out keeps the locale's. */
export interface MoneyFormat {
  position?: 'left' | 'right' | 'left_space' | 'right_space';
  thousandSeparator?: string;
  decimalSeparator?: string;
  decimals?: number;
  /** The store's currency symbol as plain text (e.g. WooCommerce's `currency_symbol` with HTML entities decoded); Intl's symbol for the currency and locale when unset. */
  symbol?: string;
}

/**
 * Formats Money for display with Intl, e.g. '€12.50' or '¥1,200'.
 * Returns undefined for 'XXX' (currency unknown), so callers can fall back.
 */
export function formatMoney(money: Money, locale?: string, format?: MoneyFormat): string | undefined {
  if (format !== undefined) return formatMoneyWith(money, format, locale);
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

const POSITIONS: ReadonlyArray<string> = ['left', 'right', 'left_space', 'right_space'];

/**
 * Money in a store's format, ported from WCPOS v2 (MIT): the position map of
 * `packages/core/src/screens/main/hooks/use-currency-format.tsx` and the separators and places of
 * `use-number-format.ts`. As there, the places are always shown, digits are Latin, and a minus leads the symbol.
 * With a thousand separator the integer is grouped every three digits; without one, Intl groups it for the locale.
 * Departures from v2: the symbol falls back to Intl's when the format has none; a position outside the four values
 * means Intl's side and gap (v2 shows no symbol); fewer places round halves away from zero (v2 rounds them toward
 * +infinity, so -12.50 at 0 places reads -13 here, -12 there); v2's lakh/wan grouping styles are not supported.
 * Returns undefined for 'XXX' or a code Intl refuses, so callers can fall back.
 */
function formatMoneyWith(money: Money, format: MoneyFormat, locale?: string): string | undefined {
  if (money.currency === 'XXX') return undefined;
  const minor = minorUnitDigits(money.currency);
  const decimals = format.decimals ?? minor;
  const abs = Math.abs(money.amount);
  // Fewer places round whole minor units half away from zero, so -12.50 and 12.50 read alike.
  const major = decimals >= minor ? abs / 10 ** minor : Math.round(abs / 10 ** (minor - decimals)) / 10 ** decimals;
  let parts: Intl.NumberFormatPart[];
  try {
    parts = new Intl.NumberFormat(locale, {
      style: 'currency', currency: money.currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals,
      numberingSystem: 'latn',
    }).formatToParts(major);
  } catch {
    return undefined;
  }
  const text = (...types: string[]) => parts.filter((p) => types.includes(p.type)).map((p) => p.value).join('');
  const { thousandSeparator, decimalSeparator } = format;
  const position = format.position !== undefined && POSITIONS.includes(format.position) ? format.position : undefined;
  const integer = thousandSeparator === undefined
    ? text('integer', 'group')
    : text('integer').replace(/\B(?=(\d{3})+(?!\d))/g, thousandSeparator);
  const number = integer + (decimals > 0 ? (decimalSeparator ?? text('decimal')) + text('fraction') : '');
  const symbol = format.symbol ?? text('currency');
  const left = position
    ? position.startsWith('left')
    : parts.findIndex((p) => p.type === 'currency') < parts.findIndex((p) => p.type === 'integer');
  const gap = position ? (position.endsWith('_space') ? ' ' : '') : text('literal');
  return (money.amount < 0 && major > 0 ? '-' : '') + (left ? symbol + gap + number : number + gap + symbol);
}

/**
 * A typed amount in the store's separators as plain decimal text ('1.234,50' → '1234.50'); ported from WCPOS v2 typed-field.tsx parseNumber.
 * Without a format the text is untouched; it never rounds, so too many places stay the caller's refusal (#672).
 */
export function normalizeMoneyText(text: string, format?: MoneyFormat): string {
  if (format === undefined || (!format.decimalSeparator && !format.thousandSeparator)) return text;
  const decimal = format.decimalSeparator || '.';
  const thousands = format.thousandSeparator === decimal ? '' : format.thousandSeparator || '';
  const trimmed = text.trim();
  // An ambiguous amount is refused, never guessed up: the text comes back unchanged for the caller to refuse.
  if (['.', ','].some((sep) => sep !== decimal && sep !== thousands && trimmed.includes(sep))) return text;
  const [whole = '', fraction, ...more] = trimmed.split(decimal);
  if (more.length > 0 || (fraction !== undefined && /\D/.test(fraction))) return text;
  let integer = whole;
  if (thousands && whole.includes(thousands)) {
    const groups = whole.split(thousands);
    if (/^-?[1-9]\d{0,2}$/.test(groups[0] ?? '') && groups.slice(1).every((g) => /^\d{3}$/.test(g))) integer = groups.join('');
    // A lone '.' or ',' separator not followed by exactly 3 digits cannot be grouping, so it is the decimal point ('1,5').
    else if (fraction === undefined && groups.length === 2 && (thousands === '.' || thousands === ',') && !/^\d{3}$/.test(groups[1] ?? '')) integer = groups.join('.');
    else return text;
  }
  const t = fraction === undefined ? integer : `${integer}.${fraction}`;
  if (!/^-?(\d+(?:\.\d*)?|\.\d+)$/.test(t)) return text;
  return t.replace(/^(-?)\./, (_, sign: string) => `${sign}0.`).replace(/\.$/, '');
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
  const strip = (p: ProductPrice): ResolvedPrice['current'] => ({
    amount: p.amount, currency: p.currency,
    ...(p.taxInclusive !== undefined ? { taxInclusive: p.taxInclusive } : {}),
  });

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
