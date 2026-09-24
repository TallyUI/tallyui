import { formatMoney, minorUnitDigits, moneyToMajor, resolvePrice, resolvePriceRange, useProductTraits, useTraitContext } from '@tallyui/core';
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
  /**
   * When the connector's variants have differing prices, show
   * `{fromLabel} <lowest price>` instead of the default variant's price.
   * Defaults to true.
   */
  showFromPrice?: boolean;
  /**
   * Label shown before the lowest price when variant prices differ.
   * @deprecated Use formatFrom.
   */
  fromLabel?: string;
  /**
   * Formats the lowest price when variant prices differ, for languages
   * whose word order puts the label after the price. Defaults to
   * `` (price) => `from ${price}` ``. Wins over `fromLabel` when both are given.
   */
  formatFrom?: (price: string) => string;
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
export function ProductPrice({ doc, currency, locale, currencySymbol = '$', className, showFromPrice = true, fromLabel, formatFrom, ...textProps }: ProductPriceProps) {
  const { getPrices, getVariants } = useProductTraits();
  const traitContext = useTraitContext();
  const effectiveCurrency = currency ?? traitContext.currency;

  // Unknown currency ('XXX'): plain decimal behind the fallback symbol.
  const format = (money: Money) =>
    formatMoney(money, locale)
    ?? `${currencySymbol}${moneyToMajor(money).toFixed(minorUnitDigits(money.currency))}`;

  const variants = showFromPrice ? getVariants?.(doc, traitContext) : undefined;
  const range = variants && variants.length >= 2 ? resolvePriceRange(variants, effectiveCurrency) : undefined;

  const applyFormatFrom = formatFrom ?? (fromLabel !== undefined ? (price: string) => `${fromLabel} ${price}` : (price: string) => `from ${price}`);

  if (range && range.min.amount !== range.max.amount) {
    return (
      <Text
        className={cn('text-sm font-medium text-price', className)}
        {...textProps}
        style={[{ fontVariant: ['tabular-nums'] }, textProps.style]}
      >
        {applyFormatFrom(format(range.min))}
      </Text>
    );
  }

  const resolved = resolvePrice(getPrices(doc, traitContext), effectiveCurrency);

  if (!resolved) {
    return (
      <Text className={cn('text-sm text-muted-foreground', className)} {...textProps}>
        -
      </Text>
    );
  }

  if (resolved.was) {
    return (
      <Text
        className={cn('text-sm font-semibold text-sale', className)}
        {...textProps}
        style={[{ fontVariant: ['tabular-nums'] }, textProps.style]}
      >
        {format(resolved.current)}{' '}
        <Text className="text-muted-foreground line-through" style={{ textDecorationLine: 'line-through' }}>(was {format(resolved.was)})</Text>
      </Text>
    );
  }

  return (
    <Text
      className={cn('text-sm font-medium text-price', className)}
      {...textProps}
      style={[{ fontVariant: ['tabular-nums'] }, textProps.style]}
    >
      {format(resolved.current)}
    </Text>
  );
}
