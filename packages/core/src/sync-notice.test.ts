import { expect, it } from 'vitest';
import { ConnectorUnauthorizedError, isPermanentError } from '@tallyui/core';

it('isPermanentError is true for ConnectorUnauthorizedError only among these', () => {
  expect(isPermanentError(new ConnectorUnauthorizedError('Expired token', 401))).toBe(true);
  expect(isPermanentError(new Error('WooCommerce API error: 503'))).toBe(false);
  expect(isPermanentError({ permanent: true })).toBe(false);
  expect(isPermanentError(null)).toBe(false);
});
