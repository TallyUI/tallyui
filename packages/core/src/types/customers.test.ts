import { describe, it, expect } from 'vitest';
import { CustomerServiceError } from './customers';

describe('CustomerServiceError', () => {
  it('carries the HTTP status while preserving the error properties', () => {
    const error = new CustomerServiceError('server', 'HTTP 503', { status: 503 });
    expect(error.status).toBe(503);
    expect(error.code).toBe('server');
    expect(error.message).toBe('HTTP 503');
    expect(error.name).toBe('CustomerServiceError');
    expect(error).toBeInstanceOf(Error);
  });

  it('has no status when constructed without options', () => {
    const error = new CustomerServiceError('network', 'offline');
    expect(error.status).toBeUndefined();
    expect(error.code).toBe('network');
  });
});
