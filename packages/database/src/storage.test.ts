// @vitest-environment node
import { describe, it, expect } from 'vitest';

import { getStorage } from './storage';

describe('getStorage', () => {
  it('returns a storage object with a name property', () => {
    const storage = getStorage();
    expect(storage).toBeDefined();
    expect(storage.name).toBeDefined();
    expect(typeof storage.createStorageInstance).toBe('function');
  });

  it('returns memory storage in node/test environment', () => {
    const storage = getStorage();
    // In Node.js (test env), we expect memory storage
    expect(storage.name).toBe('memory');
  });

  it('throws with getRxStorageSQLiteWasm guidance in a browser (window + navigator with no product)', async () => {
    const originalWindow = (globalThis as any).window;
    const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    (globalThis as any).window = {};
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
    try {
      expect(() => getStorage()).toThrow(/getRxStorageSQLiteWasm/);
    } finally {
      if (originalWindow === undefined) {
        delete (globalThis as any).window;
      } else {
        (globalThis as any).window = originalWindow;
      }
      if (originalNavigatorDescriptor) {
        Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
      } else {
        delete (globalThis as any).navigator;
      }
    }
  });
});
