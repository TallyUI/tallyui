import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('the in-memory server keeps check codes unique per till', () => {
  const realGetRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  /** Values the next `Uint32Array` draws take, in order; any other draw, or an empty queue, is really random. */
  const draws: number[] = [];
  afterEach(() => {
    draws.length = 0;
    vi.restoreAllMocks();
  });
  const queueDraws = (...values: number[]) => {
    draws.push(...values);
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
      if (array instanceof Uint32Array && draws.length > 0) {
        array[0] = draws.shift()!;
        return array;
      }
      return realGetRandomValues(array as Exclude<T, null>) as T;
    });
  };
  const setup = async () => {
    const { harness: h } = createMemoryDisplaySignalling();
    const a = await h.till({ cashierId: 'cashier-a', canPair: true });
    const b = await h.till({ cashierId: 'cashier-b', canPair: true });
    const da = { deviceId: 'till-a', deviceKey: (await h.signalling.registerDevice(a, 'till-a')).deviceKey };
    const db = { deviceId: 'till-b', deviceKey: (await h.signalling.registerDevice(b, 'till-b')).deviceKey };
    return { h, s: h.signalling, a, b, da, db };
  };

  it("two tills' live claims may share a check code", async () => {
    const { h, s, a, b, da, db } = await setup();
    const codeA = (await s.mint(a, da)).code, codeB = (await s.mint(b, db)).code;
    queueDraws(42, 42);
    const claimA = await s.claim(h.display('192.0.2.1'), { code: codeA, displayName: 'A' });
    const claimB = await s.claim(h.display('192.0.2.2'), { code: codeB, displayName: 'B' });
    expect([claimA.checkCode, claimB.checkCode]).toEqual(['0042', '0042']);
    expect((await s.pending(a, da)).map((p) => [p.displayName, p.checkCode])).toEqual([['A', '0042']]);
    expect((await s.pending(b, db)).map((p) => [p.displayName, p.checkCode])).toEqual([['B', '0042']]);
  });

  it("one till's live claims never share a check code", async () => {
    const { h, s, a, da } = await setup();
    const first = (await s.mint(a, da)).code, second = (await s.mint(a, da)).code;
    queueDraws(42, 42, 7);
    const claimOne = await s.claim(h.display('192.0.2.1'), { code: first, displayName: 'One' });
    const claimTwo = await s.claim(h.display('192.0.2.2'), { code: second, displayName: 'Two' });
    expect([claimOne.checkCode, claimTwo.checkCode]).toEqual(['0042', '0007']);
  });
});
