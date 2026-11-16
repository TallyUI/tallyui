import { expect, test } from 'vitest';
import { EXTENSION_API_VERSION } from './index';

test('EXTENSION_API_VERSION is 1', () => {
  expect(EXTENSION_API_VERSION).toBe(1);
});
