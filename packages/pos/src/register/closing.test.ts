import { afterEach, describe, expect, it } from 'vitest';
import { closingByRegister, isRegisterClosing } from './closing';

type Closing = typeof closingByRegister extends Map<string, infer V> ? V : never;

describe('isRegisterClosing (#1275)', () => {
  afterEach(() => { closingByRegister.delete('register-a'); });

  it('C6: is true only for the register whose close is in flight', () => {
    closingByRegister.set('register-a', new Promise(() => {}) as Closing);
    expect(isRegisterClosing('register-a')).toBe(true);
    expect(isRegisterClosing('register-b')).toBe(false);
  });
});
