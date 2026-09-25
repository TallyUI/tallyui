import { describe, it, expect } from 'vitest';
import { resolveCapabilities } from './connector';

describe('resolveCapabilities (ADR-062)', () => {
  it('gives the fresh value when there is no stored value', () => {
    expect(resolveCapabilities({ orderCreate: 2 }, undefined)).toEqual({ orderCreate: 2 });
  });

  it('keeps the stored value when the fresh read was inconclusive', () => {
    expect(resolveCapabilities(undefined, { orderCreate: 2 })).toEqual({ orderCreate: 2 });
  });

  it('lets a definitive fresh read win, even a downgrade', () => {
    expect(resolveCapabilities({ orderCreate: 1 }, { orderCreate: 2 })).toEqual({ orderCreate: 1 });
  });

  it('gives undefined when neither is known', () => {
    expect(resolveCapabilities(undefined, undefined)).toBeUndefined();
  });
});
