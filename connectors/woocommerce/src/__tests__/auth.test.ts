import { describe, it, expect, vi } from 'vitest';
import { ConnectorUnauthorizedError } from '@tallyui/core';

import pkg from '../../package.json';
import { woocommerceConnector, WooMissingTokenError, wcposClientPart } from '../index';

describe('woocommerceConnector.auth', () => {
  it('getHeaders sends the WCPOS bearer token, the POS marker and the protocol signal', () => {
    const headers = woocommerceConnector.auth.getHeaders({ token: 't' });
    expect(headers).toEqual({
      Authorization: 'Bearer t',
      'X-WCPOS': '1',
      'X-WCPOS-Protocol': '2',
      'X-WCPOS-Client': `tallyui/${wcposClientPart(pkg.version)}`,
    });
    expect(headers['X-WCPOS-Client']).toMatch(/^tallyui\/[a-z0-9._-]{1,32}$/);
  });

  it.each([
    ['2.1.0-next.3', '2.1.0-next.3'],
    ['2.1.0+Build.7', '2.1.0build.7'],
    ['1234567890.1234567890.1234567890.1234567', '1234567890.1234567890.1234567890'],
  ])('wcposClientPart keeps [a-z0-9._-], lowercased, at most 32 characters: %s', (version, sent) => {
    expect(wcposClientPart(version)).toBe(sent);
  });

  it('getHeaders sends the package.json version sanitised', async () => {
    vi.resetModules();
    vi.doMock('../../package.json', () => ({ default: { version: '2.1.0+Build.7' } }));
    try {
      const { woocommerceConnector: fresh } = await import('../index');
      expect(fresh.auth.getHeaders({ token: 't' })['X-WCPOS-Client']).toBe('tallyui/2.1.0build.7');
    } finally {
      vi.doUnmock('../../package.json');
      vi.resetModules();
    }
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
    expect(woocommerceConnector.auth.getHeaders({ token: 't', consumer_key: 'ck', consumer_secret: 'cs' }))
      .toEqual(woocommerceConnector.auth.getHeaders({ token: 't' }));
  });
});
