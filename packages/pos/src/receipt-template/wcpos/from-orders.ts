// TallyUI's three printable orders as a WcposReceiptSource. The field-by-field mapping is the #698 part B mapping;
// every figure stays in integer minor units, and nothing the order does not carry is invented.
import { paymentMethodOf, type StoreOrder } from '@tallyui/core';
import type { ChargeLine, SentOrder } from '../../order/types';
import type { PosOrder } from '../../pos-order/types';
import { buildReceiptData } from '../../receipt/build-receipt-data';
import { buildReceiptDataFromPosOrder } from '../../receipt/reprint';
import type { ReceiptConfig, ReceiptData } from '../../receipt/types';
import { wooGrossMinor } from '../../receipt/woo-gross';
import { roundMicrosToMinor, taxMicros } from '../../tax/exact';
import type { WcposItemTaxSource, WcposLineSource, WcposReceiptSource } from './types';

type Rate = { code?: string; ratePpm: number; compound?: boolean };
type MicrosRate = Rate & { taxMicros: string };
type RateKey = (rate: Rate) => string;

/**
 * The key that joins a line's `taxes[].rateId` to `taxLines[].rateId`: the plain code when, in this order, every
 * distinct (code, rate) pair has its own non-empty code; otherwise `JSON.stringify([code, ratePpm])` for every rate,
 * which is the grouping `taxLinesByRate` uses. The WooCommerce `rateId` is not used: the rows lose it
 * (`woocommerceTaxByRate` drops it), and whether a stored PosOrder line keeps it is unverified (its schema does not
 * declare it).
 */
function rateKeyOf(rates: Rate[]): RateKey {
  const codes = new Map(rates.map((rate) => [JSON.stringify([rate.code ?? '', rate.ratePpm]), rate.code ?? '']));
  const list = [...codes.values()];
  const plain = list.every((code) => code !== '') && new Set(list).size === list.length;
  return (rate) => (plain ? rate.code! : JSON.stringify([rate.code ?? '', rate.ratePpm]));
}

const sumTax = (rates: MicrosRate[]) => roundMicrosToMinor(rates.reduce((total, rate) => total + BigInt(rate.taxMicros), 0n));
const itemTaxes = (rates: MicrosRate[], key: RateKey): WcposItemTaxSource[] =>
  rates.map((rate) => ({ rateId: key(rate), totalMinor: roundMicrosToMinor(BigInt(rate.taxMicros)) }));

/** A till line, its tax mode and WooCommerce gross already resolved by the order's adapter. */
interface TillLine {
  name: string; sku: string; quantity: number; unitPriceMinor: number; regularUnitPriceMinor?: number;
  taxStatus?: 'taxable' | 'none'; attributes?: Record<string, string>; netMinor: number; taxLines: MicrosRate[];
  /** The price's own tax mode, and whether it differs from the order's. */
  inclusive: boolean; converted: boolean;
  /** Under WooCommerce (netMicros present): the rounded gross. `netMinor` is then exclusive whatever the mode. */
  wooGrossMinor?: number;
  /** A converted line's total in the order's mode, from TallyUI's receipt (its running tax share). */
  convertedTotalMinor?: number;
  /** A converted line's pre-discount amount in the order's mode: TallyUI's display amount, residue included (§2.4). */
  displayAmountMinor?: number;
}

function tillLine(line: TillLine, key: RateKey): WcposLineSource {
  // No pre-discount tax is stored: the subtotal's tax is the gross converted at the line's rates. The unit price is in
  // its own mode even under WooCommerce, so that mode converts it. A converted line takes TallyUI's display amount, in
  // the order's mode, so the subtotals add up to its receipt's rather than a cent off by the residue.
  const display = line.converted && line.displayAmountMinor !== undefined;
  const gross = display ? line.displayAmountMinor! : line.unitPriceMinor * line.quantity;
  const grossInclusive = display ? !line.inclusive : line.inclusive;
  const ratePpm = line.taxLines.reduce((total, rate) => total + rate.ratePpm, 0);
  const subtotalTaxMinor = roundMicrosToMinor(taxMicros(gross, ratePpm, grossInclusive));
  let totalMinor: number, totalTaxMinor: number;
  if (line.wooGrossMinor !== undefined) {
    // The WooCommerce lane first: its figures are an exclusive net and a rounded gross, never the line's own mode.
    totalMinor = line.netMinor;
    totalTaxMinor = line.wooGrossMinor - line.netMinor;
  } else {
    // A converted line's tax is its running share, so the lines add up to the order total as TallyUI's receipt does.
    const share = line.convertedTotalMinor === undefined ? undefined
      : line.inclusive ? line.netMinor - line.convertedTotalMinor : line.convertedTotalMinor - line.netMinor;
    totalTaxMinor = share ?? sumTax(line.taxLines);
    totalMinor = line.inclusive ? line.netMinor - totalTaxMinor : line.netMinor;
  }
  return {
    name: line.name, sku: line.sku, quantity: line.quantity,
    subtotalMinor: grossInclusive ? gross - subtotalTaxMinor : gross, subtotalTaxMinor, totalMinor, totalTaxMinor,
    meta: Object.entries(line.attributes ?? {}).map(([name, value]) => ({ key: name, value })),
    // The recorded prices are in the line's own mode, which build.ts reads as the sale's: kept only when they agree.
    ...(!line.converted && line.regularUnitPriceMinor !== undefined ? {
      recordedPrice: {
        priceMinor: line.unitPriceMinor, regularPriceMinor: line.regularUnitPriceMinor,
        ...(line.taxStatus ? { taxStatus: line.taxStatus } : {}),
      },
    } : {}),
    taxes: itemTaxes(line.taxLines, key),
  };
}

/** A till fee or shipping charge, in the order's mode; WooCommerce charges keep their net and rounded gross. */
function tillCharge(charge: ChargeLine, order: { pricesIncludeTax: boolean; woo: boolean }, key: RateKey) {
  const tax = sumTax(charge.taxLines);
  const woo = order.woo && charge.netMicros !== undefined;
  return {
    totalMinor: woo || !order.pricesIncludeTax ? charge.netMinor : charge.netMinor - tax,
    totalTaxMinor: woo ? charge.totalMinor! - charge.netMinor : tax, taxes: itemTaxes(charge.taxLines, key),
  };
}

type TillOrder = Pick<SentOrder, 'currency' | 'pricesIncludeTax' | 'taxRounding' | 'totalMinor' | 'taxMinor'> & {
  fees?: ChargeLine[]; shipping?: Array<ChargeLine & { methodId?: string }>;
  coupons?: Array<{ code: string; discountMinor: number; discountTaxMinor: number }>;
  customer: { id?: string; name?: string; email?: string } | null;
};

/** What SentOrder and PosOrder share. The status is `completed`: a till order is paid in full when it is sent. */
function tillSource(order: TillOrder, receipt: ReceiptData, lines: TillLine[]) {
  const woo = order.taxRounding?.granularity === 'woocommerce';
  const charges = [...order.fees ?? [], ...order.shipping ?? []];
  const rates: Rate[] = [...receipt.totals.taxLines, ...lines.flatMap((line) => line.taxLines),
    ...charges.flatMap((charge) => charge.taxLines)];
  const key = rateKeyOf(rates);
  const context = { pricesIncludeTax: order.pricesIncludeTax, woo };
  return {
    status: 'completed', currency: order.currency, pricesIncludeTax: order.pricesIncludeTax,
    customer: order.customer && { id: order.customer.id, firstName: order.customer.name, email: order.customer.email },
    lines: lines.map((line) => tillLine(line, key)),
    fees: (order.fees ?? []).map((fee) => ({ name: fee.name, ...tillCharge(fee, context, key) })),
    shipping: (order.shipping ?? []).map((row) => ({
      methodTitle: row.name, ...(row.methodId !== undefined ? { methodId: row.methodId } : {}), ...tillCharge(row, context, key),
    })),
    // Store-priced and WooCommerce coupons are listed; the line discounts already hold them, so no discountTotalMinor.
    coupons: (order.coupons ?? []).map(({ code, discountMinor, discountTaxMinor }) => ({ code, discountMinor, discountTaxMinor })),
    // The rows TallyUI's own receipt prints, labels included (config.taxLabels, else `Tax n%`).
    taxLines: receipt.totals.taxLines.map((row) => ({
      rateId: key(row), label: row.label, ...(row.code !== undefined ? { rateCode: row.code } : {}),
      ratePercent: row.ratePpm / 10000,
      ...(rates.some((rate) => rate.compound && key(rate) === key(row)) ? { compound: true } : {}),
      taxTotalMinor: row.amountMinor, shippingTaxTotalMinor: 0,
    })),
    totalMinor: order.totalMinor, totalTaxMinor: order.taxMinor,
  };
}

const methodTitle = (method: string) => (method === 'cash' || method === 'external' ? paymentMethodOf(method).title : method);

/** The first print of a sale, from the order as sent. */
export function wcposSourceFromSentOrder(order: SentOrder, config: ReceiptConfig): WcposReceiptSource {
  const receipt = buildReceiptData(order, config);
  const woo = order.taxRounding?.granularity === 'woocommerce';
  const lines = order.lineItems.map((li, index): TillLine => ({
    ...li, inclusive: li.taxInclusive, converted: li.priceTaxModeConverted !== undefined,
    displayAmountMinor: receipt.lineItems[index]!.displayAmountMinor,
    ...(woo && li.netMicros !== undefined ? { wooGrossMinor: li.totalMinor! }
      : li.priceTaxModeConverted ? { convertedTotalMinor: receipt.lineItems[index]!.lineTotalMinor } : {}),
  }));
  return {
    id: order.id, number: order.id, createdAt: order.createdAt, customerNote: order.note, ...tillSource(order, receipt, lines),
    // Cash records the full tender; the change is the order's.
    payments: order.payments.map((p) => ({
      methodId: p.method, methodTitle: methodTitle(p.method), amountMinor: p.amountMinor,
      ...(p.reference !== undefined ? { transactionId: p.reference } : {}),
    })),
    changeMinor: order.changeDueMinor,
  };
}

/** A reprint of the till's own stored order. */
export function wcposSourceFromPosOrder(order: PosOrder, config: ReceiptConfig): WcposReceiptSource {
  const receipt = buildReceiptDataFromPosOrder(order, config);
  const rounding = order.taxRounding;
  const lines = order.lines.map((li, index): TillLine => ({
    ...li, inclusive: li.taxInclusive ?? order.pricesIncludeTax, converted: li.taxInclusive !== undefined,
    displayAmountMinor: receipt.lineItems[index]!.displayAmountMinor,
    ...(rounding.granularity === 'woocommerce' && li.netMicros !== undefined
      ? { wooGrossMinor: wooGrossMinor(li, order, rounding.roundAtSubtotal) }
      : li.taxInclusive !== undefined ? { convertedTotalMinor: receipt.lineItems[index]!.lineTotalMinor } : {}),
  }));
  return {
    id: order.id, number: order.serverRefs?.displayId ?? order.id, createdAt: order.createdAt, customerNote: order.note ?? '',
    ...tillSource(order, receipt, lines),
    // A stored cash leg is net of change: the tender is what was handed over.
    payments: order.payments.map((p) => ({
      methodId: p.method, methodTitle: methodTitle(p.method), amountMinor: p.tenderedMinor ?? p.amountMinor,
      ...(p.reference !== undefined ? { transactionId: p.reference } : {}),
      ...(p.tenderedMinor !== undefined ? { tenderedMinor: p.tenderedMinor } : {}),
      ...(p.changeMinor !== undefined ? { changeMinor: p.changeMinor } : {}),
    })),
    changeMinor: order.payments.reduce((total, p) => total + (p.changeMinor ?? 0), 0),
    ...(order.registerId !== undefined ? { registerId: order.registerId } : {}),
  };
}

/** A reprint of an order read from the store. Per-rate line taxes exist only when the order has one rate. */
export function wcposSourceFromStoreOrder(order: StoreOrder, _config: ReceiptConfig): WcposReceiptSource {
  const key = rateKeyOf(order.taxLines);
  const only = order.taxLines.length === 1 ? key(order.taxLines[0]!) : undefined;
  return {
    id: order.id, number: order.reference, currency: order.currency, status: order.status, createdAt: order.placedAt,
    customerNote: '', pricesIncludeTax: order.pricesIncludeTax,
    customer: order.customer && { id: order.customer.id, firstName: order.customer.name, email: order.customer.email },
    lines: order.lines.map((li) => ({
      name: li.name, sku: li.sku, quantity: li.quantity, subtotalMinor: li.subtotalMinor,
      subtotalTaxMinor: li.subtotalTaxMinor, totalMinor: li.totalMinor, totalTaxMinor: li.taxMinor,
      ...(only !== undefined ? { taxes: [{ rateId: only, totalMinor: li.taxMinor }] } : {}),
    })),
    fees: order.fees.map((fee) => ({ name: fee.name, totalMinor: fee.totalMinor, totalTaxMinor: fee.taxMinor })),
    shipping: order.shipping.map((row) => ({ methodTitle: row.name, totalMinor: row.totalMinor, totalTaxMinor: row.taxMinor })),
    coupons: order.coupons.map(({ code, discountMinor, discountTaxMinor }) => ({ code, discountMinor, discountTaxMinor })),
    taxLines: order.taxLines.map((row) => ({
      rateId: key(row), label: row.label, ...(row.code !== undefined ? { rateCode: row.code } : {}),
      ratePercent: row.ratePpm / 10000, taxTotalMinor: row.amountMinor, shippingTaxTotalMinor: 0,
    })),
    totalMinor: order.totalMinor, totalTaxMinor: order.taxMinor,
    discountTotalMinor: order.discountMinor, discountTaxMinor: order.discountTaxMinor,
    payments: order.payments.map((p) => ({ methodId: p.method, methodTitle: p.title ?? p.method, amountMinor: p.amountMinor })),
  };
}
