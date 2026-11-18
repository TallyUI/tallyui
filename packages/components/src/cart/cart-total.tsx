import type { ReactNode } from 'react';
import { useFormatMoney, type Money } from '@tallyui/core';
import { cn } from '@tallyui/theme';
import { Text, HStack, VStack, type VStackProps } from '../ui';

export interface CartTotalProps extends Omit<VStackProps, 'children'> {
  subtotal: Money;
  taxLines?: Array<{ label: string; amount: Money }>;
  discount?: Money;
  /** The fee lines' sum in the display tax mode; a "Fees" row shows when it is not 0, as WCPOS v2. */
  fees?: Money;
  /** The shipping lines' sum in the display tax mode; a "Shipping" row shows when it is not 0, as WCPOS v2. */
  shipping?: Money;
  total: Money;
  /** The tax is already in the subtotal (an inclusive display), so its rows read "incl." rather than add up. */
  taxInclusive?: boolean;
  locale?: string;
  className?: string;
  /** Rows rendered directly under Subtotal, e.g. a platform's coupon chips. */
  afterSubtotal?: ReactNode;
  /** Draws the Total row. Pass `false` when the total shows elsewhere, e.g. v2's Checkout button. Default `true`. */
  showTotal?: boolean;
}

/**
 * Displays a cart summary: subtotal, optional discount, fees and shipping, optional tax, and an optional Total row, in the
 * receipt's order.
 *
 * ```tsx
 * <CartTotal subtotal={subtotal} discount={discount} taxLines={taxLines} total={total} />
 * ```
 */
export function CartTotal({
  subtotal,
  taxLines,
  discount,
  fees,
  shipping,
  total,
  taxInclusive,
  locale,
  className,
  afterSubtotal,
  showTotal = true,
  ...props
}: CartTotalProps) {
  const formatMoney = useFormatMoney();
  return (
    <VStack space="none" className={cn('gap-1.5 px-3 py-3', className)} {...props}>
      <Row label="Subtotal" amount={formatMoney(subtotal, locale) ?? '—'} />

      {afterSubtotal}

      {discount && discount.amount > 0 && (
        <Row label="Discount" amount={`−${formatMoney(discount, locale) ?? '—'}`} />
      )}

      {fees && fees.amount !== 0 && (
        <Row testID="cart-total-fees" label="Fees" amount={formatMoney(fees, locale) ?? '—'} />
      )}

      {shipping && shipping.amount !== 0 && (
        <Row testID="cart-total-shipping" label="Shipping" amount={formatMoney(shipping, locale) ?? '—'} />
      )}

      {taxLines?.map((line, index) => (
        <Row
          key={index}
          label={taxInclusive ? `incl. ${line.label}` : line.label}
          amount={formatMoney(line.amount, locale) ?? '—'}
        />
      ))}

      {showTotal && <HStack space="none" className="mt-1.5 justify-between border-t border-border pt-2">
        <Text className="font-semibold">Total</Text>
        <Text className="font-semibold">{formatMoney(total, locale) ?? '—'}</Text>
      </HStack>}
    </VStack>
  );
}

/** One muted label with its amount, as every CartTotal row but Total draws it. */
function Row({ label, amount, testID }: { label: string; amount: string; testID?: string }) {
  return (
    <HStack testID={testID} space="none" className="justify-between">
      <Text className="text-sm text-muted-foreground">{label}</Text>
      <Text className="text-sm">{amount}</Text>
    </HStack>
  );
}
