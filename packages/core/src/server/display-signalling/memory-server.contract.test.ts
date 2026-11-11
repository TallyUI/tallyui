import { describe, expect, it } from 'vitest';
import { createMemoryDisplaySignalling } from './memory-server';
import { displaySignallingContract } from './contract';

describe('the in-memory display signalling server meets the ADR-085 contract', () => {
  const make = async () => {
    let now = Date.UTC(2026, 10, 11, 9);
    const { harness } = createMemoryDisplaySignalling({ now: () => now });
    return { ...harness, advance: async (ms: number) => { now += ms; } };
  };

  for (const c of displaySignallingContract(make)) it(c.name, c.run);

  it('gives the harness the same signalling object', () => {
    const { signalling, harness } = createMemoryDisplaySignalling();
    expect(harness.signalling).toBe(signalling);
  });
});
