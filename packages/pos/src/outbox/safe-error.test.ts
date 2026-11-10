import { describe, expect, it } from 'vitest';
import { newRxError } from 'rxdb';
import { safeErrorMessage, safeErrorString } from './safe-error';

describe('safe errors', () => {
  it('omits RxDB parameters containing an approval proof', () => {
    const error = newRxError('SNH', { document: { payload: { approval: 'proof-secret' } } });
    expect(String(error)).toContain('proof-secret');
    expect(safeErrorString(error)).not.toContain('proof-secret');
  });

  it('preserves the string form of an ordinary Error', () => {
    expect(safeErrorString(new Error('x'))).toBe('Error: x');
  });

  it('preserves the message of an ordinary Error', () => {
    expect(safeErrorMessage(new Error('x'))).toBe('x');
  });

  it('preserves a plain string message', () => {
    expect(safeErrorMessage('plain')).toBe('plain');
  });
});
