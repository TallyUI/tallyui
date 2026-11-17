import { type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

import { StatusBadge, type StatusBadgeProps } from '../ui/status-badge';

// 'canceled' is Medusa's spelling of 'cancelled'; both show as "Cancelled" (WCPOS v2's label).
// 'pos-open' and 'pos-partial' are WCPOS's own statuses (v2 labels: POS open, POS partial).
// 'trash' is WordPress's post status and 'checkout-draft' WooCommerce's (labels: Trash, Draft).
export type OrderStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'refunded'
  | 'cancelled'
  | 'canceled'
  | 'on-hold'
  | 'failed'
  | 'pos-open'
  | 'pos-partial'
  | 'trash'
  | 'checkout-draft';

export interface OrderStatusBadgeProps extends Omit<ViewProps, 'children'> {
  status: OrderStatus;
  className?: string;
}

type Tone = NonNullable<StatusBadgeProps['variant']>;

const STATUS_CONFIG: Record<OrderStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Pending', tone: 'warning' },
  processing: { label: 'Processing', tone: 'info' },
  completed: { label: 'Completed', tone: 'ok' },
  refunded: { label: 'Refunded', tone: 'muted' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
  canceled: { label: 'Cancelled', tone: 'muted' },
  'on-hold': { label: 'On hold', tone: 'warning' },
  failed: { label: 'Failed', tone: 'bad' },
  'pos-open': { label: 'POS open', tone: 'info' },
  'pos-partial': { label: 'POS partial', tone: 'warning' },
  trash: { label: 'Trash', tone: 'muted' },
  'checkout-draft': { label: 'Draft', tone: 'default' },
};

export function OrderStatusBadge({ status, className, ...viewProps }: OrderStatusBadgeProps) {
  // As in WCPOS v2, a status not in the table shows its raw string in the default tone.
  const config: { label: string; tone: Tone } = Object.prototype.hasOwnProperty.call(STATUS_CONFIG, status)
    ? STATUS_CONFIG[status]
    : { label: status, tone: 'default' };

  // As in WCPOS v2, a dot and a word with no tinted pill (removal R3); a caller's className still
  // lands on the row, so an app can add its own background.
  return <StatusBadge label={config.label} variant={config.tone} className={cn('self-start', className)} {...viewProps} />;
}
