// Ported from WCPOS v2 packages/printer/src/encoder/format-receipt-data.ts (wcpos/monorepo 85ecbd43f, MIT).
import { formatWcposMoney } from './money';
import type {
  WcposAdjustmentView, WcposItemTax, WcposItemTaxView, WcposReceiptAdjustment, WcposReceiptData, WcposReceiptView,
  WcposRefundAdjustment, WcposRefundLine, WcposTaxId,
} from './types';

/** The labels every WCPOS template can rely on; a store's non-blank labels override them. */
export const WCPOS_DEFAULT_I18N: Readonly<Record<string, string>> = {
  copy: 'COPY', corrects: 'Corrects', refunded_to: 'Refunded to', reprint: 'Reprint', register: 'Register',
  sale_time: 'Sale time', document_refund: 'Refund', document_void: 'Void', document_cancellation: 'Cancellation',
  software: 'Software', order: 'Order', date: 'Date', cashier: 'Cashier', customer: 'Customer',
  store_tax_id_label_other: 'Tax ID', customer_tax_id_label_other: 'Tax ID',
  subtotal: 'Subtotal', total_saved: 'Total saved', total: 'Total', tax: 'Tax', tax_summary: 'Tax Summary',
  included_tax: 'Tax included', total_tax: 'Total Tax', tax_amount_short: 'Tax', taxable_excl_short: 'Taxable excl.',
  taxable_incl_short: 'Taxable incl.', total_refunded: 'Total Refunded', refunded: 'Refunded', net_total: 'Net Total',
  tendered: 'Tendered', change: 'Change', thank_you: 'Thank you', thank_you_purchase: 'Thank you for your purchase!',
};

/** The built-in label per WCPOS tax-ID type. */
export const WCPOS_TAX_ID_LABELS: Readonly<Record<string, string>> = {
  eu_vat: 'VAT ID', gb_vat: 'VAT No.', sa_vat: 'VAT No.', au_abn: 'ABN', br_cpf: 'CPF', br_cnpj: 'CNPJ',
  in_gst: 'GSTIN', it_cf: 'Codice Fiscale', it_piva: 'P.IVA', es_nif: 'NIF', ar_cuit: 'CUIT',
  ca_gst_hst: 'GST/HST No.', us_ein: 'EIN', de_ust_id: 'USt-IdNr.', de_steuernummer: 'Steuernummer',
  de_hrb: 'HRB', nl_kvk: 'KVK', fr_siret: 'SIRET', fr_siren: 'SIREN', gb_company: 'Company No.', ch_uid: 'UID',
};

export interface FormatWcposReceiptOptions {
  /** False for a currency symbol the printer's code page cannot encode: the ISO code is printed instead. */
  isSymbolEncodable?: (symbol: string) => boolean;
}

const tri = (key: string): string[] => [key, `${key}_incl`, `${key}_excl`];
const own = (record: Readonly<Record<string, string>>, key: string): string | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;
const definedOnly = (values: Record<string, number | undefined>): Record<string, number> =>
  Object.fromEntries(Object.entries(values).filter((entry): entry is [string, number] => entry[1] !== undefined));

/** `<key>_display` for each key whose value is a number; null and absent keys get no twin. */
function displays(source: object, keys: string[], format: (value: number) => string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) {
    const value = (source as Record<string, unknown>)[key];
    if (typeof value === 'number') out[`${key}_display`] = format(value);
  }
  return out;
}

/**
 * The template view of canonical WCPOS receipt data: the input unchanged, plus `*_display` money strings,
 * filled tax-ID labels and `i18n` merged over WCPOS_DEFAULT_I18N. The input is not mutated.
 */
export function formatWcposReceiptData(data: WcposReceiptData, options: FormatWcposReceiptOptions = {}): WcposReceiptView {
  const hints = data.presentation_hints;
  const side = hints.display_tax === 'incl' || hints.display_tax === 'excl' ? hints.display_tax
    : hints.prices_entered_with_tax === false ? 'excl' : 'incl';
  const moneyOptions = {
    locale: hints.locale, decimals: data.store.price_decimals, isSymbolEncodable: options.isSymbolEncodable,
  };
  const money = (value: number) => formatWcposMoney(value, data.order.currency, moneyOptions);
  // Savings are zero-falsy, so `{{#unit_savings_display}}` hides a zero saving.
  const saving = (value: number) => (value === 0 ? '' : money(value));
  const bySide = (incl: number | undefined, bare: number | undefined, excl: number | undefined) =>
    side === 'excl' ? excl ?? bare ?? incl : incl ?? bare ?? excl;

  const i18n: Record<string, string> = { ...WCPOS_DEFAULT_I18N };
  for (const [key, value] of Object.entries(data.i18n ?? {})) {
    if (typeof value === 'string' && value.trim() !== '') i18n[key] = value;
  }
  const taxIdLabel = (scope: 'store' | 'customer', id: WcposTaxId): string =>
    (id.label && id.label.trim() !== '' ? id.label : undefined)
    ?? own(i18n, `${scope}_tax_id_label_${id.type}`) ?? own(WCPOS_TAX_ID_LABELS, id.type)
    ?? own(i18n, `${scope}_tax_id_label_other`) ?? 'Tax ID';
  const labelled = (scope: 'store' | 'customer', ids: WcposTaxId[] | undefined) =>
    ids ? { tax_ids: ids.map((id) => ({ ...id, label: taxIdLabel(scope, id) })) } : {};

  const taxView = (tax: WcposItemTax): WcposItemTaxView => ({ ...tax, amount_display: money(tax.amount) });
  const taxesKey = (taxes: WcposItemTax[] | undefined) => (taxes ? { taxes: taxes.map(taxView) } : {});
  const adjustment = <T extends WcposReceiptAdjustment>({ taxes, ...row }: T) =>
    ({ ...row, ...displays(row, tri('total'), money), ...taxesKey(taxes) }) as WcposAdjustmentView<T>;
  const refundAdjustment = ({ taxes, ...row }: WcposRefundAdjustment) => ({
    ...row, total_display: money(bySide(row.total_incl, row.total, row.total_excl) ?? row.total), ...taxesKey(taxes),
  });
  const refundLine = ({ taxes, ...line }: WcposRefundLine) => {
    const perUnit = (value: number | undefined) => (value === undefined || line.qty === 0 ? undefined : value / line.qty);
    const totals = {
      line_total: line.line_total ?? line.total,
      line_total_incl: line.line_total_incl ?? line.total_incl ?? line.total,
      line_total_excl: line.line_total_excl ?? line.total_excl,
    };
    const units = {
      unit_total: line.unit_total ?? perUnit(totals.line_total),
      unit_total_incl: line.unit_total_incl ?? perUnit(totals.line_total_incl),
      unit_total_excl: line.unit_total_excl ?? perUnit(totals.line_total_excl),
    };
    const view = { ...line, ...definedOnly(totals), ...definedOnly(units), line_total: totals.line_total };
    const unit = bySide(units.unit_total_incl, units.unit_total, units.unit_total_excl);
    return {
      ...view, ...displays(view, ['line_total_incl', 'line_total_excl', 'unit_total_incl', 'unit_total_excl'], money),
      total_display: money(bySide(line.total_incl, line.total, line.total_excl) ?? line.total),
      line_total_display: money(bySide(totals.line_total_incl, totals.line_total, totals.line_total_excl) ?? line.total),
      ...(unit === undefined ? {} : { unit_total_display: money(unit) }),
      ...taxesKey(taxes),
    };
  };

  const { totals, refunds, ...rest } = data;
  return {
    ...rest,
    store: { ...data.store, ...labelled('store', data.store.tax_ids) },
    customer: { ...data.customer, ...labelled('customer', data.customer.tax_ids) },
    lines: data.lines.map((line) => ({
      ...line,
      ...displays(line, [
        ...tri('unit_price'), ...tri('line_subtotal'), ...tri('discounts'), ...tri('line_total'), ...tri('regular_price'),
        ...tri('selling_price'), ...tri('line_regular_total'), ...tri('line_selling_total'),
      ], money),
      ...displays(line, [...tri('unit_savings'), ...tri('line_savings')], saving),
      taxes: line.taxes.map(taxView),
    })) as WcposReceiptView['lines'],
    fees: data.fees.map(adjustment),
    shipping: data.shipping.map(adjustment),
    discounts: data.discounts.map(adjustment),
    totals: {
      ...totals,
      ...displays(totals, [
        ...tri('subtotal'), ...tri('discount_total'), ...tri('total'), 'tax_total', 'paid_total', 'change_total',
        'refund_total', 'net_total',
      ], money),
      ...displays(totals, [...tri('sale_savings_total'), ...tri('total_saved')], saving),
    } as WcposReceiptView['totals'],
    tax_summary: data.tax_summary.map((row) => ({
      ...row,
      tax_amount_display: money(row.tax_amount),
      taxable_amount_excl_display: row.taxable_amount_excl === null ? '' : money(row.taxable_amount_excl),
      taxable_amount_incl_display: row.taxable_amount_incl === null ? '' : money(row.taxable_amount_incl),
    })),
    payments: data.payments.map((payment) => ({
      ...payment, amount_display: money(payment.amount), ...displays(payment, ['tendered', 'change'], money),
    })),
    ...(refunds ? {
      refunds: refunds.map(({ lines, fees, shipping, ...refund }) => ({
        ...refund,
        amount_display: money(refund.amount),
        ...displays(refund, ['subtotal', 'tax_total', 'shipping_total', 'shipping_tax'], money),
        ...(lines ? { lines: lines.map(refundLine) } : {}),
        ...(fees ? { fees: fees.map(refundAdjustment) } : {}),
        ...(shipping ? { shipping: shipping.map(refundAdjustment) } : {}),
      })),
    } : {}),
    i18n,
  };
}
