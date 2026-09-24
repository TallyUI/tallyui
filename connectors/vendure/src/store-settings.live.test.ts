// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { vendureAuth } from './auth';
import { vendureStoreSettings } from './store-settings';

// Read-only (ADR-048): sign-in plus the queries store-settings.ts itself sends. The
// reviewer runs this against vendure-dev; it is skipped elsewhere.
describe.skipIf(!process.env.VENDURE_DEV_URL)('live Vendure store settings', () => {
  const baseUrl = process.env.VENDURE_DEV_URL!;
  const email = process.env.VENDURE_DEV_USER ?? 'superadmin';
  const password = process.env.VENDURE_DEV_PASSWORD ?? 'superadmin';

  it('signs in and reads the settings matching the recorded case', async () => {
    const { token } = await vendureAuth.signIn!(baseUrl, { email, password });
    const context = { connectorId: 'vendure', baseUrl, headers: vendureAuth.getHeaders({ token }) };

    const settings = await vendureStoreSettings(context);

    expect(settings).toEqual({
      currency: 'USD',
      pricesIncludeTax: false,
      taxRatesPpm: { default: 250000, '1': 250000, '2': 70000 },
    });
  }, 30000);
});
