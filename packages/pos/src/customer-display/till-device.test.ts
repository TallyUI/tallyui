import { afterEach, describe, it, expect, vi } from 'vitest';
import type { DisplaySignalling, SyncContext } from '@tallyui/core';
import { createMemoryDisplaySignalling } from '@tallyui/core/server';
import type { DisplayConfig } from './protocol';
import { createTillDevice, type TillDeviceKeyStore } from './till-device';
import { createTillDisplayService } from './till-display-service';
import { createTillPairing } from './till-pairing';

const ctx: SyncContext = { connectorId: 'woo', baseUrl: 'https://shop.test', headers: {} };
const configFor = (r: { displayId: string; name: string }): DisplayConfig => ({
  contract: '1.0', display: { id: r.displayId, name: r.name },
  store: { id: 's1', name: 'Corner Shop', currency: 'USD', locale: 'en-US' },
  presentation_hints: {}, i18n: {}, idle: { afterCompleteMs: 8000 },
});

/** An in-memory key store holding `initial`, with every save recorded. */
function keyStore(initial: string | null) {
  let key = initial;
  const saved: string[] = [];
  const keys: TillDeviceKeyStore = {
    load: async () => key,
    save: async (next) => { key = next; saved.push(next); },
    clear: async () => { key = null; },
  };
  return { keys, saved, current: () => key };
}

/** The memory server with every call counted by method name. */
async function countedServer() {
  const { signalling, harness } = createMemoryDisplaySignalling();
  const calls: string[] = [];
  const counted = {} as Record<string, unknown>;
  for (const [name, method] of Object.entries(signalling)) {
    counted[name] = (...args: unknown[]) => {
      calls.push(name);
      return (method as (...args: unknown[]) => unknown)(...args);
    };
  }
  const tillCtx = await harness.till({ cashierId: 'c1', canPair: true });
  return {
    signalling: counted as unknown as DisplaySignalling, raw: signalling, tillCtx,
    count: (name: keyof DisplaySignalling) => calls.filter((call) => call === name).length,
  };
}

const closers: Array<() => void> = [];
afterEach(() => closers.splice(0).forEach((close) => close()));

describe('createTillDevice (TallyUI#754)', () => {
  it('TD1: two concurrent device(ctx) calls with no stored key register once, and both get the same key', async () => {
    let issue: (value: { deviceKey: string }) => void = () => {};
    const registerDevice = vi.fn(() => new Promise<{ deviceKey: string }>((resolve) => { issue = resolve; }));
    const signalling = { registerDevice } as unknown as DisplaySignalling;
    const store = keyStore(null);
    const handle = createTillDevice({ signalling, deviceId: 'till-1', keys: store.keys });
    const first = handle.device(ctx);
    const second = handle.device(ctx);
    await vi.waitFor(() => expect(registerDevice).toHaveBeenCalled());
    issue({ deviceKey: 'issued-key' });
    expect(await first).toEqual({ deviceId: 'till-1', deviceKey: 'issued-key' });
    expect(await second).toEqual({ deviceId: 'till-1', deviceKey: 'issued-key' });
    expect(registerDevice).toHaveBeenCalledTimes(1);
    expect(registerDevice).toHaveBeenCalledWith(ctx, 'till-1');
    expect(store.saved).toEqual(['issued-key']);
  });

  it('TD2: a stored key is used without registering', async () => {
    const registerDevice = vi.fn();
    const signalling = { registerDevice } as unknown as DisplaySignalling;
    const handle = createTillDevice({ signalling, deviceId: 'till-1', keys: keyStore('stored-key').keys });
    expect(await handle.device(ctx)).toEqual({ deviceId: 'till-1', deviceKey: 'stored-key' });
    expect(await handle.device(ctx)).toEqual({ deviceId: 'till-1', deviceKey: 'stored-key' });
    expect(registerDevice).not.toHaveBeenCalled();
  });

  it('TD3: after device_refused, pairing clears the key, re-registers once and the call succeeds', async () => {
    // The server does not know till-1 (say it was pruned), so the stored key is refused.
    const server = await countedServer();
    const store = keyStore('stale-key');
    const device = createTillDevice({ signalling: server.signalling, deviceId: 'till-1', keys: store.keys });
    const errors: unknown[] = [];
    const pairing = createTillPairing({ signalling: server.signalling, context: () => server.tillCtx, device, onError: (error) => errors.push(error) });
    closers.push(() => pairing.close());
    await pairing.start();
    expect(pairing.phase.phase).toBe('code');
    expect(server.count('registerDevice')).toBe(1);
    expect(server.count('mint')).toBe(2);
    expect(store.saved).toHaveLength(1);
    expect(store.current()).toBe(store.saved[0]);
    expect(store.current()).not.toBe('stale-key');
    // The new key is the one the server holds: a till call with it succeeds.
    await expect(server.raw.list(server.tillCtx, { deviceId: 'till-1', deviceKey: store.saved[0] })).resolves.toEqual([]);
  });

  it("TD4: a refused re-registration gives PairingError 'device_refused' with no second retry; the service goes paused", async () => {
    // till-1 already holds a key on the server that this till lost, so its stored key and a new registration are both refused.
    const server = await countedServer();
    await server.raw.registerDevice(server.tillCtx, 'till-1');
    const pairingStore = keyStore('stale-key');
    const pairing = createTillPairing({
      signalling: server.signalling, context: () => server.tillCtx,
      device: createTillDevice({ signalling: server.signalling, deviceId: 'till-1', keys: pairingStore.keys }), onError: () => {},
    });
    closers.push(() => pairing.close());
    await pairing.start();
    expect(pairing.phase).toEqual({ phase: 'idle', error: 'device_refused' });
    expect(server.count('mint')).toBe(1);
    expect(server.count('registerDevice')).toBe(1);
    expect(pairingStore.current()).toBeNull();

    const serviceStore = keyStore('stale-key');
    const service = createTillDisplayService({
      signalling: server.signalling, context: () => server.tillCtx,
      device: createTillDevice({ signalling: server.signalling, deviceId: 'till-1', keys: serviceStore.keys }),
      advertisement: { iceServers: [], snapshot: false }, configFor, onError: () => {},
    });
    closers.push(() => service.close());
    await vi.waitFor(() => expect(service.status).toBe('paused'));
    expect(server.count('list')).toBe(1);
    expect(server.count('registerDevice')).toBe(2);
    expect(serviceStore.current()).toBeNull();
  });
});
