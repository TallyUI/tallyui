/**
 * Ports v2 calculate-refund.ts (calculateLineItemRefund, computeRemainingRefundQuantity).
 * Amounts follow ADR-080 amendment 2's cumulative-share rule.
 */
import type { OrderRefundLine } from '../types'
import type { StoreOrderLine } from '../types/orders'
import { roundRatio } from './round-ratio'

/** The fields of an order line this needs; a StoreOrderLine fits. */
export type RefundableOrderLine = Pick<StoreOrderLine, 'id' | 'quantity' | 'totalMinor' | 'taxMinor' | 'soldTotalMinor' | 'soldTaxMinor'>;
/** Earlier refund lines; negative quantities count by magnitude. */
export interface EarlierRefund { lines: ReadonlyArray<Pick<OrderRefundLine, 'orderLineId' | 'quantity'>> }

/** Remaining quantities and amounts, with earlier refund magnitudes capped at the line quantity. */
export interface RefundableLine {
  orderLineId: string;
  refundedQuantity: number;
  refundableQuantity: number;
  netMinor: number;
  taxMinor: number;
}

/** A selected quantity's cumulative shares of net and tax, and their sum. */
export interface PricedRefundLine {
  orderLineId: string; quantity: number; netMinor: number; taxMinor: number;
  totalMinor: number;
}

/** Payload-ready lines and their amounts; the caller adds shipping and adjustment to totalMinor. */
export interface PricedRefund {
  /** Exactly orderLineId, quantity (>= 1), and restock. */
  lines: OrderRefundLine[];
  /** Amounts in the same order as lines. */
  priced: PricedRefundLine[];
  /** Requests cut to availability, including unknown lines cut to zero. */
  clamped: Array<{ orderLineId: string; requestedQuantity: number; quantity: number }>;
  netMinor: number; taxMinor: number; totalMinor: number;
}

// Sold figures win when present: a store whose live line totals shrink on return still prices from the sale (medusapos#636).
function pricingBase({ totalMinor, taxMinor, soldTotalMinor, soldTaxMinor }: RefundableOrderLine): [number, number] {
  if (soldTotalMinor === undefined && soldTaxMinor === undefined) return [totalMinor, taxMinor];
  if (soldTotalMinor === undefined || soldTaxMinor === undefined || !Number.isSafeInteger(soldTotalMinor) || !Number.isSafeInteger(soldTaxMinor)) {
    throw new RangeError('A line carries both sold figures or neither, as safe integers');
  }
  return [soldTotalMinor, soldTaxMinor];
}

/** Returns the quantities and amounts still refundable, in order-line order. */
export function refundableLines(
  lines: readonly RefundableOrderLine[], refunds: readonly EarlierRefund[],
): RefundableLine[] {
  const earlier = refunds.flatMap((refund) => refund.lines);
  for (const refund of earlier) {
    if (!Number.isSafeInteger(refund.quantity)) throw new RangeError('Earlier refund quantity must be a safe integer');
  }
  return lines.map((line) => {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 0
      || !Number.isSafeInteger(line.totalMinor) || !Number.isSafeInteger(line.taxMinor)) {
      throw new RangeError('Order line values must be safe integers and quantity non-negative');
    }
    const refundedQuantity = earlier.reduce((sum, refund) => refund.orderLineId === line.id
      ? Math.min(line.quantity, sum + Math.abs(refund.quantity)) : sum, 0);
    const [netMinor, taxMinor] = pricingBase(line).map((total) => line.quantity === 0 ? 0
      : total - Number(roundRatio(BigInt(refundedQuantity) * BigInt(total), BigInt(line.quantity), 'half_up')));
    return {
      orderLineId: line.id, refundedQuantity, refundableQuantity: line.quantity - refundedQuantity, netMinor, taxMinor,
    };
  });
}

/** Prices requested quantities with cumulative shares, clamping them to what remains refundable. */
export function priceRefund(
  lines: readonly RefundableOrderLine[], refunds: readonly EarlierRefund[], request: readonly OrderRefundLine[],
): PricedRefund {
  const available = refundableLines(lines, refunds);
  const seen = new Set<string>();
  const result: PricedRefund = { lines: [], priced: [], clamped: [], netMinor: 0, taxMinor: 0, totalMinor: 0 };
  for (const { orderLineId, quantity: requestedQuantity, restock } of request) {
    if (!Number.isSafeInteger(requestedQuantity) || requestedQuantity < 0 || seen.has(orderLineId)) {
      throw new RangeError('Request quantities must be non-negative safe integers and line ids unique');
    }
    seen.add(orderLineId);
    const index = lines.findIndex((line) => line.id === orderLineId);
    const quantity = Math.min(requestedQuantity, available[index]?.refundableQuantity ?? 0);
    if (quantity < requestedQuantity) result.clamped.push({ orderLineId, requestedQuantity, quantity });
    if (quantity < 1) continue;
    const line = lines[index];
    const refundedQuantity = available[index].refundedQuantity;
    const [netMinor, taxMinor] = pricingBase(line).map((total) =>
      Number(roundRatio(BigInt(refundedQuantity + quantity) * BigInt(total), BigInt(line.quantity), 'half_up'))
      - Number(roundRatio(BigInt(refundedQuantity) * BigInt(total), BigInt(line.quantity), 'half_up')));
    const totalMinor = netMinor + taxMinor;
    result.lines.push({ orderLineId, quantity, restock });
    result.priced.push({ orderLineId, quantity, netMinor, taxMinor, totalMinor });
    result.netMinor += netMinor;
    result.taxMinor += taxMinor;
    result.totalMinor += totalMinor;
  }
  return result;
}
