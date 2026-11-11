import { describe, expect, it } from 'vitest';
import { wcposReceiptData } from './build';
import { formatWcposReceiptData, WCPOS_DEFAULT_I18N } from './format';
import type { WcposReceiptData, WcposReceiptRefund, WcposReceiptSource, WcposReceiptStore } from './types';

const store: WcposReceiptStore = {
  name: 'Corner Shop', taxDisplayCart: 'incl', pricesIncludeTax: true, calcTaxes: true, locale: 'en_US', timezone: 'UTC',
};
const source = (overrides: Partial<WcposReceiptSource> = {}): WcposReceiptSource => ({
  id: 1, number: '1', currency: 'USD', status: 'completed', createdAt: '2026-09-11T09:30:00Z', customerNote: '',
  pricesIncludeTax: false, customer: null,
  lines: [{ name: 'Widget A', sku: 'SKU-001', quantity: 2, subtotalMinor: 1000, subtotalTaxMinor: 0, totalMinor: 1000,
    totalTaxMinor: 0 }],
  fees: [], shipping: [], coupons: [], taxLines: [], payments: [], totalMinor: 1000, totalTaxMinor: 0,
  ...overrides,
});
const now = () => new Date('2026-05-08T12:34:00Z');
const data = (overrides: Partial<WcposReceiptSource> = {}, storeOverrides: Partial<WcposReceiptStore> = {}) =>
  wcposReceiptData(source(overrides), { ...store, ...storeOverrides }, { now });
const withSide = (receipt: WcposReceiptData, display_tax: 'incl' | 'excl'): WcposReceiptData =>
  ({ ...receipt, presentation_hints: { ...receipt.presentation_hints, display_tax } });

// §4.3's sampleReceiptData refunds[0].
const refund: WcposReceiptRefund = {
  id: 1, amount: 12, subtotal: 10, tax_total: 2, shipping_total: 3, shipping_tax: 0.5,
  lines: [{ name: 'Widget A', sku: 'SKU-001', qty: 2, total: 12, total_incl: 12, total_excl: 10,
    taxes: [{ code: 'vat-20', rate: 20, label: 'VAT 20%', amount: 2 }] }],
  fees: [{ label: 'Restocking fee', total: 1.2, total_incl: 1.2, total_excl: 1 }],
  shipping: [{ label: 'Returned shipping', method_id: 'flat_rate', total: 3, total_incl: 3, total_excl: 2.5 }],
};

describe('formatWcposReceiptData', () => {
  it.each([
    ['incl', { line: '$12.00', unit: '$6.00', fee: '$1.20', shipping: '$3.00' }],
    ['excl', { line: '$10.00', unit: '$5.00', fee: '$1.00', shipping: '$2.50' }],
  ] as const)('§4.3 adds displays and line-style aliases to refund rows, %s view', (side, expected) => {
    const view = formatWcposReceiptData(withSide({ ...data(), refunds: [refund] }, side));
    const [row] = view.refunds ?? [];
    expect(row).toMatchObject({
      amount_display: '$12.00', subtotal_display: '$10.00', tax_total_display: '$2.00',
      shipping_total_display: '$3.00', shipping_tax_display: '$0.50',
    });
    expect(row.lines?.[0]).toMatchObject({
      line_total: 12, line_total_incl: 12, line_total_excl: 10, line_total_display: expected.line,
      unit_total: 6, unit_total_incl: 6, unit_total_excl: 5, unit_total_display: expected.unit,
    });
    expect(row.lines?.[0].taxes?.[0].amount_display).toBe('$2.00');
    expect(row.fees?.[0].total_display).toBe(expected.fee);
    expect(row.shipping?.[0]).toMatchObject({ method_id: 'flat_rate', total_display: expected.shipping });
  });

  it('§4.4 keeps zero savings Mustache-falsy while other money shows $0.00', () => {
    const view = formatWcposReceiptData(data({
      lines: [{ name: 'Widget', quantity: 2, subtotalMinor: 1000, subtotalTaxMinor: 0, totalMinor: 1000, totalTaxMinor: 0,
        recordedPrice: { priceMinor: 500, regularPriceMinor: 500, taxStatus: 'none' } }],
    }, { taxDisplayCart: 'excl', pricesIncludeTax: false }));
    expect(view.lines[0]).toMatchObject({
      regular_price: 5, regular_price_display: '$5.00', line_selling_total_display: '$10.00',
      unit_savings: 0, unit_savings_display: '', line_savings: 0, line_savings_display: '',
    });
    expect(view.totals).toMatchObject({
      sale_savings_total: 0, sale_savings_total_display: '', total_saved: 0, total_saved_display: '',
      discount_total_incl: 0, discount_total_incl_display: '$0.00',
    });
  });

  it('§2.18 labels tax IDs: own label, i18n type key, built-in, i18n other, then Tax ID', () => {
    const receipt = data({ customer: { id: 2, taxIds: [{ type: 'xx_reg', value: '9' }] } }, {
      taxIds: [
        { type: 'eu_vat', value: '1', label: 'Mine' }, { type: 'eu_vat', value: '2' }, { type: 'gb_vat', value: '3' },
        { type: 'xx_reg', value: '4', label: ' ' }, { type: 'au_abn', value: '5' },
      ],
    });
    const view = formatWcposReceiptData({
      ...receipt, i18n: { store_tax_id_label_eu_vat: 'USt', store_tax_id_label_other: 'Reg', store_tax_id_label_au_abn: '' },
    });
    expect(view.store.tax_ids?.map((id) => id.label)).toEqual(['Mine', 'USt', 'VAT No.', 'Reg', 'ABN']);
    expect(view.customer.tax_ids).toEqual([{ type: 'xx_reg', value: '9', label: 'Tax ID' }]);
    expect(receipt.store.tax_ids?.[1]).toEqual({ type: 'eu_vat', value: '2' });
  });

  it('§2.18 merges i18n over the defaults: the source wins, a blank never overrides', () => {
    const view = formatWcposReceiptData({ ...data(), i18n: { total: 'TOTAL', subtotal: '', tax: '  ', custom: 'Hi' } });
    expect(view.i18n).toEqual({ ...WCPOS_DEFAULT_I18N, total: 'TOTAL', custom: 'Hi' });
    expect(formatWcposReceiptData(data()).i18n).toEqual(WCPOS_DEFAULT_I18N);
  });

  it('§3.7 gives optional money a twin only when the value exists', () => {
    const view = formatWcposReceiptData(data({
      payments: [{ methodId: 'card', methodTitle: 'Card', amountMinor: 1000 },
        { methodId: 'cash', methodTitle: 'Cash', amountMinor: 0, tenderedMinor: 2000, changeMinor: 1000 }],
      taxLines: [{ rateId: 9, label: 'Zero', taxTotalMinor: 0, shippingTaxTotalMinor: 0 }],
    }));
    expect(view.lines[0]).not.toHaveProperty('regular_price_display');
    expect(view.lines[0]).not.toHaveProperty('line_savings_display');
    expect(view.totals).not.toHaveProperty('sale_savings_total_display');
    expect(view.totals).not.toHaveProperty('refund_total_display');
    expect(view.totals).toMatchObject({ paid_total_display: '$10.00', change_total_display: '$0.00' });
    expect(view.payments[0]).not.toHaveProperty('tendered_display');
    expect(view.payments[1]).toMatchObject({ amount_display: '$0.00', tendered_display: '$20.00', change_display: '$10.00' });
    expect(view.tax_summary[0]).toMatchObject({ taxable_amount_excl_display: '', tax_amount_display: '$0.00' });
    expect(view).not.toHaveProperty('refunds');
  });

  it('§3.7 leaves the input unmutated', () => {
    const receipt = { ...data({ customer: { taxIds: [{ type: 'eu_vat', value: '1' }] } }), refunds: [refund] };
    const before = structuredClone(receipt);
    formatWcposReceiptData(receipt);
    expect(receipt).toEqual(before);
  });
});
