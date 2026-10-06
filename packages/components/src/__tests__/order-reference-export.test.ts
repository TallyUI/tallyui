import { describe, expect, it } from 'vitest';
import { orderReference } from '../index';

describe('orderReference package root export', () => {
  it('includes the backend display ID when present', () => {
    expect(orderReference({
      id: '0199aaaa-bbbb-7ccc-8ddd-eeee83c1a89c',
      serverRefs: { displayId: 'DEMO-000001' },
    })).toBe('83c1a89c · #DEMO-000001');
  });

  it('uses the local reference without server refs', () => {
    expect(orderReference({ id: '0199aaaa-bbbb-7ccc-8ddd-eeee83c1a89c' })).toBe('83c1a89c');
  });
});
