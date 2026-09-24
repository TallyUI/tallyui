import { describe, expect, it, vi } from 'vitest';
import { createUuidv7, uuidv7 } from './uuidv7';

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

  it('generates 10,000 strictly increasing v7 ids in the same millisecond', () => {
    const generate = createUuidv7({ now: () => 1_700_000_000_000 });
    const ids = Array.from({ length: 10_000 }, () => generate());
    expect(new Set(ids).size).toBe(10_000);
    ids.forEach((id, i) => {
      expect(id).toMatch(pattern);
      if (i > 0) expect(ids[i - 1] < id).toBe(true);
    });
  });

  it('bumps the timestamp when the random counter overflows', () => {
    const generate = createUuidv7({
      now: () => 1_700_000_000_000,
      randomBytes: (n) => new Uint8Array(n).fill(255),
    });
    const first = generate();
    const second = generate();
    expect(first < second).toBe(true);
    expect(parseInt(second.replace(/-/g, '').slice(0, 12), 16)).toBe(
      parseInt(first.replace(/-/g, '').slice(0, 12), 16) + 1,
    );
  });

  it('keeps the last timestamp when the clock steps backwards', () => {
    const now = vi.fn().mockReturnValueOnce(2000).mockReturnValueOnce(1000);
    const generate = createUuidv7({ now });
    const first = generate();
    const second = generate();
    expect(first < second).toBe(true);
    expect(parseInt(second.replace(/-/g, '').slice(0, 12), 16)).toBe(2000);
  });

  it('generates 10,000 strictly increasing ids with no arguments', () => {
    const ids = Array.from({ length: 10_000 }, () => uuidv7());
    for (let i = 1; i < ids.length; i++) expect(ids[i - 1] < ids[i]).toBe(true);
  });
});
