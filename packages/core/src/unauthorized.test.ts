import { expect, it } from 'vitest';
import { ConnectorUnauthorizedError, errorKind } from '@tallyui/core';

it('exports ConnectorUnauthorizedError with the unauthorized code', () => {
  const error = new ConnectorUnauthorizedError('Expired token', 401);
  expect(error).toBeInstanceOf(Error);
  expect(error.name).toBe('ConnectorUnauthorizedError');
  expect(error.message).toBe('Expired token');
  expect(error.code).toBe('unauthorized');
  expect(error.status).toBe(401);
  expect(errorKind(error)).toBe('till');
});

it('exposes forbidden as status 403', () => {
  const error = new ConnectorUnauthorizedError('Forbidden', 403);
  expect(error.status).toBe(403);
  expect(error.code).toBe('forbidden');
  expect(errorKind(error)).toBe('store');
});

it('defaults to unauthorized when a JavaScript caller omits status', () => {
  const error = new ConnectorUnauthorizedError('x', undefined as unknown as 401);
  expect(error.status).toBe(401);
  expect(error.code).toBe('unauthorized');
  expect(error.fixedBy).toBe('till');
});
