import { describe, it, expect } from 'vitest';
import { medusaConnector } from '../index';

describe('Medusa auth', () => {
  it('sends the secret API key over HTTP Basic auth, key as username', () => {
    const headers = medusaConnector.auth.getHeaders({ api_token: 'sk_test_123' });
    expect(headers.Authorization).toBe(`Basic ${btoa('sk_test_123:')}`);
  });
});
