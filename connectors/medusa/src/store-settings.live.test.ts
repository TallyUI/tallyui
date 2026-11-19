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
    expect(error.choices?.channels?.[0]?.name).toBe('Default Sales Channel');
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

  // L-A1 (#673): the unfiltered tax-regions list, with rates and their rules, has the shape allTaxRates maps.
  it('lists every tax region with its rates and rate rules', async () => {
    const { token } = await medusaAdminUserAuth.signIn!(url, { email: email!, password: password! });
    const res = await fetch(`${url}/admin/tax-regions?limit=100&offset=0&fields=id,country_code,province_code,parent_id,*tax_rates,*tax_rates.rules`, {
      headers: { ...medusaAdminUserAuth.getHeaders({ token }), 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(Array.isArray(body.tax_regions)).toBe(true);
    expect(typeof body.count).toBe('number');
    const regions: any[] = body.tax_regions;
    const rates: any[] = regions.flatMap((region) => region.tax_rates ?? []);
    const rules: any[] = rates.flatMap((rate) => (Array.isArray(rate.rules) ? rate.rules : []));
    console.info(
      `L-A1: ${regions.length} regions (count ${body.count}), ${regions.filter((r) => r.province_code !== null).length} province regions, ${rates.length} rates, ${rates.filter((r) => r.rules?.length > 0).length} with rules, references ${JSON.stringify([...new Set(rules.map((r) => r.reference))])}, rule keys ${JSON.stringify([...new Set(rules.flatMap((r) => Object.keys(r)))])}`,
    );

    for (const region of regions) {
      expect(typeof region.country_code).toBe('string');
      expect(region.province_code === null || typeof region.province_code === 'string').toBe(true);
      for (const rate of region.tax_rates) {
        expect(typeof rate.id).toBe('string');
        expect(typeof rate.name).toBe('string');
        expect(rate.rate === null || typeof rate.rate === 'number').toBe(true);
        expect(Array.isArray(rate.rules)).toBe(true);
      }
    }
    expect(regions.some((region) => region.province_code !== null)).toBe(true);
    expect(rates.some((rate) => rate.rules.length > 0)).toBe(true);
    for (const rule of rules) {
      expect(typeof rule.reference).toBe('string');
      expect(typeof rule.reference_id).toBe('string');
    }
  }, 30000);
});
