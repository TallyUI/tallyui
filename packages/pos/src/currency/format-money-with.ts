import { minorUnitDigits, type Money } from '@tallyui/core';

/** A store's own money format (WCPOS v2 General settings); a field left out keeps the locale's. */
export interface CurrencyFormat {
  position?: 'left' | 'right' | 'left_space' | 'right_space';
  thousandSeparator?: string;
  decimalSeparator?: string;
  decimals?: number;
}

/**
 * Money in a store's format, ported from WCPOS v2 (MIT): the position map of
 * `packages/core/src/screens/main/hooks/use-currency-format.tsx` and the separators and places
 * of `use-number-format.ts`. As there, the places are always shown, the integer is grouped every
 * three digits, and a minus leads the symbol. The symbol is Intl's for the currency and locale.
 * Returns undefined for 'XXX' or a code Intl refuses, so callers can fall back.
 */
export function formatMoneyWith(money: Money, format: CurrencyFormat, locale?: string): string | undefined {
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
    }).formatToParts(major);
  } catch {
    return undefined;
  }
  const text = (...types: string[]) => parts.filter((p) => types.includes(p.type)).map((p) => p.value).join('');
  const { position, thousandSeparator, decimalSeparator } = format;
  const integer = thousandSeparator === undefined
    ? text('integer', 'group')
    : text('integer').replace(/\B(?=(\d{3})+(?!\d))/g, thousandSeparator);
  const number = integer + (decimals > 0 ? (decimalSeparator ?? text('decimal')) + text('fraction') : '');
  const symbol = text('currency');
  const left = position
    ? position.startsWith('left')
    : parts.findIndex((p) => p.type === 'currency') < parts.findIndex((p) => p.type === 'integer');
  const gap = position ? (position.endsWith('_space') ? ' ' : '') : text('literal');
  return (money.amount < 0 && major > 0 ? '-' : '') + (left ? symbol + gap + number : number + gap + symbol);
}
