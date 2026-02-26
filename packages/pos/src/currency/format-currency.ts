const formatters = new Map<string, Intl.NumberFormat>();

function getFormatter(currencyCode: string, locale?: string): Intl.NumberFormat {
  const key = `${currencyCode}:${locale ?? 'default'}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
    });
    formatters.set(key, formatter);
  }
  return formatter;
}

export function formatCurrency(amount: number, currencyCode: string, locale?: string): string {
  return getFormatter(currencyCode, locale).format(amount);
}
