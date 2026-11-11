import { describe, expect, it } from 'vitest';
import { formatWcposReceiptData, renderLogiclessTemplate, wcposReceiptData } from '../index';
import type { WcposReceiptSource, WcposReceiptStore } from '../index';
import type { WcposLineSource } from './types';

const store: WcposReceiptStore = {
  name: 'Corner Shop', taxDisplayCart: 'incl', pricesIncludeTax: true, calcTaxes: true, locale: 'en_US', timezone: 'UTC',
};
const line = (name: string, subtotalMinor: number, taxMinor: number, recorded?: [number, number]): WcposLineSource => ({
  name, quantity: 1, subtotalMinor, subtotalTaxMinor: taxMinor, totalMinor: subtotalMinor, totalTaxMinor: taxMinor,
  taxes: [{ rateId: 1, totalMinor: taxMinor }],
  ...(recorded ? { recordedPrice: { priceMinor: recorded[0], regularPriceMinor: recorded[1] } } : {}),
});
const source = (overrides: Partial<WcposReceiptSource> = {}): WcposReceiptSource => ({
  id: 5, number: '5', currency: 'USD', status: 'completed', createdAt: '2026-09-11T09:30:00Z', customerNote: '',
  pricesIncludeTax: false, customer: null,
  lines: [line('Mug', 1000, 100, [1000, 1200]), line('Tea', 500, 50, [500, 500])],
  fees: [], shipping: [], coupons: [],
  taxLines: [{ rateId: 1, label: 'GST', ratePercent: 10, taxTotalMinor: 150, shippingTaxTotalMinor: 0 }],
  payments: [], totalMinor: 1650, totalTaxMinor: 150,
  ...overrides,
});
const view = (overrides: Partial<WcposReceiptSource> = {}) =>
  formatWcposReceiptData(wcposReceiptData(source(overrides), store, { now: () => new Date('2026-05-08T12:34:00Z') }));

const template = [
  '<h1>{{store.name}}</h1>',
  '{{#lines}}<p>{{name}} {{line_total_display}}{{#line_savings_display}} saved {{line_savings_display}}{{/line_savings_display}}</p>{{/lines}}',
  '{{#has_tax_summary}}<table>{{#tax_summary}}<tr><td>{{label}}</td><td>{{tax_amount_display}}</td></tr>{{/tax_summary}}</table>{{/has_tax_summary}}',
  '<p>{{i18n.total}} {{totals.total_display}}</p>',
].join('');

describe('WCPOS receipt data through a Mustache template', () => {
  it('prints display strings, the tax table and only a non-zero saving', () => {
    const html = renderLogiclessTemplate(template, view());
    expect(html).toContain('<h1>Corner Shop</h1>');
    expect(html).toContain('<p>Mug $11.00 saved $2.20</p>');
    expect(html).toContain('<p>Tea $5.50</p>');
    expect(html).toContain('<tr><td>GST</td><td>$1.50</td></tr>');
    expect(html).toContain('<p>Total $16.50</p>');
  });

  it('§3.3 drops the tax table when the breakdown is hidden', () => {
    const html = renderLogiclessTemplate(template, formatWcposReceiptData(
      wcposReceiptData(source(), { ...store, calcTaxes: false }, { now: () => new Date('2026-05-08T12:34:00Z') }),
    ));
    expect(html).not.toContain('<table>');
  });

  it('§3.7 prints a raw number unformatted and treats 0 as false', () => {
    const tag = '{{#totals.tax_total}}TAX {{totals.tax_total}}{{/totals.tax_total}}';
    expect(renderLogiclessTemplate(tag, view())).toBe('TAX 1.5');
    expect(renderLogiclessTemplate(tag, view({
      totalTaxMinor: 0, taxLines: [], lines: [line('Mug', 1000, 0)], totalMinor: 1000,
    }))).toBe('');
  });
});
