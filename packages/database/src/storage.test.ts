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
});
