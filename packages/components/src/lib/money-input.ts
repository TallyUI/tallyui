import { minorUnitDigits, type MoneyFormat } from '@tallyui/core';

/** Minor units as input text: sign, no grouping, the currency's places, in the store's decimal separator ('.' without one). */
export function moneyInputText(minor: number, currency: string, format?: MoneyFormat): string {
  const digits = minorUnitDigits(currency);
  const text = String(Math.abs(minor)).padStart(digits + 1, '0');
  const separator = format?.decimalSeparator || '.';
  return (minor < 0 ? '-' : '') + (digits ? `${text.slice(0, -digits)}${separator}${text.slice(-digits)}` : text);
}
