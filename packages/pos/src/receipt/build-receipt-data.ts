import type { Order } from '../order/types';
import { MICROS_PER_MINOR, roundMicrosToMinor } from '../tax/exact';
import type { ReceiptConfig, ReceiptData } from './types';

export function buildReceiptData(order: Order, config: ReceiptConfig): ReceiptData {
  const taxByRate = new Map<string, { code?: string; ratePpm: number; micros: bigint }>();
  for (const line of order.lineItems) {
    for (const tax of line.taxLines) {
      const key = JSON.stringify([tax.code ?? '', tax.ratePpm]);
      const existing = taxByRate.get(key);
      taxByRate.set(key, { code: tax.code, ratePpm: tax.ratePpm, micros: (existing?.micros ?? 0n) + BigInt(tax.taxMicros) });
    }
  }

  const groups = Array.from(taxByRate.values()).map(({ code, ratePpm, micros }) => {
    const floor = micros / MICROS_PER_MINOR - (micros < 0n && micros % MICROS_PER_MINOR !== 0n ? 1n : 0n);
    return {
      line: { label: config.taxLabels?.[ratePpm] ?? `Tax ${ratePpm / 10000}%`, code, ratePpm, amountMinor: Number(floor) },
      remainder: micros - floor * MICROS_PER_MINOR,
    };
  });
  const leftover = order.taxMinor - groups.reduce((sum, group) => sum + group.line.amountMinor, 0);
  const ranked = [...groups].sort((a, b) => a.remainder === b.remainder
    ? b.line.ratePpm - a.line.ratePpm : a.remainder > b.remainder ? -1 : 1);
  for (const group of ranked.slice(0, leftover)) group.line.amountMinor += 1;
  const taxLines = groups.map((group) => group.line);

  // Every receipt line is shown in the order's mode. A line whose price had the other mode is
  // converted by its tax share as the order total rounds it: the rounded running tax sum,
  // started from the exclusive lines the order already rounds, so the shares add up exactly.
  let taxSoFar = order.lineItems.reduce(
    (sum, li) => li.taxInclusive || li.priceTaxModeConverted ? sum : sum + BigInt(li.taxMicros), 0n);
  const lineTotals = order.lineItems.map((li) => {
    if (!li.priceTaxModeConverted) return li.netMinor;
    const share = roundMicrosToMinor(taxSoFar + BigInt(li.taxMicros)) - roundMicrosToMinor(taxSoFar);
    taxSoFar += BigInt(li.taxMicros);
    return li.taxInclusive ? li.netMinor - share : li.netMinor + share;
  });

  return {
    header: {
      storeName: config.storeName,
      storeAddress: config.storeAddress,
      orderNumber: order.id,
      date: order.createdAt,
      cashier: config.cashier,
      register: config.register,
    },
    lineItems: order.lineItems.map((li, index) => ({
      name: li.name,
      sku: li.sku,
      quantity: li.quantity,
      unitPriceMinor: li.unitPriceMinor,
      lineTotalMinor: lineTotals[index],
    })),
    discounts: order.discounts.map((d) => ({
      label: d.label ?? d.couponCode ?? `${d.type} discount`,
      amountMinor: d.amountMinor,
    })),
    totals: {
      subtotalMinor: order.subtotalMinor,
      discountMinor: order.discountMinor,
      taxLines,
      taxMinor: order.taxMinor,
      totalMinor: order.totalMinor,
    },
    payments: order.payments.map((p) => ({
      method: p.method,
      amountMinor: p.amountMinor,
      reference: p.reference,
    })),
    changeDueMinor: order.changeDueMinor,
    footer: {
      note: order.note || undefined,
      barcode: order.id,
    },
    currency: order.currency,
  };
}
