import { describe, it, expect } from 'vitest';
import { ConnectorUnauthorizedError } from '@tallyui/core';

import { woocommerceConnector, WooMissingTokenError } from '../index';

describe('woocommerceConnector.auth', () => {
  it('getHeaders sends the WCPOS bearer token and the POS marker', () => {
    expect(woocommerceConnector.auth.getHeaders({ token: 't' })).toEqual({
      Authorization: 'Bearer t',
      'X-WCPOS': '1',
    });
  });

  it('auth fields are url and token', () => {
    expect(woocommerceConnector.auth.type).toBe('WCPOS token');
    expect(woocommerceConnector.auth.fields).toEqual([
      {
        key: 'url',
        label: 'Store URL',
        type: 'url',
        placeholder: 'https://mystore.com',
        required: true,
      },
      {
        key: 'token',
        label: 'Access token',
        type: 'password',
        required: true,
      },
    ]);
  });

  it.each<Record<string, string>>([{}, { token: '' }, { url: 'https://mystore.com' }])('getHeaders refuses credentials without a token: %o', (credentials) => {
    const getHeaders = () => woocommerceConnector.auth.getHeaders(credentials);
    expect(getHeaders).toThrow(WooMissingTokenError);
    expect(getHeaders).toThrow(ConnectorUnauthorizedError);
    expect(getHeaders).toThrow(expect.objectContaining({
      name: 'WooMissingTokenError',
      message: 'WooCommerce credentials have no WCPOS access token: sign in again',
      code: 'unauthorized',
      status: undefined,
    }));
  });

  it('getHeaders never sends consumer-key credentials', () => {
    expect(() => woocommerceConnector.auth.getHeaders({ consumer_key: 'ck', consumer_secret: 'cs' })).toThrow(WooMissingTokenError);
    expect(woocommerceConnector.auth.getHeaders({ token: 't', consumer_key: 'ck', consumer_secret: 'cs' })).toEqual({
      Authorization: 'Bearer t',
      'X-WCPOS': '1',
    });
  });
});
