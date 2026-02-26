import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '@tallyui/theme';
import { VStack, type VStackProps } from '../ui';
import { OrderSummaryLine } from './order-summary-line';

export interface OrderSummaryPayment {
  label: string;
  amount: string;
}

export interface OrderSummaryProps extends Omit<VStackProps, 'children'> {
  /** Formatted subtotal string (e.g. "$1199.98") */
  subtotal: string;
  /** Formatted tax amount (optional) */
  tax?: string;
  /** Label for the tax line (defaults to "Tax") */
  taxLabel?: string;
  /** Formatted total string */
  total: string;
  /** Payment lines to display (e.g. cash tendered, change due) */
  payments?: OrderSummaryPayment[];
  /** Header slot (e.g. customer info, order number) */
  header?: ReactNode;
  /** Footer slot (e.g. action buttons) */
  footer?: ReactNode;
  className?: string;
}

/**
 * Displays an order summary with subtotal, tax, total, and optional
 * payment breakdown.
 *
 * Uses OrderSummaryLine internally for each row. Accepts header and
 * footer slots for additional context like customer info or action buttons.
 *
 * ```tsx
 * <OrderSummary
 *   subtotal="$1199.98"
 *   tax="$120.00"
 *   taxLabel="GST"
 *   total="$1319.98"
 *   payments={[{ label: 'Cash', amount: '$1400.00' }, { label: 'Change', amount: '$80.02' }]}
 *   header={<CustomerCard doc={customer} />}
 * />
 * ```
 */
export function OrderSummary({
  subtotal,
  tax,
  taxLabel = 'Tax',
  total,
  payments,
  header,
  footer,
  className,
  ...props
}: OrderSummaryProps) {
  return (
    <VStack space="none" className={cn('gap-1.5 px-3 py-3', className)} {...props}>
      {header && <View className="mb-2">{header}</View>}

      <OrderSummaryLine label="Subtotal" amount={subtotal} />
      {tax && <OrderSummaryLine label={taxLabel} amount={tax} />}
      <OrderSummaryLine label="Total" amount={total} bold />

      {payments && payments.length > 0 && (
        <VStack space="none" className="mt-2 gap-1.5 border-t border-border pt-2">
          {payments.map((payment) => (
            <OrderSummaryLine key={payment.label} label={payment.label} amount={payment.amount} />
          ))}
        </VStack>
      )}

      {footer && <View className="mt-2">{footer}</View>}
    </VStack>
  );
}
