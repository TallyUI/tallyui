import { describe, expect, it, vi } from 'vitest';
import { uuidv7 } from './uuidv7';

const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidv7', () => {
  it('encodes the timestamp, version and variant with injected random bytes', () => {
    const id = uuidv7(0x0190_1234_5678, (n) => new Uint8Array(n));
    expect(id).toBe('01901234-5678-7000-8000-000000000000');
    expect(id).toMatch(pattern);
    expect(uuidv7(0, (n) => new Uint8Array(n).fill(255))).toBe('00000000-0000-7fff-bfff-ffffffffffff');
  });

  it('generates 1000 distinct ids even in the same millisecond', () => {
    const now = Date.now();
    const ids = Array.from({ length: 1000 }, () => uuidv7(now));
    expect(new Set(ids).size).toBe(1000);
    ids.forEach((id) => expect(id).toMatch(pattern));
    expect(uuidv7()).toMatch(pattern);
  });

  it('throws without a random source', () => {
    vi.stubGlobal('crypto', undefined);
    try {
      expect(() => uuidv7()).toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
