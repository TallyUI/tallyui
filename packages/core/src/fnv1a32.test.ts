import { describe, expect, it } from 'vitest';
import { fnv1a32 } from './fnv1a32';

describe('fnv1a32', () => {
  it('matches published FNV-1a 32 vectors with both padding options', () => {
    const vectors = [
      ['', '811c9dc5'],
      ['a', 'e40c292c'],
      ['foobar', 'bf9cf968'],
    ];
    for (const [text, expected] of vectors) {
      expect(fnv1a32(text, { pad: true })).toBe(expected);
      expect(fnv1a32(text, { pad: false })).toBe(expected);
    }
  });

  it('pads to eight lowercase hex digits or keeps the shortest form', () => {
    let hasShortForm = false;
    for (let i = 0; i < 1000; i++) {
      const padded = fnv1a32(`k${i}`, { pad: true });
      const unpadded = fnv1a32(`k${i}`, { pad: false });
      expect(padded).toMatch(/^[0-9a-f]{8}$/);
      expect(unpadded).toBe(padded.replace(/^0+(?=.)/, ''));
      if (unpadded.length < 8) hasShortForm = true;
    }
    expect(hasShortForm).toBe(true);
  });

  it('hashes UTF-16 code units', () => {
    const fold = (units: number[]) => (units.reduce((h, u) => Math.imul(h ^ u, 16777619), 0x811c9dc5) >>> 0).toString(16).padStart(8, '0');
    expect(fold([0xe9])).toBe('6c0b6c44');
    expect(fnv1a32('é', { pad: true })).toBe('6c0b6c44');
    expect(fnv1a32('é', { pad: true })).toBe(fold([0xe9]));
    expect(fnv1a32('😀', { pad: true })).toBe(fold([0xd83d, 0xde00]));
  });
});
