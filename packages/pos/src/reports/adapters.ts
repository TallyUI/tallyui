import { legMethodId, type StoreOrder } from '@tallyui/core';
import { tillPayments } from '../pos-order/till-payments';
import type { PosOrder } from '../pos-order/types';
import type { PosRefund } from '../refund/pos-refund';
import { roundMicrosToMinor, taxLinesByRate } from '../tax/exact';
import { recordedTaxByRate, taxedLinesFor } from '../tax/taxed-lines';
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

export function reportOrderFromPosOrder(order: PosOrder, join?: LineJoin, methodTitle?: (methodId: string) => string | undefined): ReportOrder {
  const taxedLines = taxedLinesFor(order.lines, [...(order.fees ?? []), ...(order.shipping ?? [])], order.pricesIncludeTax, order.taxRounding);
  const taxes = recordedTaxByRate(order) ?? taxLinesByRate(taxedLines, order.taxMinor, undefined, order.taxRounding);
  const till = tillPayments(order.payments);
  const amountOf = (payments: readonly { amountMinor: number }[]) => payments.reduce((total, payment) => total + payment.amountMinor, 0);
  const roundingMinor = (order.cashRoundings ?? []).reduce((total, entry) => total + entry.minor, 0);
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
    payments: till.map((payment) => {
      const method = legMethodId(payment);
      // The title is looked up by the platform's own id, never the kind+id key; an id the host cannot name labels itself.
      const label = payment.methodId !== undefined && payment.methodId !== payment.method ? methodTitle?.(payment.methodId) ?? payment.methodId : undefined;
      return { method, ...(label ? { label } : {}), amountMinor: payment.amountMinor };
    }),
    ...(order.storeOrderId !== undefined ? { paidEarlierMinor: amountOf(order.payments) - amountOf(till) } : {}),
    ...(roundingMinor !== 0 ? { roundingMinor } : {}),
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
