// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { medusaAdminUserAuth, medusaAdminUserConnector } from './index';

const { MEDUSA_DEV_URL: baseUrl, MEDUSA_DEV_EMAIL: email, MEDUSA_DEV_PASSWORD: password } = process.env;

// Read-only: sign in, search and get. Customer creation is covered by recorded fixtures.
describe.skipIf(!baseUrl || !email || !password)('live Medusa customers', () => {
  it('searches customers and reads one by id, with null for a missing id', async () => {
    const { token } = await medusaAdminUserAuth.signIn!(baseUrl!, { email: email!, password: password! });
    const context = { connectorId: 'medusa', baseUrl: baseUrl!, headers: medusaAdminUserAuth.getHeaders({ token }) };
    const customers = await medusaAdminUserConnector.searchCustomers!(context, 'smith');
    expect(customers.length).toBeGreaterThan(0);
    for (const customer of customers) {
      expect(typeof customer.id).toBe('string');
      expect(customer.id.length).toBeGreaterThan(0);
      expect(typeof customer.name).toBe('string');
      expect(customer.name.length).toBeGreaterThan(0);
    }
    await expect(medusaAdminUserConnector.getCustomer!(context, customers[0].id)).resolves.toMatchObject({ id: customers[0].id });
    await expect(medusaAdminUserConnector.getCustomer!(context, 'cus_does_not_exist')).resolves.toBeNull();
  }, 30000);
});
