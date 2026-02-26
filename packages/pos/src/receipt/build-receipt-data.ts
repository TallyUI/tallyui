import type { Order } from '../order/types';
import type { ReceiptConfig, ReceiptData } from './types';

export function buildReceiptData(order: Order, config: ReceiptConfig): ReceiptData {
  const taxByRate = new Map<number, number>();
  for (const line of order.lineItems) {
    const existing = taxByRate.get(line.taxRate) ?? 0;
    taxByRate.set(line.taxRate, existing + line.taxAmount);
  }

  const taxLines = Array.from(taxByRate.entries()).map(([rate, amount]) => ({
    label: config.taxLabels?.[rate] ?? `Tax ${Math.round(rate * 100)}%`,
    rate,
    amount: Math.round(amount * 100) / 100,
  }));

  return {
    header: {
      storeName: config.storeName,
      storeAddress: config.storeAddress,
      orderNumber: order.id,
      date: order.createdAt,
      cashier: config.cashier,
      register: config.register,
    },
    lineItems: order.lineItems.map((li) => ({
      name: li.name,
      sku: li.sku,
      quantity: li.quantity,
      unitPrice: li.price,
      lineTotal: li.lineTotal,
    })),
    discounts: order.discounts.map((d) => ({
      label: d.label ?? d.couponCode ?? `${d.type} discount`,
      amount: d.amount,
    })),
    totals: {
      subtotal: order.subtotal,
      discountTotal: order.discountTotal,
      taxLines,
      taxTotal: order.taxTotal,
      total: order.total,
    },
    payments: order.payments.map((p) => ({
      method: p.method,
      amount: p.amount,
      reference: p.reference,
    })),
    changeDue: order.changeDue,
    footer: {
      note: order.note || undefined,
      barcode: order.id,
    },
    currency: order.currency,
  };
}
