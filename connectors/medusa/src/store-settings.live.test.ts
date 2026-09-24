// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { medusaAdminUserAuth } from './index';
import { medusaStoreSettings } from './store-settings';

const { MEDUSA_DEV_URL: baseUrl, MEDUSA_DEV_EMAIL: email, MEDUSA_DEV_PASSWORD: password } = process.env;

// Read-only (ADR-048): sign-in, the admin reads store-settings.ts itself sends, and one
// GET /store/products with the resulting pricingContext. The reviewer runs this against
// medusa-dev; it is skipped elsewhere.
describe.skipIf(!baseUrl || !email || !password)('live Medusa store settings', () => {
  const url = baseUrl!;

  it('reads with no choice: choice_required, listing the 7 countries', async () => {
    const { token } = await medusaAdminUserAuth.signIn!(url, { email: email!, password: password! });
    const context = { connectorId: 'medusa', baseUrl: url, headers: medusaAdminUserAuth.getHeaders({ token }) };

    const error = await medusaStoreSettings(context).catch((e) => e);
    expect(error).toMatchObject({ code: 'choice_required' });
    expect(error.choices?.countries).toHaveLength(7);
  }, 30000);

  it('reads with { country: "de" }, then prices through the store API with the resulting pricingContext', async () => {
    const { token } = await medusaAdminUserAuth.signIn!(url, { email: email!, password: password! });
    const context = { connectorId: 'medusa', baseUrl: url, headers: medusaAdminUserAuth.getHeaders({ token }) };

    const settings = await medusaStoreSettings(context, { country: 'de' });
    expect(settings.pricingContext).toBeDefined();

    const params = new URLSearchParams({
      region_id: settings.pricingContext!.region_id!,
      limit: '1',
      fields: 'id,*variants.calculated_price',
    });
    const res = await fetch(`${url}/store/products?${params}`, {
      headers: { 'x-publishable-api-key': settings.pricingContext!.publishable_key! },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    const calculatedPrice = body.products?.[0]?.variants?.[0]?.calculated_price;
    expect(calculatedPrice?.currency_code).toBe(settings.pricingContext!.currency_code);
  }, 30000);
});
