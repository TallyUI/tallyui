import type { Discount, SentOrder } from '../order/types';
import { roundMicrosToMinor, taxLinesByRate } from '../tax/exact';
import type { ReceiptConfig, ReceiptData } from './types';

export function buildReceiptData(order: SentOrder, config: ReceiptConfig): ReceiptData {
  // Drops the shared helper's `netMinor` (the Z report's own use): the receipt's tax summary
  // never showed it, and an exact-shape test elsewhere in this package pins that.
  const taxedLines = [...order.lineItems.map((line) => order.taxRounding?.granularity === 'woocommerce' && line.netMicros !== undefined
    ? { ...line, taxInclusive: order.pricesIncludeTax } : line), ...[...(order.fees ?? []), ...(order.shipping ?? [])].map((charge) => ({
    ...charge, taxInclusive: order.pricesIncludeTax,
  }))];
  const taxLines = taxLinesByRate(taxedLines, order.taxMinor, config.taxLabels, order.taxRounding).map(
    ({ label, code, ratePpm, amountMinor }) => ({ label, code, ratePpm, amountMinor }),
  );

  // Every receipt line is shown in the order's mode. A line whose price had the other mode is
  // converted by its tax share as the order total rounds it: the rounded running tax sum,
  // started from the exclusive lines the order already rounds, so the shares add up exactly.
  let taxSoFar = order.lineItems.reduce(
    (sum, li) => li.taxInclusive || li.priceTaxModeConverted ? sum : sum + BigInt(li.taxMicros), 0n);
  const lineTotals = order.lineItems.map((li) => {
    if (order.taxRounding?.granularity === 'woocommerce' && li.netMicros !== undefined) return order.pricesIncludeTax ? li.totalMinor! : li.netMinor;
    if (!li.priceTaxModeConverted) return li.netMinor;
    const share = roundMicrosToMinor(taxSoFar + BigInt(li.taxMicros)) - roundMicrosToMinor(taxSoFar);
    taxSoFar += BigInt(li.taxMicros);
    return li.taxInclusive ? li.netMinor - share : li.netMinor + share;
  });
  const label = (d: Discount) => d.label ?? d.couponCode ?? `${d.type} discount`;
  const customer = order.customer?.name || order.customer?.email;

  return {
    header: {
      storeName: config.storeName,
      storeAddress: config.storeAddress,
      orderNumber: order.id,
      date: order.createdAt,
      cashier: config.cashier,
      ...(customer ? { customer } : {}),
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
    fees: (order.display.fees ?? []).map(({ name, amountMinor }) => ({ name, amountMinor })),
    shipping: (order.display.shipping ?? []).map(({ name, amountMinor }) => ({ name, amountMinor })),
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
