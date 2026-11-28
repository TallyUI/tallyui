import { TAX_EXEMPT_REASON_ORDER_CREATE_VERSION } from './command';
import type { PosOrder } from './types';

export type TaxExemptReasonDelivery = 'none' | 'pending' | 'sent' | 'not_sent';

export function taxExemptReasonDelivery(order: Pick<PosOrder, 'taxExemptReason' | 'sentVersion'>): TaxExemptReasonDelivery {
  if (!order.taxExemptReason) return 'none';
  if (order.sentVersion === undefined) return 'pending';
  return order.sentVersion >= TAX_EXEMPT_REASON_ORDER_CREATE_VERSION ? 'sent' : 'not_sent';
}
