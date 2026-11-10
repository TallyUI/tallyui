import { formatMoney } from '@tallyui/core';
import type { ReceiptData } from '../receipt/types';

export interface ReceiptTemplateRow { label: string; amount: string }
export interface ReceiptTemplateLine {
  name: string;
  /** `Name: value` per variant option, in `attributes` order. */
  options: { text: string }[];
  /** `<quantity> × <unit price>`. */
  detail: string;
  /** displayAmountMinor, before any discount. */
  amount: string;
  /** The line's own displayDiscounts; amount carries a leading `−`. */
  discounts: ReceiptTemplateRow[];
}
export interface ReceiptTemplateData {
  store: { name: string; addressLines: { line: string }[] };
  document: { title: string; isReprint: boolean; reprintCount: number };
  order: { number: string; date: string };
  cashier: string;
  register: string;
  customer: string;
  lines: ReceiptTemplateLine[];
  subtotal: string;
  lineDiscount: string;
  orderDiscount: string;
  charges: ReceiptTemplateRow[];
  taxes: ReceiptTemplateRow[];
  total: string;
  payments: { method: string; amount: string; reference: string }[];
  change: string;
  note: string;
  qrPayload: string;
}
export interface ReceiptTemplateOptions {
  /** Default: formatMoney({ amount: minor, currency }) ?? ''. */
  formatMoney?: (minor: number, currency: string) => string;
  /** Default: Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
   * an unparseable date is returned as given. */
  formatDate?: (iso: string) => string;
  /** Default: 'cash' → 'Cash', 'external' → 'Card terminal', anything else as given. */
  paymentLabel?: (method: string) => string;
}

export function receiptTemplateData(receipt: ReceiptData, options: ReceiptTemplateOptions = {}): ReceiptTemplateData {
  const money = (minor: number) => options.formatMoney
    ? options.formatMoney(minor, receipt.currency) : formatMoney({ amount: minor, currency: receipt.currency }) ?? '';
  const date = options.formatDate ?? ((iso: string) => {
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? iso
      : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
  });
  const paymentLabel = options.paymentLabel ?? ((method: string) =>
    method === 'cash' ? 'Cash' : method === 'external' ? 'Card terminal' : method);
  const titles = {
    sale: 'Receipt', refund: 'Refund', void: 'Void', cancellation: 'Cancellation', closure: 'Z report', x_report: 'X report',
  };
  const { header, fiscal, totals } = receipt;
  const lineDiscountMinor = totals.discountMinor - receipt.orderDiscountMinor;
  return {
    store: {
      name: header.storeName,
      addressLines: (header.storeAddress ?? '').split('\n').map((line) => line.trim())
        .filter((line) => line !== '').map((line) => ({ line })),
    },
    document: { title: titles[fiscal.document_type], isReprint: fiscal.is_reprint, reprintCount: fiscal.reprint_count },
    order: { number: header.orderNumber, date: date(header.date) },
    cashier: header.cashier ?? '',
    register: receipt.register.name,
    customer: header.customer ?? '',
    lines: receipt.lineItems.map((line) => ({
      name: line.name,
      options: Object.entries(line.attributes ?? {}).map(([name, value]) => ({ text: `${name}: ${value}` })),
      detail: `${line.quantity} × ${money(line.unitPriceMinor)}`,
      amount: money(line.displayAmountMinor),
      discounts: line.displayDiscounts.map((discount) => ({
        label: discount.label, amount: `−${money(discount.amountMinor)}`,
      })),
    })),
    subtotal: money(totals.subtotalMinor),
    lineDiscount: lineDiscountMinor > 0 ? `−${money(lineDiscountMinor)}` : '',
    orderDiscount: receipt.orderDiscountMinor > 0 ? `−${money(receipt.orderDiscountMinor)}` : '',
    charges: [...receipt.fees, ...receipt.shipping].map((charge) => ({
      label: charge.name, amount: money(charge.amountMinor),
    })),
    taxes: totals.taxLines.map((tax) => ({
      label: (totals.taxInclusive ? 'incl. ' : '') + tax.label, amount: money(tax.amountMinor),
    })),
    total: money(totals.totalMinor),
    payments: receipt.payments.map((payment) => ({
      method: paymentLabel(payment.method), amount: money(payment.amountMinor), reference: payment.reference ?? '',
    })),
    change: receipt.changeDueMinor > 0 ? money(receipt.changeDueMinor) : '',
    note: receipt.footer.note ?? '',
    qrPayload: fiscal.qr_payload,
  };
}
