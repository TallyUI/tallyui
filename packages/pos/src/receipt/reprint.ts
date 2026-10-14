import { minorUnitDigits, woocommerceTax, type StoreOrder } from '@tallyui/core';
import type { PosOrder } from '../pos-order/types';
import { taxLinesByRate } from '../tax/exact';
import type { ReceiptConfig, ReceiptData, ReceiptLineItem } from './types';
import { RECEIPT_SCHEMA_VERSION } from './types';

/**
 * The blocks every reprint shares with `buildReceiptData`. `fiscal.reprint_count` is this reprint's ordinal, starting
 * at 1: the app passes `fiscal: { reprint_count: n }` for its n-th reprint.
 */
function reprintBlocks(config: ReceiptConfig, customer: { name?: string; email?: string } | null) {
  const name = customer?.name || customer?.email;
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    software: { name: 'WCPOS', plugin_version: '', app_version: '', app_build: '', platform: '', ...config.software },
    register: { id: config.register ?? '', name: config.registerName ?? '' },
    fiscal: { document_type: 'sale' as const, is_reprint: true, reprint_count: 1, qr_payload: '', ...config.fiscal },
    header: {
      storeName: config.storeName, storeAddress: config.storeAddress, cashier: config.cashier,
      ...(name ? { customer: name } : {}), register: config.register,
    },
  };
}

const sum = (amounts: number[]) => amounts.reduce((total, amount) => total + amount, 0);

/** Receipt data for reprinting the till's own stored order (ADR-081). */
export function buildReceiptDataFromPosOrder(order: PosOrder, config: ReceiptConfig): ReceiptData {
  const { header, ...blocks } = reprintBlocks(config, order.customer);
  const { display, taxRounding: rounding } = order;
  const dp = minorUnitDigits(order.currency), factor = 10 ** dp;
  // A WooCommerce line's rounded gross (its builder `totalMinor`), as woocommerce-tax.ts lineAmounts computes it from
  // the 6dp net and per-rate taxes, read back from the stored micros as woocommerceTotals reads them (ADR-076).
  const wooGrossMinor = (line: PosOrder['lines'][number], roundAtSubtotal: boolean) => {
    const tax = line.taxLines.reduce((sum, row) => sum + (roundAtSubtotal ? Number(row.taxMicros) / (factor * 1e6)
      : woocommerceTax.roundTaxTotal(Number(row.taxMicros) / (factor * 1e6), dp, order.pricesIncludeTax)), 0);
    return Math.round(woocommerceTax.roundHalfUp(Number(line.netMicros) / (factor * 1e6) + tax, dp) * factor);
  };
  const lineItems = order.lines.map((line): ReceiptLineItem => {
    const displayLine = display?.lines.find((row) => row.lineId === line.id);
    const displayAmountMinor = display ? displayLine?.amountMinor ?? 0 : line.unitPriceMinor * line.quantity;
    const displayDiscounts = display
      ? (displayLine?.discounts ?? []).map((d) => ({ label: d.label ?? 'Discount', amountMinor: d.amountMinor }))
      : line.discountMinor > 0 ? [{ label: 'Discount', amountMinor: line.discountMinor }] : [];
    return {
      name: line.name,
      ...(line.attributes && Object.keys(line.attributes).length ? { attributes: { ...line.attributes } } : {}),
      sku: line.sku,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      lineTotalMinor: rounding.granularity === 'woocommerce' && line.netMicros !== undefined
        ? order.pricesIncludeTax ? wooGrossMinor(line, rounding.roundAtSubtotal) : line.netMinor
        // A converted line (ADR-038 amendment): the stored order no longer carries its conversion share.
        : line.taxInclusive !== undefined ? displayAmountMinor - line.discountMinor : line.netMinor,
      ...(line.discountMinor > 0 ? { discountMinor: line.discountMinor } : {}),
      displayAmountMinor,
      displayDiscounts,
    };
  });
  // Without taxByRate (finalized below order.create v3), the rows are computed as buildReceiptData computes them. A line's
  // taxInclusive is stored only when it differs from the order's mode; WooCommerce lines take the order's, as there.
  const taxedLines = [...order.lines.map((line) => ({ ...line, taxInclusive: order.taxRounding.granularity === 'woocommerce'
    && line.netMicros !== undefined ? order.pricesIncludeTax : line.taxInclusive ?? order.pricesIncludeTax })),
  ...[...(order.fees ?? []), ...(order.shipping ?? [])].map((charge) => ({ ...charge, taxInclusive: order.pricesIncludeTax }))];
  const taxLines = order.taxByRate ? order.taxByRate.map((row) => ({
    label: row.label ?? config.taxLabels?.[row.ratePpm] ?? '', code: row.code, ratePpm: row.ratePpm, amountMinor: row.amountMinor,
  })) : taxLinesByRate(taxedLines, order.taxMinor, config.taxLabels, order.taxRounding)
    .map(({ label, code, ratePpm, amountMinor }) => ({ label, code, ratePpm, amountMinor }));
  const charges = (rows: Array<{ name: string; amountMinor: number }> | undefined) =>
    (rows ?? []).map(({ name, amountMinor }) => ({ name, amountMinor }));

  return {
    ...blocks,
    header: { ...header, orderNumber: order.serverRefs?.displayId ?? order.id, date: order.createdAt },
    lineItems,
    discounts: display ? [...display.orderDiscountMinor > 0 ? [{ label: 'Order discount', amountMinor: display.orderDiscountMinor }] : [],
      ...(display.coupons ?? []).map(({ code, amountMinor }) => ({ label: code, amountMinor }))] : [],
    fees: charges(display ? display.fees : order.fees),
    shipping: charges(display ? display.shipping : order.shipping),
    orderDiscountMinor: display ? display.orderDiscountMinor : 0,
    totals: display
      ? {
        taxInclusive: display.taxInclusive, subtotalMinor: display.subtotalMinor, discountMinor: display.discountMinor,
        taxLines, taxMinor: display.taxMinor, totalMinor: display.totalMinor,
      }
      : {
        taxInclusive: order.pricesIncludeTax,
        subtotalMinor: sum(lineItems.map((line) => line.displayAmountMinor)),
        discountMinor: sum(order.lines.map((line) => line.discountMinor)),
        taxLines, taxMinor: order.taxMinor, totalMinor: order.totalMinor,
      },
    payments: order.payments.map((p) => ({ method: p.method, amountMinor: p.tenderedMinor ?? p.amountMinor, reference: p.reference })),
    changeDueMinor: sum(order.payments.map((p) => p.changeMinor ?? 0)),
    footer: { note: order.note || undefined, barcode: order.id },
    currency: order.currency,
  };
}

/** Receipt data for reprinting an order read from the store with `getOrders`/`listOrders` (ADR-081). */
export function buildReceiptDataFromStoreOrder(order: StoreOrder, config: ReceiptConfig): ReceiptData {
  const { header, ...blocks } = reprintBlocks(config, order.customer);
  const gross = (net: number, tax: number) => order.pricesIncludeTax ? net + tax : net;
  const lineItems = order.lines.map((line): ReceiptLineItem => {
    const displayAmountMinor = gross(line.subtotalMinor, line.subtotalTaxMinor);
    const lineTotalMinor = gross(line.totalMinor, line.taxMinor);
    const discount = displayAmountMinor - lineTotalMinor;
    return {
      name: line.name,
      sku: line.sku ?? '',
      quantity: line.quantity,
      unitPriceMinor: line.quantity === 0 ? 0 : Math.round(displayAmountMinor / line.quantity),
      lineTotalMinor,
      ...(discount > 0 ? { discountMinor: discount } : {}),
      displayAmountMinor,
      displayDiscounts: discount > 0 ? [{ label: 'Discount', amountMinor: discount }] : [],
    };
  });
  const charges = (rows: StoreOrder['fees']) => rows.map(({ name, totalMinor, taxMinor }) => ({ name, amountMinor: gross(totalMinor, taxMinor) }));

  return {
    ...blocks,
    header: { ...header, orderNumber: order.reference, date: order.placedAt },
    lineItems,
    discounts: order.coupons.map(({ code, discountMinor, discountTaxMinor }) => ({ label: code, amountMinor: gross(discountMinor, discountTaxMinor) })),
    fees: charges(order.fees),
    shipping: charges(order.shipping),
    orderDiscountMinor: 0,
    totals: {
      taxInclusive: order.pricesIncludeTax,
      subtotalMinor: sum(lineItems.map((line) => line.displayAmountMinor)),
      discountMinor: sum(lineItems.map((line) => line.discountMinor ?? 0)),
      taxLines: order.taxLines.map(({ label, code, ratePpm, amountMinor }) => ({ label, ...(code !== undefined ? { code } : {}), ratePpm, amountMinor })),
      taxMinor: order.taxMinor, totalMinor: order.totalMinor,
    },
    payments: order.payments.map((p) => ({ method: p.kind ?? p.title ?? p.method, amountMinor: p.amountMinor })),
    changeDueMinor: 0,
    footer: { barcode: order.reference },
    currency: order.currency,
  };
}
