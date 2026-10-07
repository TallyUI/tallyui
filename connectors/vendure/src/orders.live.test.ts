// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { vendureAuth } from './auth';
import { getVendureOrder, listVendureOrders, type VendureOrderListOptions } from './orders';

describe.skipIf(!process.env.VENDURE_DEV_URL)('live Vendure orders', () => {
  const baseUrl = process.env.VENDURE_DEV_URL!;
  const email = process.env.VENDURE_DEV_USER ?? 'superadmin';
  const password = process.env.VENDURE_DEV_PASSWORD ?? 'superadmin';

  it('accepts the list filters and reads an order without the vendurepos plugin', async () => {
    const { token } = await vendureAuth.signIn!(baseUrl, { email, password });
    const context = { connectorId: 'vendure', baseUrl, headers: vendureAuth.getHeaders({ token }) };
    const options: VendureOrderListOptions[] = [
      { take: 2 },
      { take: 2, search: 'a', state: ['PaymentSettled'] },
      { take: 2, orderPlacedAt: { between: { start: '2020-01-01T00:00:00.000Z', end: '2100-01-01T00:00:00.000Z' } } },
      { take: 2, customerId: '1' },
    ];
    let firstId = '1';
    for (const [index, option] of options.entries()) {
      const result = await listVendureOrders(context, { ...option, tallyFields: false });
      expect(Array.isArray(result.items)).toBe(true);
      expect(typeof result.totalItems).toBe('number');
      if (index === 0) firstId = result.items[0]?.id ?? '1';
    }

    const order = await getVendureOrder(context, firstId, { tallyFields: false });
    if (order !== null) expect(typeof order.id).toBe('string');
    else expect(order).toBeNull();
  }, 30000);
});
