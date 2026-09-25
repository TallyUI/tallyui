// Ported from medusapos/app `563b03c4` `lib/register.test.ts` (ADR-052, TV7): `getRegisterId(storage)` became
// `getDeviceId(storage, key)`, with medusapos's key passed in; the last case is new, for the key parameter.
import { describe, expect, it } from 'vitest';
import { getDeviceId } from './device-id';

const KEY = 'medusapos.register_id';
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
}
const uuidV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('getDeviceId', () => {
  it('persists a UUIDv7 and returns it on subsequent calls', () => {
    const storage = memoryStorage();
    const id = getDeviceId(storage, KEY);
    expect(id).toMatch(uuidV7);
    expect(storage.getItem(KEY)).toBe(id);
    expect(getDeviceId(storage, KEY)).toBe(id);
  });
  it('reads a previously stored id', () => {
    const storage = memoryStorage();
    const id = '0195aa30-5c00-7000-8000-000000000001';
    storage.setItem(KEY, id);
    expect(getDeviceId(storage, KEY)).toBe(id);
  });
  it('creates different ids for different browser storages', () => {
    expect(getDeviceId(memoryStorage(), KEY)).not.toBe(getDeviceId(memoryStorage(), KEY));
  });
  it('uses a stable process id with null, throwing reads or throwing writes', () => {
    const fail = () => { throw new Error('Storage unavailable'); };
    const id = getDeviceId(null, KEY);
    expect(id).toMatch(uuidV7);
    expect(getDeviceId(null, KEY)).toBe(id);
    expect(getDeviceId({ getItem: fail, setItem: fail }, KEY)).toBe(id);
    expect(getDeviceId({ getItem: () => null, setItem: fail }, KEY)).toBe(id);
  });
  it('stores the id under the given key only', () => {
    const storage = memoryStorage();
    const id = getDeviceId(storage, 'vendurepos.device_id');
    expect(storage.getItem('vendurepos.device_id')).toBe(id);
    expect(storage.getItem(KEY)).toBeNull();
    expect(getDeviceId(storage, KEY)).not.toBe(id);
  });
});
