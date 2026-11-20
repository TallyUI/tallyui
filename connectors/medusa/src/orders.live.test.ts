// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { medusaAdminUserAuth } from './index';
import { ORDER_FIELDS, toMedusaStoreOrder } from './orders';

const { MEDUSA_DEV_URL: baseUrl, MEDUSA_DEV_EMAIL: email, MEDUSA_DEV_PASSWORD: password } = process.env;

// Read-only: sign in and list orders with the connector's own field selection.
describe.skipIf(!baseUrl || !email || !password)('live Medusa orders', () => {
  it('lists orders with ORDER_FIELDS, and every order maps and carries credit_line_total', async () => {
    const { token } = await medusaAdminUserAuth.signIn!(baseUrl!, { email: email!, password: password! });
    const params = new URLSearchParams({ limit: '20', offset: '0', order: '-created_at', fields: ORDER_FIELDS });
    const res = await fetch(`${baseUrl}/admin/orders?${params}`, { headers: medusaAdminUserAuth.getHeaders({ token }) });
    expect(res.status).toBe(200);
    const { orders } = (await res.json()) as { orders: Array<Record<string, unknown>> };
    expect(orders.length).toBeGreaterThan(0);
    for (const raw of orders) {
      expect(() => toMedusaStoreOrder(raw)).not.toThrow();
      expect(typeof raw.credit_line_total).toBe('number');
    }
  }, 30000);
});
