import { describe, expect, it } from 'vitest';
import { wcposReceiptData } from './build';
import type { WcposLineSource, WcposReceiptOptions, WcposReceiptSource, WcposReceiptStore } from './types';

const inclStore: WcposReceiptStore = {
  name: 'Corner Shop', taxDisplayCart: 'incl', pricesIncludeTax: true, calcTaxes: true, locale: 'en_US', timezone: 'UTC',
};
const exclStore: WcposReceiptStore = { ...inclStore, taxDisplayCart: 'excl', pricesIncludeTax: false };

// §4.1's aliasOrder, in minor units.
function sale(overrides: Partial<WcposReceiptSource> = {}): WcposReceiptSource {
  return {
    id: 42, number: '42', currency: 'USD', status: 'completed', createdAt: '2026-09-11T09:30:00Z', customerNote: '',
    pricesIncludeTax: false, customer: null,
    lines: [{
      name: 'Taxed Widget', quantity: 2, subtotalMinor: 2500, subtotalTaxMinor: 500, totalMinor: 2000, totalTaxMinor: 400,
      meta: [{ key: 'color', value: 'red' }, { key: '_hidden', value: 'x' }],
    }],
    fees: [], shipping: [], coupons: [], taxLines: [], payments: [],
    totalMinor: 2400, totalTaxMinor: 400, discountTotalMinor: 500, discountTaxMinor: 100,
    ...overrides,
  };
}
const now = () => new Date('2026-05-08T12:34:00Z');
const build = (source = sale(), store = inclStore, options: WcposReceiptOptions = {}) =>
  wcposReceiptData(source, store, { now, ...options });
const spaces = (text: string | undefined) => text?.replace(/\s/g, ' ');
const line = (overrides: Partial<WcposLineSource>): WcposLineSource => ({
  name: 'Item', quantity: 1, subtotalMinor: 1000, subtotalTaxMinor: 200, totalMinor: 1000, totalTaxMinor: 200, ...overrides,
});

describe('wcposReceiptData', () => {
  it.each([
    ['incl', inclStore, { unit_price: 15, line_subtotal: 30, discounts: 6, line_total: 24 }, { subtotal: 30, discount_total: 6, total: 24 }],
    ['excl', exclStore, { unit_price: 12.5, line_subtotal: 25, discounts: 5, line_total: 20 }, { subtotal: 25, discount_total: 5, total: 20 }],
  ])('§4.1 gives the %s store the table values, unit price before discount', (_side, store, lineValues, totalValues) => {
    const data = build(sale(), store);
    expect(data.lines[0]).toMatchObject({ ...lineValues, unit_price_incl: 15, unit_price_excl: 12.5, qty: 2 });
    expect(data.lines[0].meta).toEqual([{ key: 'color', value: 'red' }]);
    expect(data.totals).toMatchObject({ ...totalValues, total_incl: 24, total_excl: 20, tax_total: 4, line_count: 1 });
  });

  it('§3.2 keeps a refund line (qty -2) negative, with unit price 0', () => {
    const data = build(sale({
      lines: [line({
        quantity: -2, subtotalMinor: -3000, subtotalTaxMinor: 0, totalMinor: -3000, totalTaxMinor: 0,
        recordedPrice: { priceMinor: 1500, regularPriceMinor: 1800, taxStatus: 'none' },
      })],
      discountTotalMinor: undefined, discountTaxMinor: undefined,
    }), exclStore);
    expect(data.lines[0]).toMatchObject({ unit_price: 0, line_regular_total: -36, line_savings: -6 });
    expect(data.totals).toMatchObject({ total_qty: -2, sale_savings_total: -6 });
  });

  it('§3.2 keeps a negative fee negative on both bases', () => {
    const data = build(sale({ fees: [{ name: 'Adjustment', totalMinor: -500, totalTaxMinor: -100 }] }));
    expect(data.fees).toEqual([{ label: 'Adjustment', total: -6, total_incl: -6, total_excl: -5 }]);
  });

  it('§3.3 sums taxable amounts per rate from the items carrying it (UK, compound 2%)', () => {
    const vat = (net: number) => [{ rateId: 1, totalMinor: net / 5 }, { rateId: 2, totalMinor: (net * 1.2) / 50 }];
    const data = build(sale({
      currency: 'GBP', discountTotalMinor: undefined, discountTaxMinor: undefined, totalMinor: 4284, totalTaxMinor: 784,
      lines: [
        line({ subtotalMinor: 2000, subtotalTaxMinor: 448, totalMinor: 2000, totalTaxMinor: 448, taxes: vat(2000) }),
        line({ subtotalMinor: 1500, subtotalTaxMinor: 336, totalMinor: 1500, totalTaxMinor: 336, taxes: vat(1500) }),
      ],
      taxLines: [
        { rateId: 1, label: 'VAT', ratePercent: 20, taxTotalMinor: 700, shippingTaxTotalMinor: 0 },
        { rateId: 2, label: 'Surcharge', ratePercent: 2, compound: true, taxTotalMinor: 84, shippingTaxTotalMinor: 0 },
        { rateId: 3, rateCode: 'ZERO', taxTotalMinor: 0, shippingTaxTotalMinor: 0 },
      ],
    }));
    expect(data.tax_summary).toEqual([
      { code: '1', rate: 20, label: 'VAT', compound: false, tax_amount: 7, taxable_amount_excl: 35, taxable_amount_incl: 42 },
      { code: '2', rate: 2, label: 'Surcharge', compound: true, tax_amount: 0.84, taxable_amount_excl: 35, taxable_amount_incl: 35.84 },
      { code: '3', rate: null, label: 'ZERO', compound: false, tax_amount: 0, taxable_amount_excl: null, taxable_amount_incl: null },
    ]);
    expect(data.has_tax_summary).toBe(true);
    // Gap §5.4: the line carries its own rate split.
    expect(data.lines[0].taxes).toEqual([
      { code: '1', rate: 20, label: 'VAT', compound: false, amount: 4 },
      { code: '2', rate: 2, label: 'Surcharge', compound: true, amount: 0.48 },
    ]);
  });

  it('§3.3 hides the breakdown when the store does not calculate taxes, even with tax rows', () => {
    const taxLines = [{ rateId: 1, label: 'VAT', taxTotalMinor: 400, shippingTaxTotalMinor: 0 }];
    const hidden = build(sale({ taxLines }), { ...inclStore, calcTaxes: false });
    expect(hidden.tax).toMatchObject({ breakdown: 'hidden', breakdown_hidden: true, display_incl: true });
    expect(hidden.tax_summary).toHaveLength(1);
    expect(hidden.has_tax_summary).toBe(false);
    expect(build(sale({ taxLines }), { ...inclStore, taxTotalDisplay: 'single' }).tax.breakdown_single).toBe(true);
    expect(build(sale({ taxLines }), { ...inclStore, taxTotalDisplay: 'bogus' }).tax.breakdown).toBe('itemized');
  });

  it('§2.2 capitalises an unknown status slug: on-hold gives On Hold', () => {
    expect(build(sale({ status: 'on-hold' })).order.status_label).toBe('On Hold');
    expect(build(sale({ status: 'on-hold' }), inclStore, { statusLabel: (slug) => slug }).order.status_label).toBe('On Hold');
    expect(build(sale({ status: 'on-hold' }), inclStore, { statusLabel: () => 'Waiting' }).order.status_label).toBe('Waiting');
  });

  it('§2.12 empties payments while the order needs payment; §5.4 carries tenders and change', () => {
    const payments = [
      { methodId: 'cash', methodTitle: 'Cash', amountMinor: 3000, tenderedMinor: 3000, changeMinor: 600 },
      { methodId: 'card', methodTitle: 'Card', amountMinor: -600, transactionId: 'T1' },
    ];
    const pending = build(sale({ status: 'on-hold', payments }));
    expect(pending.order.needs_payment).toBe(true);
    expect(pending.payments).toEqual([]);
    expect(pending.totals.paid_total).toBe(24);
    const paid = build(sale({ payments, changeMinor: 600 }), inclStore, { cashier: { id: 3, name: 'Sam' } });
    expect(paid.order.needs_payment).toBe(false);
    expect(paid.payments).toEqual([
      { method_id: 'cash', method_title: 'Cash', amount: 30, transaction_id: '', tendered: 30, change: 6 },
      { method_id: 'card', method_title: 'Card', amount: -6, transaction_id: 'T1' },
    ]);
    expect(paid.totals).toMatchObject({ paid_total: 24, change_total: 6 });
    expect(paid.cashier).toEqual({ id: 3, name: 'Sam' });
    expect(build().cashier).toEqual({ id: 0, name: '' });
    // paid_total is the payments' sum, not the order total, when the two differ.
    const part = build(sale({ payments: [{ methodId: 'card', methodTitle: 'Card', amountMinor: 1000 }] }));
    expect(part.totals).toMatchObject({ total: 24, paid_total: 10 });
    const cash = build(sale({ payments: [{ methodId: 'cash', methodTitle: 'Cash', amountMinor: 3000 }], changeMinor: 600 }));
    expect(cash.totals).toMatchObject({ paid_total: 30, change_total: 6 });
  });

  it('§2.16 borrows the register name only for the same register id', () => {
    const register = { id: 'front', name: 'Front till' };
    expect(build(sale({ registerId: 'front' }), inclStore, { register }).register).toEqual(register);
    expect(build(sale(), inclStore, { register }).register).toEqual(register);
    expect(build(sale({ registerId: 'back' }), inclStore, { register }).register).toEqual({ id: 'back', name: '' });
  });

  it('§2.2 and §2.14 format printed and sale_time in the zone, with an invalid zone handled', () => {
    const data = build(sale({ saleTime: { at: '2026-09-11T09:30:00Z', tz: 'Europe/London', counter: 7 } }), inclStore,
      { printCount: 3 });
    expect(spaces(data.order.printed.datetime)).toBe('May 8, 2026, 12:34 PM');
    expect(Object.keys(data.order.printed)).toHaveLength(19);
    expect(data.order.created.datetime).toBe('2026-09-11T09:30:00Z');
    expect(spaces(data.fiscal.sale_time?.datetime)).toBe('Sep 11, 2026, 10:30 AM');
    expect(data.fiscal).toMatchObject({ sale_tz: 'Europe/London', sale_counter: 7, is_reprint: true, reprint_count: 2 });
    const badZone = build(sale({ saleTime: { at: '2026-09-11T09:30:00Z' } }), { ...inclStore, timezone: 'Not/AZone' });
    const zoneless = new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(now());
    expect(badZone.order.printed.datetime).toBe(zoneless);
    expect(badZone.fiscal.sale_time).toBeNull();
    expect(build(sale({ saleTime: { at: 'not a date' } })).fiscal.sale_time).toBeNull();
    expect(build().fiscal).toMatchObject({ sale_time: null, sale_counter: null, is_reprint: false, reprint_count: 0 });
  });

  describe('§2.5 recorded-price savings', () => {
    const recorded = (pricesIncludeTax: boolean, priceMinor: number, regularPriceMinor: number, store: WcposReceiptStore) =>
      build(sale({
        pricesIncludeTax, discountTotalMinor: undefined, discountTaxMinor: undefined,
        lines: [line({ recordedPrice: { priceMinor, regularPriceMinor } })],
      }), store).lines[0];
    const converted = {
      regular_price: 12.5, regular_price_incl: 15, regular_price_excl: 12.5, selling_price_incl: 12, selling_price_excl: 10,
      unit_savings_incl: 3, unit_savings_excl: 2.5, line_savings: 2.5, savings_in_discounts: false,
    };

    it('converts a price recorded incl. tax, on the sale basis over the store setting', () => {
      expect(recorded(true, 1200, 1500, exclStore)).toMatchObject(converted);
    });

    it('converts a price recorded excl. tax, on the sale basis over the store setting', () => {
      expect(recorded(false, 1000, 1250, { ...inclStore, taxDisplayCart: 'excl' })).toMatchObject(converted);
    });

    it('counts a saving already inside the discount once', () => {
      const data = build(sale({
        discountTotalMinor: undefined, discountTaxMinor: undefined,
        lines: [line({ subtotalMinor: 1500, subtotalTaxMinor: 0, totalMinor: 1200, totalTaxMinor: 0,
          recordedPrice: { priceMinor: 1200, regularPriceMinor: 1500, taxStatus: 'none' } })],
      }), exclStore);
      expect(data.lines[0].savings_in_discounts).toBe(true);
      expect(data.totals).toMatchObject({ discount_total: 3, sale_savings_total: 3, total_saved: 3, total_saved_complete: true });
    });

    it('leaves savings null, never 0, without a recorded price', () => {
      const data = build();
      expect(data.lines[0]).toMatchObject({ regular_price: null, unit_savings: null, line_savings: null, selling_price: 15 });
      expect(data.totals).toMatchObject({ sale_savings_total: null, total_saved: null, total_saved_complete: false });
    });
  });

  it('§2.8 labels quick discounts with the store decimal separator', () => {
    const data = build(sale({ coupons: [
      { code: 'SAVE5', discountMinor: 500, discountTaxMinor: 100 },
      { code: 'qd-1', discountMinor: 250, discountTaxMinor: 0, quickDiscountPercent: 12.5 },
      { code: 'qd-2', discountMinor: 100, discountTaxMinor: 0, quickDiscountPercent: null },
    ] }), { ...inclStore, priceDecimalSep: ',' });
    expect(data.discounts.map((discount) => discount.label)).toEqual(['SAVE5', 'Discount (12,5%)', 'Discount']);
    expect(data.discounts[0]).toMatchObject({ total: 6, total_incl: 6, total_excl: 5 });
  });

  it('§5.1 keeps a de_ust_id customer tax ID; §5.5 drops invalid price decimals', () => {
    const data = build(sale({ customer: { id: '7', firstName: 'Ada', taxIds: [
      { type: 'de_ust_id', value: 'DE123456789' }, { type: '', value: 'x' }, { type: 'eu_vat', value: '' },
    ] } }), { ...inclStore, priceDecimals: 2.5, addressParts: ['1 High St', '', 'Leeds', 'LS1 1AA', 'GB'] });
    expect(data.customer).toEqual({
      id: 7, name: 'Ada', first_name: 'Ada', email: '', phone: '', tax_ids: [{ type: 'de_ust_id', value: 'DE123456789' }],
    });
    expect(data.store).toEqual({
      id: 0, name: 'Corner Shop', logo: '', address_lines: ['1 High St', 'Leeds', 'LS1 1AA', 'GB'], phone: '', email: '',
    });
    expect(build(sale(), { ...inclStore, priceDecimals: 0 }).store.price_decimals).toBe(0);
    expect(build().customer.id).toBeNull();
  });

  it('§2.18 drops non-string and blank i18n values, options over store', () => {
    const store = { ...inclStore, receiptI18n: { total: 'Store total' } };
    expect(build(sale(), store, { receiptI18n: { total: 'TOTAL', subtotal: '  ', tax: 3 } }).i18n).toEqual({ total: 'TOTAL' });
    expect(build(sale(), store).i18n).toEqual({ total: 'Store total' });
    expect('i18n' in build(sale(), inclStore, { receiptI18n: { total: ' ' } })).toBe(false);
  });
});
