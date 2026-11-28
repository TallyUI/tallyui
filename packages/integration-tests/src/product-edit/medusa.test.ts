import { createMedusaAdminUserConnector } from '@tallyui/connector-medusa';
import { describeProductEditConformance, type ProductEditHarness } from './conformance';

const harness: ProductEditHarness = {
  setup(field, value) {
    const target = { productId: 'prod', variantId: 'variant' };
    const sale = { id: 'p_sale', currency_code: 'usd', amount: 8, rules: {}, min_quantity: null, max_quantity: null };
    let defaults = [{ id: 'p_base', currency_code: 'usd', rules: {}, min_quantity: null, max_quantity: null,
      amount: field === 'basePrice' ? Number(value) / 100 : 15 }];
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
        const { prices }: { prices: { id: string; amount?: number }[] } = JSON.parse(String(init.body));
        defaults = prices.map(({ id, amount }) => {
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
      stored: () => Math.round(defaults[0].amount * 100), writes: () => writes,
      changeBehindTheTill(next) { defaults[0].amount = Number(next) / 100; },
    };
  },
};

describeProductEditConformance('medusa', harness, [{ field: 'basePrice', from: 1500, to: 1250, other: 1000, basis: { currency: 'USD', taxInclusive: false } }]);
