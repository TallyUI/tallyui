import { expect, it } from 'vitest';
import { ConnectorUnauthorizedError } from '@tallyui/core';

it('exports ConnectorUnauthorizedError with the unauthorized code', () => {
  const error = new ConnectorUnauthorizedError('Expired token', 401);
  expect(error).toBeInstanceOf(Error);
  expect(error.name).toBe('ConnectorUnauthorizedError');
  expect(error.message).toBe('Expired token');
  expect(error.code).toBe('unauthorized');
  expect(error.status).toBe(401);
  expect(new ConnectorUnauthorizedError('Forbidden').status).toBeUndefined();
});
