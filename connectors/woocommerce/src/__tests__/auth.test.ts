import { describe, it, expect } from 'vitest';

import { woocommerceConnector } from '../index';

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
});
