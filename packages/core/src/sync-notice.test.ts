import { expect, it } from 'vitest';
import { ConnectorUnauthorizedError, errorKind } from '@tallyui/core';

it('errorKind names who can fix a marked error', () => {
  expect(errorKind(new ConnectorUnauthorizedError('Expired token', 401))).toBe('till');
  expect(errorKind({ fixedBy: 'store', code: 'unsupported_store' })).toBe('store');
  expect(errorKind({ fixedBy: 'till', code: 'unauthorized' })).toBe('till');
});

it('errorKind is transient without a string code, with another fixedBy, or with no marker', () => {
  expect(errorKind({ fixedBy: 'store' })).toBe('transient');
  expect(errorKind({ fixedBy: 'till', code: 401 })).toBe('transient');
  expect(errorKind({ fixedBy: 'nobody', code: 'x' })).toBe('transient');
  expect(errorKind({ fixedBy: 'transient', code: 'x' })).toBe('transient');
  expect(errorKind({ permanent: true, code: 'unauthorized' })).toBe('transient');
  expect(errorKind(new Error('WooCommerce API error: 503'))).toBe('transient');
  expect(errorKind(null)).toBe('transient');
  expect(errorKind(undefined)).toBe('transient');
  expect(errorKind('store')).toBe('transient');
});
