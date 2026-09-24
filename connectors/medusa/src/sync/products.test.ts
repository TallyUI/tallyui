import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SyncContext } from '@tallyui/core';

import { medusaProductSync } from './products';

const context: SyncContext = {
  connectorId: 'medusa',
  baseUrl: 'https://my-medusa-backend.com',
  headers: { Authorization: 'Bearer test_token' },
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('fetchModifiedAfter', () => {
  it('requests updated_at[$gte], not the bracket form Medusa 2.21 silently drops', async () => {
    const date = '2026-01-01T00:00:00Z';
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ products: [] })));

    await medusaProductSync.fetchModifiedAfter!(date, context);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain(`updated_at[$gte]=${date}`);
    expect(url).not.toContain('updated_at[gte]=');
  });
});
