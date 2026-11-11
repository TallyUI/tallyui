// Ported from WCPOS v2 build-receipt-data.ts and the canonical branch of map-receipt-data.ts
// (wcpos/monorepo 85ecbd43f, MIT). One function gives what v2's mapReceiptData(buildReceiptData(...)) gives,
// from minor units instead of a WooCommerce order, with the gap fixes marked "Gap §5.x".
import { minorUnitDigits } from '@tallyui/core';
import type {
  WcposItemTax, WcposItemTaxSource, WcposLineSource, WcposReceiptData, WcposReceiptDate, WcposReceiptLine,
  WcposReceiptOptions, WcposReceiptSource, WcposReceiptStore, WcposTaxId, WcposTaxSummaryRow, WcposTri,
} from './types';

/** v2's isCompletingStatus list: an order in one of these needs no payment, as WC_Order::needs_payment(). */
const COMPLETING_STATUSES = ['completed', 'processing', 'refunded'];

const DATE_KEYS: ReadonlyArray<keyof WcposReceiptDate> = [
  'datetime', 'date', 'time', 'datetime_short', 'datetime_long', 'datetime_full', 'date_short', 'date_long',
  'date_full', 'date_ymd', 'date_dmy', 'date_mdy', 'weekday_short', 'weekday_long', 'day', 'month',
  'month_short', 'month_long', 'year',
];

const STAMP_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
};

type Pair = { incl: number | null; excl: number | null };
type Side = 'incl' | 'excl';

/** A date block with only `datetime` set, as a locally built receipt has it. */
function dateBlock(datetime = ''): WcposReceiptDate {
  const block = {} as WcposReceiptDate;
  for (const key of DATE_KEYS) block[key] = '';
  block.datetime = datetime;
  return block;
}

/** `Sep 11, 2026, 10:30 AM`, in `timeZone` when given. Throws a RangeError for a bad zone or date. */
function stamp(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-US', timeZone ? { ...STAMP_FORMAT, timeZone } : STAMP_FORMAT).format(date);
}

function printedStamp(now: Date, timeZone?: string): string {
  try {
    return stamp(now, timeZone);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return stamp(now);
  }
}

function saleTime(at: string | undefined, timeZone: string | undefined): WcposReceiptDate | null {
  if (!at) return null;
  try {
    return dateBlock(stamp(new Date(at), timeZone));
  } catch {
    return null;
  }
}

function capitalizeStatus(slug: string): string {
  return slug.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function metaText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** Keeps entries with a non-empty type and value; omits the key when none are left. */
function taxIdsKey(list: WcposTaxId[] | undefined): { tax_ids?: WcposTaxId[] } {
  const kept = (list ?? []).filter((id) => id.type && id.value).map((id) => ({
    type: id.type, value: id.value,
    ...(id.country ? { country: id.country } : {}), ...(id.label ? { label: id.label } : {}),
  }));
  return kept.length > 0 ? { tax_ids: kept } : {};
}

/**
 * A recorded per-unit price, put on both bases. The recorded value is on the sale's basis; the other basis
 * uses the line subtotal's own tax ratio, and is null when that ratio has a zero denominator.
 */
function convertRecorded(
  value: number, taxStatus: string | undefined, inclBasis: boolean, subExcl: number, subIncl: number,
): Pair {
  if (taxStatus === 'none' || value === 0) return { incl: value, excl: value };
  if (inclBasis) return { incl: value, excl: subIncl === 0 ? null : Math.round((value * subExcl) / subIncl) };
  return { incl: subExcl === 0 ? null : Math.round((value * subIncl) / subExcl), excl: value };
}

function savings(regular: number | null, selling: number | null): number | null {
  return regular === null || selling === null ? null : Math.max(0, regular - selling);
}

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);
const sumKnown = (values: Array<number | null>): number | null =>
  values.some((value) => value === null) ? null : sum(values as number[]);

interface LineCalc {
  line: WcposReceiptLine;
  qty: number;
  sub: { incl: number; excl: number };
  discount: { incl: number; excl: number };
  lineSavings: Pair;
  savingsInDiscounts: boolean;
}

/** WCPOS's canonical receipt data for a sale. Pure: the clock comes from `options.now`. */
export function wcposReceiptData(
  source: WcposReceiptSource, store: WcposReceiptStore, options: WcposReceiptOptions = {},
): WcposReceiptData {
  const factor = 10 ** minorUnitDigits(source.currency);
  const major = (minor: number): number => Math.round(minor) / factor;
  const majorOrNull = (minor: number | null): number | null => (minor === null ? null : major(minor));
  const side: Side = store.taxDisplayCart === 'incl' ? 'incl' : 'excl';
  const tri = <K extends string, V extends number | null>(key: K, incl: V, excl: V) =>
    ({ [key]: side === 'incl' ? incl : excl, [`${key}_incl`]: incl, [`${key}_excl`]: excl }) as
      { [P in WcposTri<K>]: V };
  const triMinor = <K extends string>(key: K, pair: Pair) =>
    tri(key, majorOrNull(pair.incl), majorOrNull(pair.excl));
  const taxLines = new Map(source.taxLines.map((tax) => [String(tax.rateId), tax]));
  const taxLabel = (tax: WcposReceiptSource['taxLines'][number]) => tax.label || tax.rateCode || 'Tax';
  const ratePercent = (value: number | undefined) => (value !== undefined && value > 0 ? value : null);

  // Gap §5.4: v2's build emits no line taxes; the canonical data carries the line's own rate split.
  const itemTaxes = (taxes: WcposItemTaxSource[] | undefined): WcposItemTax[] =>
    (taxes ?? []).map((tax) => {
      const code = String(tax.rateId);
      const line = taxLines.get(code);
      return {
        code, rate: ratePercent(line?.ratePercent),
        ...(line ? { label: taxLabel(line), compound: !!line.compound } : {}), amount: major(tax.totalMinor),
      };
    }).filter((tax) => tax.code !== '' || tax.amount !== 0);

  const buildLine = (item: WcposLineSource, index: number): LineCalc => {
    const qty = item.quantity;
    const sub = { incl: item.subtotalMinor + item.subtotalTaxMinor, excl: item.subtotalMinor };
    const total = { incl: item.totalMinor + item.totalTaxMinor, excl: item.totalMinor };
    // Gap §5.2: the unit price is the unit before discount, as v2's build computes it (its schema says after).
    const unit = { incl: qty > 0 ? Math.round(sub.incl / qty) : 0, excl: qty > 0 ? Math.round(sub.excl / qty) : 0 };
    const recorded = item.recordedPrice && Number.isFinite(item.recordedPrice.priceMinor)
      && Number.isFinite(item.recordedPrice.regularPriceMinor) ? item.recordedPrice : undefined;
    // The sale's own basis wins over the store setting: a reprint uses the basis the sale was rung up on.
    const inclBasis = source.pricesIncludeTax;
    const convert = (value: number) => convertRecorded(value, recorded?.taxStatus, inclBasis, sub.excl, sub.incl);
    const selling: Pair = recorded ? convert(recorded.priceMinor) : unit;
    const regular: Pair = recorded ? convert(recorded.regularPriceMinor) : { incl: null, excl: null };
    const unitSavings = { incl: savings(regular.incl, selling.incl), excl: savings(regular.excl, selling.excl) };
    const times = (pair: Pair): Pair => ({
      incl: pair.incl === null ? null : pair.incl * qty, excl: pair.excl === null ? null : pair.excl * qty,
    });
    const lineSavings = times(unitSavings);
    // The discount already holds the sale saving when the unit subtotal sits nearer the regular price than the
    // recorded price, both distances rounded to the minor unit.
    const basisUnit = qty === 0 ? null : (inclBasis ? sub.incl : sub.excl) / qty;
    const savingsInDiscounts = !!recorded && basisUnit !== null
      && Math.round(Math.abs(basisUnit - recorded.regularPriceMinor)) < Math.round(Math.abs(basisUnit - recorded.priceMinor));
    const discount = { incl: sub.incl - total.incl, excl: sub.excl - total.excl };
    const sku = item.sku ?? '';
    const meta = (item.meta ?? []).filter((entry) => !entry.key.startsWith('_')).map((entry) => ({
      key: entry.displayKey || entry.key, value: metaText(entry.displayValue ?? entry.value),
    })).filter((entry) => entry.key !== '' && entry.value !== '');
    return {
      qty, sub, discount, lineSavings, savingsInDiscounts,
      line: {
        key: sku || `line-${index}-${item.name.slice(0, 20)}`, name: item.name, sku, qty,
        ...triMinor('unit_price', unit) as { [P in WcposTri<'unit_price'>]: number },
        ...triMinor('line_subtotal', sub) as { [P in WcposTri<'line_subtotal'>]: number },
        ...triMinor('discounts', discount) as { [P in WcposTri<'discounts'>]: number },
        ...triMinor('line_total', total) as { [P in WcposTri<'line_total'>]: number },
        ...triMinor('regular_price', regular), ...triMinor('selling_price', selling),
        ...triMinor('unit_savings', unitSavings), ...triMinor('line_regular_total', times(regular)),
        ...triMinor('line_selling_total', times(selling)), ...triMinor('line_savings', lineSavings),
        savings_in_discounts: savingsInDiscounts, meta, taxes: itemTaxes(item.taxes),
      },
    };
  };
  const calcs = source.lines.map(buildLine);

  const adjustment = (label: string, totalMinor: number, taxMinor: number) => ({
    label, ...tri('total', major(totalMinor + taxMinor), major(totalMinor)),
  });
  const fees = source.fees.map((fee) => adjustment(fee.name, fee.totalMinor, fee.totalTaxMinor));
  // v2's build uses the method id only as the label fallback and does not emit `method_id`.
  const shipping = source.shipping.map((row) =>
    adjustment(row.methodTitle || row.methodId || '', row.totalMinor, row.totalTaxMinor));
  const sep = store.priceDecimalSep ?? '.';
  const discounts = source.coupons.map((coupon) => {
    const percent = coupon.quickDiscountPercent;
    const label = percent === undefined ? coupon.code
      : percent === null ? 'Discount' : `Discount (${String(percent).replace('.', sep)}%)`;
    return adjustment(label, coupon.discountMinor, coupon.discountTaxMinor);
  });

  const lineSum = (pick: (calc: LineCalc) => number) => sum(calcs.map(pick));
  const discountTotal = {
    excl: source.discountTotalMinor ?? lineSum((calc) => calc.discount.excl),
    incl: source.discountTotalMinor !== undefined && source.discountTaxMinor !== undefined
      ? source.discountTotalMinor + source.discountTaxMinor : lineSum((calc) => calc.discount.incl),
  };
  const saleSavings: Pair = {
    incl: sumKnown(calcs.map((calc) => calc.lineSavings.incl)),
    excl: sumKnown(calcs.map((calc) => calc.lineSavings.excl)),
  };
  const notInDiscounts = calcs.filter((calc) => !calc.savingsInDiscounts);
  const totalSaved: Pair = {
    incl: saleSavings.incl === null ? null : discountTotal.incl + sum(notInDiscounts.map((c) => c.lineSavings.incl ?? 0)),
    excl: saleSavings.excl === null ? null : discountTotal.excl + sum(notInDiscounts.map((c) => c.lineSavings.excl ?? 0)),
  };

  const needsPayment = !COMPLETING_STATUSES.includes(source.status) && source.totalMinor > 0;
  // Gap §5.4: one row per tender TallyUI recorded, instead of v2's one row from the order's method.
  const payments = needsPayment ? [] : source.payments.map((payment) => ({
    method_id: payment.methodId, method_title: payment.methodTitle, amount: major(payment.amountMinor),
    transaction_id: payment.transactionId ?? '',
    ...(payment.tenderedMinor !== undefined ? { tendered: major(payment.tenderedMinor) } : {}),
    ...(payment.changeMinor !== undefined ? { change: major(payment.changeMinor) } : {}),
  }));

  const taxable = (code: string): number | null => {
    let base: number | null = null;
    for (const item of [...source.lines, ...source.fees, ...source.shipping]) {
      if (item.taxes?.some((tax) => String(tax.rateId) === code)) base = (base ?? 0) + item.totalMinor;
    }
    return base;
  };
  const taxSummary: WcposTaxSummaryRow[] = source.taxLines.map((tax) => {
    const code = String(tax.rateId);
    const amount = tax.taxTotalMinor + tax.shippingTaxTotalMinor;
    const base = taxable(code);
    return {
      code, rate: ratePercent(tax.ratePercent), label: taxLabel(tax), compound: !!tax.compound,
      tax_amount: major(amount),
      taxable_amount_excl: base === null ? null : major(base),
      taxable_amount_incl: base === null ? null : major(base + amount),
    };
  });
  const breakdown = !store.calcTaxes ? 'hidden' : store.taxTotalDisplay === 'single' ? 'single' : 'itemized';

  const label = options.statusLabel?.(source.status);
  const customer = source.customer ?? {};
  const customerId = Number(customer.id);
  const orderId = Number(source.id);
  const decimals = store.priceDecimals;
  const register = options.register;
  const printCount = options.printCount ?? 0;
  const i18n = Object.fromEntries(Object.entries(options.receiptI18n ?? store.receiptI18n ?? {})
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim() !== ''));
  const totalIncl = major(source.totalMinor);

  return {
    store: {
      id: 0, name: store.name ?? '', logo: store.logo ?? '',
      // Gap §5.5: v2's map can let an invalid `wc_price_decimals` through; only a non-negative integer is kept.
      ...(decimals !== undefined && Number.isInteger(decimals) && decimals >= 0 ? { price_decimals: decimals } : {}),
      address_lines: (store.addressParts ?? []).flatMap((part) => part.split(','))
        .map((part) => part.trim()).filter((part) => part !== ''),
      phone: store.phone ?? '', email: store.email ?? '', ...taxIdsKey(store.taxIds),
    },
    order: {
      id: Number.isFinite(orderId) ? orderId : 0, number: source.number || String(source.id),
      currency: source.currency ?? '', customer_note: source.customerNote ?? '',
      wc_status: source.status, status_label: label && label !== source.status ? label : capitalizeStatus(source.status),
      needs_payment: needsPayment, payment_url: source.paymentUrl ?? '',
      created: dateBlock(source.createdAt), paid: dateBlock(), completed: dateBlock(),
      printed: dateBlock(printedStamp((options.now ?? (() => new Date()))(), store.timezone)),
    },
    // Gap §5.4: v2's build has no cashier; TallyUI passes the one it knows.
    cashier: options.cashier ?? { id: 0, name: '' },
    // Gap §5.3: no billing or shipping address keys, since the source carries none.
    customer: {
      id: customerId > 0 ? customerId : null,
      name: [customer.firstName, customer.lastName].filter((part) => part).join(' '),
      first_name: customer.firstName ?? '', email: customer.email ?? '', phone: customer.phone ?? '',
      // Gap §5.1: every type is kept, as for store tax IDs; v2's map drops types missing from its list.
      ...taxIdsKey(customer.taxIds),
    },
    lines: calcs.map((calc) => calc.line),
    fees, shipping, discounts,
    totals: {
      ...triMinor('subtotal', { incl: lineSum((c) => c.sub.incl), excl: lineSum((c) => c.sub.excl) }) as
        { [P in WcposTri<'subtotal'>]: number },
      ...triMinor('discount_total', discountTotal) as { [P in WcposTri<'discount_total'>]: number },
      ...triMinor('sale_savings_total', saleSavings), ...triMinor('total_saved', totalSaved),
      total_saved_complete: (side === 'incl' ? totalSaved.incl : totalSaved.excl) !== null,
      tax_total: major(source.totalTaxMinor),
      ...tri('total', totalIncl, major(source.totalMinor - source.totalTaxMinor)),
      // Gap §5.4: the tendered sum and the change TallyUI recorded, where v2 defaults to the total and 0.
      paid_total: payments.length > 0 ? major(sum(source.payments.map((payment) => payment.amountMinor))) : totalIncl,
      change_total: major(source.changeMinor ?? 0),
      total_qty: lineSum((calc) => calc.qty), line_count: calcs.length,
    },
    tax: {
      display: side, breakdown, display_incl: side === 'incl', display_excl: side === 'excl',
      breakdown_hidden: breakdown === 'hidden', breakdown_single: breakdown === 'single',
      breakdown_itemized: breakdown === 'itemized',
    },
    tax_summary: taxSummary,
    has_tax_summary: taxSummary.length > 0 && breakdown !== 'hidden',
    payments,
    fiscal: {
      document_type: 'sale', sale_time: saleTime(source.saleTime?.at, source.saleTime?.tz || store.timezone),
      sale_tz: source.saleTime?.tz ?? '', sale_counter: source.saleTime?.counter ?? null,
      received_at: null, corrects: '', is_reprint: printCount > 1, reprint_count: Math.max(0, printCount - 1),
      is_refund_document: false,
    },
    software: {
      name: 'WCPOS', plugin_version: options.pluginVersion ?? '', app_version: options.appVersion ?? '',
      app_build: options.appBuild ?? '',
    },
    register: {
      id: source.registerId ?? register?.id ?? '',
      // A receipt from another till does not borrow this till's name.
      name: register && (source.registerId === undefined || source.registerId === register.id) ? register.name : '',
    },
    presentation_hints: {
      display_tax: side, prices_entered_with_tax: store.pricesIncludeTax, rounding_mode: 'round',
      locale: (store.locale || 'en-US').replace(/_/g, '-'), order_barcode_type: 'code128',
    },
    ...(Object.keys(i18n).length > 0 ? { i18n } : {}),
  };
}
