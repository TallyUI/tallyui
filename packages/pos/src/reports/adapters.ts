import type { StoreOrder } from '@tallyui/core';
import type { PosOrder } from '../pos-order/types';
import type { PosRefund } from '../refund/pos-refund';
import { roundMicrosToMinor, taxLinesByRate } from '../tax/exact';
import type { LineJoin, ReportLine, ReportOrder, ReportRefund } from './types';

function joinedLine(line: { productId?: string; variantId?: string; quantity: number }, join?: LineJoin): Pick<ReportLine, 'costMinor' | 'category'> {
  const answer = join?.({
    ...(line.productId !== undefined ? { productId: line.productId } : {}),
    ...(line.variantId !== undefined ? { variantId: line.variantId } : {}),
  });
  return {
    ...(typeof answer?.unitCostMinor === 'number' && Number.isFinite(answer.unitCostMinor)
      ? { costMinor: Math.round(answer.unitCostMinor * line.quantity) } : {}),
    ...(answer?.category ? { category: answer.category } : {}),
  };
}

export function reportOrderFromPosOrder(order: PosOrder, join?: LineJoin): ReportOrder {
  const taxedLines = [...order.lines.map((line) => ({ ...line, taxInclusive: order.taxRounding.granularity === 'woocommerce'
    && line.netMicros !== undefined ? order.pricesIncludeTax : line.taxInclusive ?? order.pricesIncludeTax })),
  ...[...(order.fees ?? []), ...(order.shipping ?? [])].map((charge) => ({ ...charge, taxInclusive: order.pricesIncludeTax }))];
  const taxes = order.taxByRate ?? taxLinesByRate(taxedLines, order.taxMinor, undefined, order.taxRounding);
  return {
    id: order.id, at: order.createdAt, totalMinor: order.totalMinor, taxMinor: order.taxMinor,
    discountMinor: order.discountMinor, needsPayment: false, refunds: [],
    lines: order.lines.map((line) => {
      const taxMinor = roundMicrosToMinor(line.taxLines.reduce((sum, tax) => sum + BigInt(tax.taxMicros), 0n));
      return {
        key: line.variantId || line.productId || line.name, name: line.name, quantity: line.quantity,
        netMinor: order.taxRounding.granularity === 'woocommerce' && line.netMicros !== undefined
          ? line.netMinor
          : (line.taxInclusive ?? order.pricesIncludeTax) ? line.netMinor - taxMinor : line.netMinor,
        taxMinor, ...joinedLine(line, join),
      };
    }),
    payments: order.payments.map(({ method, amountMinor }) => ({ method, amountMinor })),
    taxes: taxes.map((row) => ({
      ratePpm: row.ratePpm, ...(row.code !== undefined ? { code: row.code } : {}),
      label: row.label ?? `Tax ${row.ratePpm / 10000}%`, taxMinor: row.amountMinor, netMinor: row.netMinor,
    })),
  };
}

export function reportOrderFromStoreOrder(order: StoreOrder, join?: LineJoin): ReportOrder {
  return {
    id: order.id, at: order.placedAt, totalMinor: order.totalMinor, taxMinor: order.taxMinor, discountMinor: order.discountMinor,
    lines: order.lines.map((line) => ({
      key: line.variantId || line.productId || line.name, name: line.name, quantity: line.quantity,
      netMinor: line.totalMinor, taxMinor: line.taxMinor, ...joinedLine(line, join),
    })),
    payments: order.payments.map(({ method, title, amountMinor }) => ({ method, ...(title !== undefined ? { label: title } : {}), amountMinor })),
    taxes: order.taxLines.map(({ ratePpm, code, label, amountMinor }) => ({
      ratePpm, ...(code !== undefined ? { code } : {}), label, taxMinor: amountMinor, netMinor: null,
    })),
    refunds: order.refunds.map(({ id, amountMinor }) => ({ id, amountMinor })),
  };
}

export function reportRefundFromPosRefund(refund: PosRefund): ReportRefund | undefined {
  if (refund.status !== 'applied') return undefined;
  return {
    id: refund.id, orderId: refund.orderId, at: refund.envelope.payload.createdAt || refund.createdAt,
    amountMinor: refund.result && Number.isSafeInteger(refund.result.totalMinor)
      ? refund.result.totalMinor : refund.envelope.payload.totalMinor,
  };
}
