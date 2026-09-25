import type { Discount, Order } from '../order/types';
import { roundMicrosToMinor, taxLinesByRate } from '../tax/exact';
import type { ReceiptConfig, ReceiptData } from './types';

export function buildReceiptData(order: Order, config: ReceiptConfig): ReceiptData {
  // Drops the shared helper's `netMinor` (the Z report's own use): the receipt's tax summary
  // never showed it, and an exact-shape test elsewhere in this package pins that.
  const taxLines = taxLinesByRate(order.lineItems, order.taxMinor, config.taxLabels).map(
    ({ label, code, ratePpm, amountMinor }) => ({ label, code, ratePpm, amountMinor }),
  );

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
  const label = (d: Discount) => d.label ?? d.couponCode ?? `${d.type} discount`;

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
      // Line plus allocated order discounts, in the line's own mode; lineTotalMinor is already after it (ADR-062).
      ...(li.discountMinor > 0 ? { discountMinor: li.discountMinor } : {}),
      displayAmountMinor: order.display.lines[index].amountMinor,
      displayDiscounts: order.display.lines[index].discounts.map((row, i) => ({ label: label(li.discounts[i]), amountMinor: row.amountMinor })),
    })),
    discounts: order.discounts.map((d) => ({
      label: label(d),
      amountMinor: d.amountMinor,
    })),
    orderDiscountMinor: order.display.orderDiscountMinor,
    totals: {
      taxInclusive: order.display.taxInclusive,
      subtotalMinor: order.display.subtotalMinor,
      discountMinor: order.display.discountMinor,
      taxLines,
      taxMinor: order.display.taxMinor,
      totalMinor: order.display.totalMinor,
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
