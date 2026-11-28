import { expect, it } from 'vitest';
import { createMedusaAdminUserConnector } from '@tallyui/connector-medusa';
import { describeProductEditConformance, type ProductEditHarness } from './conformance';

const harness = (mode: 'hash' | 'id') => ({
  setup(field, value) {
    const target = { productId: 'prod', variantId: 'variant' };
    const sale = { id: 'p_sale', currency_code: 'usd', amount: 8, rules: {}, min_quantity: null, max_quantity: null };
    let defaults = [{ id: 'p_base', currency_code: 'usd', rules: {}, min_quantity: null, max_quantity: null,
      amount: field === 'basePrice' ? Number(value) / 100 : 15 }, { ...sale, id: 'p_eur', currency_code: 'eur', amount: 10 }];
    let writes = 0;
    const product = () => Response.json({ product: { id: target.productId, variants: [{ id: target.variantId, prices: [...defaults, sale] }] } });
    const send: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      if (init?.method === 'GET') {
        if (url.pathname === '/admin/products/prod') return product();
        if (url.pathname === '/admin/price-lists') return Response.json({ price_lists: [{ id: 'list', prices: [{ id: sale.id }] }], count: 1 });
        if (url.pathname === '/admin/price-preferences') return Response.json({ price_preferences: [{ attribute: 'currency_code', value: 'usd', is_tax_inclusive: false }] });
      }
      if (init?.method === 'POST' && url.pathname === '/admin/products/prod/variants/variant') {
        writes++;
        const { prices }: { prices: { id: string; amount?: number; currency_code?: string; min_quantity?: number | null; max_quantity?: number | null }[] } = JSON.parse(String(init.body));
        const unique = new Map(prices.map(price => [mode === 'id' ? price.id :
          `${price.currency_code?.toLowerCase()}|${price.min_quantity ?? ''}|${price.max_quantity ?? ''}`, price]));
        defaults = [...unique.values()].map(({ id, amount }) => {
          const price = defaults.find(entry => entry.id === id);
          if (!price) throw new Error(`Not a default price id: ${id}`);
          return amount === undefined ? price : { ...price, amount };
        });
        return product();
      }
      throw new Error(`Unexpected ${init?.method} ${url.pathname}`);
    };
    return {
      edit: createMedusaAdminUserConnector().productEdit!, target,
      context: { connectorId: 'medusa', baseUrl: 'https://medusa.test', headers: {}, pricingContext: { region_id: 'reg', currency_code: 'usd' }, fetch: send },
      stored: () => Math.round(defaults.find(price => price.id === 'p_base')!.amount * 100), writes: () => writes,
      eur: () => defaults.find(price => price.id === 'p_eur'),
      changeBehindTheTill(next) { defaults.find(price => price.id === 'p_base')!.amount = Number(next) / 100; },
    };
  },
} satisfies ProductEditHarness);

const change = { field: 'basePrice', from: 1500, to: 1250, basis: { currency: 'USD', taxInclusive: false } } as const;
for (const mode of ['hash', 'id'] as const) {
  const name = mode === 'hash' ? 'medusa 2.21 dedupe' : 'medusa 2.23 dedupe';
  const store = harness(mode);
  describeProductEditConformance(name, store, [{ ...change, other: 1000 }]);
  it(`${name} preserves the other default price`, async () => {
    const { edit, context, target, eur } = store.setup(change.field, change.from);
    const before = structuredClone(eur());
    expect(before).toBeDefined();
    expect((await edit.update(context, target, change)).status).toBe('saved');
    expect(eur()).toEqual(before);
  });
}
