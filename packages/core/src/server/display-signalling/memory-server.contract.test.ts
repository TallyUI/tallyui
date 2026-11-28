import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryDisplaySignalling, sha256Hex } from './memory-server';
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

describe('the in-memory server keeps the original renewal overlap', () => {
  it('refuses the previous token after five minutes despite a lost-answer retry', async () => {
    let now = Date.UTC(2026, 10, 11, 9);
    const { signalling: s, harness: h } = createMemoryDisplaySignalling({ now: () => now });
    const till = await h.till({ cashierId: 'cashier-a', canPair: true });
    const device = { deviceId: 'till-a', deviceKey: (await s.registerDevice(till, 'till-a')).deviceKey };
    const display = h.display('192.0.2.1');
    const { code } = await s.mint(till, device);
    const claim = await s.claim(display, { code, displayName: 'Counter' });
    const [entry] = await s.pending(till, device);
    await s.confirm(till, device, entry!.claimId);
    const result = await s.collect(display, claim.claimSecret);
    if (result.status !== 'paired') throw new Error('not paired');
    await s.renew!(display, result.token);
    now += 4 * 60_000;
    await s.renew!(display, result.token);
    // The reference server's five-minute overlap starts at the first renewal.
    now += 60_000 + 1000;
    await expect(s.readSnapshot(display, result.token)).rejects.toMatchObject({ code: 'token_refused' });
  });
});

describe('the in-memory server revokes on a remembered superseded token (ADR-096 item 5)', () => {
  const paired = async () => {
    let now = Date.UTC(2026, 10, 11, 9);
    const { signalling: s, harness: h } = createMemoryDisplaySignalling({ now: () => now });
    const till = await h.till({ cashierId: 'cashier-a', canPair: true });
    const device = { deviceId: 'till-a', deviceKey: (await s.registerDevice(till, 'till-a')).deviceKey };
    const display = h.display('192.0.2.1');
    const { code } = await s.mint(till, device);
    const claim = await s.claim(display, { code, displayName: 'Counter' });
    const [entry] = await s.pending(till, device);
    await s.confirm(till, device, entry!.claimId);
    const result = await s.collect(display, claim.claimSecret);
    if (result.status !== 'paired') throw new Error('not paired');
    return { s, h, till, device, display, ...result, advance: (ms: number) => { now += ms; } };
  };

  it('drops the display when the original token is used after a thief renews twice', async () => {
    const { s, h, till, device, display, token } = await paired();
    const thief = h.display('198.51.100.9');
    const t1 = await s.renew!(thief, token);
    const t2 = await s.renew!(thief, t1.token);
    await expect(s.readSnapshot(display, token)).rejects.toMatchObject({ code: 'token_refused' });
    expect(await s.list(till, device)).toEqual([]);
    await expect(s.readSnapshot(thief, t2.token)).rejects.toMatchObject({ code: 'token_refused' });
  });

  it('drops the display when a thief replaced the successor before the display used it', async () => {
    const { s, h, till, device, display, token } = await paired();
    const thief = h.display('198.51.100.9');
    const t1 = await s.renew!(display, token);
    const t1b = await s.renew!(thief, token);
    await expect(s.readSnapshot(display, t1.token)).rejects.toMatchObject({ code: 'token_refused' });
    expect(await s.list(till, device)).toEqual([]);
    await expect(s.readSnapshot(thief, t1b.token)).rejects.toMatchObject({ code: 'token_refused' });
  });

  it('drops the display and its snapshot on reuse two generations back in R13', async () => {
    const { s, h, till, device, display, displayId, token, advance } = await paired();
    const t1 = await s.renew!(display, token);
    await s.readSnapshot(display, t1.token);
    advance(10 * 60_000 + 1000);
    await s.readSnapshot(display, t1.token);
    const t2 = await s.renew!(display, t1.token);
    await s.postSnapshot(till, device, displayId, 'live');
    expect(await s.readSnapshot(display, t2.token)).toBe('live');
    await expect(s.readSnapshot(display, token)).rejects.toMatchObject({ code: 'token_refused' });
    expect(await s.list(till, device)).toEqual([]);
    await expect(s.readSnapshot(display, t2.token)).rejects.toMatchObject({ code: 'token_refused' });
    expect((await h.storedCounts()).snapshots).toBe(0);
  });

  it('prunes a retired hash at its own expiry and treats the token as unknown', async () => {
    const { s, h, till, device, display, displayId, token, advance } = await paired();
    const day = 24 * 60 * 60_000;
    advance(day);
    const t1 = await s.renew!(display, token);
    await s.readSnapshot(display, t1.token);
    advance(day);
    const t2 = await s.renew!(display, t1.token);
    await s.readSnapshot(display, t2.token);
    const hash = await sha256Hex(token);
    expect(await h.storedText()).toContain(hash);
    for (const jump of [10 * day, 10 * day, 8 * day + 60_000]) {
      advance(jump);
      await s.readSnapshot(display, t2.token);
    }
    await expect(s.readSnapshot(display, token)).rejects.toMatchObject({ code: 'token_refused' });
    expect((await s.list(till, device)).map((row) => row.displayId)).toEqual([displayId]);
    await s.readSnapshot(display, t2.token);
    expect(await h.storedText()).not.toContain(hash);
  });

  it('drops the display when the replaced successor is presented after a lost-answer retry', async () => {
    const { s, till, device, display, token, advance } = await paired();
    const unseen = await s.renew!(display, token);
    advance(30_000);
    const fresh = await s.renew!(display, token);
    await s.readSnapshot(display, fresh.token);
    await expect(s.readSnapshot(display, unseen.token)).rejects.toMatchObject({ code: 'token_refused' });
    expect(await s.list(till, device)).toEqual([]);
    await expect(s.readSnapshot(display, fresh.token)).rejects.toMatchObject({ code: 'token_refused' });
  });
});
