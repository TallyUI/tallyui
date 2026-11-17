import { describe, it, expect } from 'vitest';
import { createShopifyConnector, shopifyConnector } from '../index';

describe('createShopifyConnector', () => {
  it('returns a new connector on each call', () => {
    const made = createShopifyConnector();
    expect(made).not.toBe(createShopifyConnector());
    expect(made).not.toBe(shopifyConnector);
  });

  it('matches the static connector fields', () => {
    const made = createShopifyConnector();
    for (const field of [
      'id', 'name', 'description', 'icon', 'schemas', 'traits', 'sync', 'replication',
    ] as const) {
      expect(made[field]).toStrictEqual(shopifyConnector[field]);
    }
    expect(made.auth.type).toStrictEqual(shopifyConnector.auth.type);
    expect(made.auth.fields).toStrictEqual(shopifyConnector.auth.fields);
  });

  it('builds the same authentication headers as the static connector', () => {
    const made = createShopifyConnector();
    const credentials = { store: 'my-store', access_token: 'shpat_test' };
    const headers = made.auth.getHeaders(credentials);
    expect(headers).toStrictEqual(shopifyConnector.auth.getHeaders(credentials));
    expect(headers).toStrictEqual({
      'X-Shopify-Access-Token': 'shpat_test',
      'Content-Type': 'application/json',
    });
  });
});
