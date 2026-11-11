// Ported from WCPOS v2 packages/printer/src/encoder/format-money.ts (wcpos/monorepo 85ecbd43f, MIT).

export interface WcposMoneyOptions {
  /** `en_US` or `en-US`. Default `en-US`. */
  locale?: string;
  /** Fixed fraction digits; the currency's own default when absent. */
  decimals?: number;
  /** False for a symbol the printer cannot encode: the ISO code is printed instead. */
  isSymbolEncodable?: (symbol: string) => boolean;
}

/**
 * A major-unit amount as WCPOS prints it: Intl currency with the narrow symbol (`$25.00`, `25,00 €`).
 * When Intl throws, it retries without the narrow symbol, then falls back to `"<CURRENCY> <value>"`
 * (`INVALID 25.00`), or the bare number when there is no currency.
 */
export function formatWcposMoney(value: number, currency: string, options: WcposMoneyOptions = {}): string {
  const locale = (options.locale || 'en-US').replace(/_/g, '-');
  const { decimals, isSymbolEncodable } = options;
  const digits = decimals === undefined ? {} : { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  const format = (currencyDisplay?: 'narrowSymbol'): string => {
    const base = { style: 'currency' as const, currency, ...digits };
    const formatter = new Intl.NumberFormat(locale, currencyDisplay ? { ...base, currencyDisplay } : base);
    if (isSymbolEncodable) {
      const symbol = formatter.formatToParts(value).find((part) => part.type === 'currency')?.value ?? '';
      if (!isSymbolEncodable(symbol)) {
        return new Intl.NumberFormat(locale, { ...base, currencyDisplay: 'code' }).format(value);
      }
    }
    return formatter.format(value);
  };
  try {
    return format('narrowSymbol');
  } catch {
    try {
      return format();
    } catch {
      const fixed = value.toFixed(decimals ?? 2);
      return currency ? `${currency} ${fixed}` : fixed;
    }
  }
}
