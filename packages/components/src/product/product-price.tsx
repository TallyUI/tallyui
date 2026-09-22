import { formatMoney, minorUnitDigits, moneyToMajor, resolvePrice, useProductTraits, useTraitContext } from '@tallyui/core';
import type { Money } from '@tallyui/core';
import { cn } from '@tallyui/theme';
import { Text, type TextProps } from '../ui';

export interface ProductPriceProps extends Omit<TextProps, 'children'> {
  /** The raw RxDB product document (connector-specific shape) */
  doc: any;
  /**
   * Currency to show when the product is priced in several. Defaults to the
   * provider's store currency, then to the first currency listed.
   */
  currency?: string;
  /** BCP 47 locale for number formatting. Defaults to the runtime locale. */
  locale?: string;
  /** Symbol to prepend when the currency is unknown (defaults to '$') */
  currencySymbol?: string;
  className?: string;
}

/**
 * Displays a product's price, and the price it replaces while on sale.
 *
 * Reads the backend-neutral price list (`getPrices`), so a WooCommerce sale
 * price, a Medusa sale price list and a Shopify compare-at price all render
 * the same way.
 *
 * ```tsx
 * <ProductPrice doc={productDocument} currency="EUR" />
 * ```
 */
export function ProductPrice({ doc, currency, locale, currencySymbol = '$', className, ...textProps }: ProductPriceProps) {
  const { getPrices } = useProductTraits();
  const traitContext = useTraitContext();
  const resolved = resolvePrice(getPrices(doc, traitContext), currency ?? traitContext.currency);

  if (!resolved) {
    return (
      <Text className={cn('text-sm text-muted-foreground', className)} {...textProps}>
        -
      </Text>
    );
  }

  // Unknown currency ('XXX'): plain decimal behind the fallback symbol.
  const format = (money: Money) =>
    formatMoney(money, locale)
    ?? `${currencySymbol}${moneyToMajor(money).toFixed(minorUnitDigits(money.currency))}`;

  if (resolved.was) {
    return (
      <Text className={cn('text-sm font-medium text-sale', className)} {...textProps}>
        {format(resolved.current)} (was {format(resolved.was)})
      </Text>
    );
  }

  return (
    <Text className={cn('text-sm font-medium text-price', className)} {...textProps}>
      {format(resolved.current)}
    </Text>
  );
}
