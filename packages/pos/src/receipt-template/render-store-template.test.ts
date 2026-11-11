import { describe, expect, it } from 'vitest';
import type { ReceiptTemplate } from '@tallyui/core';
import { createOrderBuilder } from '../order/order-builder';
import { renderStoreReceiptTemplate, type PrintableSale, type StoreTemplateContext } from './render-store-template';

function sale(): PrintableSale {
  const builder = createOrderBuilder({ currency: 'USD', taxContext: { getTaxRatePpm: () => 100000, pricesIncludeTax: false } });
  builder.addLine({ productId: 'p1', name: 'Mug', sku: 'MUG', unitPrice: { amount: 1000, currency: 'USD' }, quantity: 2 });
  builder.addPayment({ method: 'cash', amountMinor: 2200 });
  return { kind: 'sent', order: builder.getSnapshot() };
}
const context: StoreTemplateContext = { config: { storeName: 'Corner Shop' }, pricesIncludeTax: false };
const template = (over: Partial<ReceiptTemplate>): ReceiptTemplate => ({
  id: 't1', kind: 'receipt', title: 'Receipt', engine: 'html', body: '', dataModel: 'wcpos', ...over,
});

describe('renderStoreReceiptTemplate', () => {
  it('prints a wcpos html template in WCPOS\'s vocabulary', () => {
    const body = '<p>{{store.name}}: {{totals.total_incl_display}}</p><p>[{{total}}]</p>';
    const html = renderStoreReceiptTemplate(template({ body }), sale(), context);
    expect(html).toContain('Corner Shop: $22.00');
    // `total` is TallyUI's tag: blank over WCPOS's data.
    expect(html).toContain('[]');
  });

  it('prints a tallyui thermal template through the thermal preview', () => {
    const body = '<receipt><text>{{store.name}}</text><text>Total {{total}}</text><text>[{{totals.total_incl_display}}]</text></receipt>';
    const html = renderStoreReceiptTemplate(template({ body, engine: 'thermal', paper: '80mm', dataModel: 'tallyui' }), sale(), context);
    expect(html).toContain('Total $22.00');
    expect(html).toContain('[]');
    expect(html).not.toContain('<receipt>');
  });

  it('throws for a report template', () => {
    expect(() => renderStoreReceiptTemplate(template({ kind: 'report', body: '<p>x</p>' }), sale(), context))
      .toThrow('Only receipt templates print from a sale');
  });

  it('merges the context\'s store and options over the config\'s', () => {
    const body = '<p>[{{store.logo}}] {{cashier.name}}</p>';
    const html = renderStoreReceiptTemplate(template({ body }), sale(), {
      ...context, config: { ...context.config, cashier: 'Bob' },
      store: { logo: 'https://example.com/logo.png' }, options: { cashier: { id: 7, name: 'Ada' } },
    });
    expect(html).toContain('[https://example.com/logo.png] Ada');
  });
});
