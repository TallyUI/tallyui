import { describe, expect, it } from 'vitest';
import { SignInError } from '@tallyui/core';

describe('SignInError', () => {
  it('is an Error carrying its code and message', () => {
    const error = new SignInError('invalid_credentials', 'Wrong email or password');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SignInError);
    expect(error.name).toBe('SignInError');
    expect(error.code).toBe('invalid_credentials');
    expect(error.message).toBe('Wrong email or password');
    expect(error.status).toBeUndefined();
  });

  it('keeps an optional status', () => {
    const error = new SignInError('server_error', 'Medusa sign-in failed (HTTP 500)', 500);
    expect(error.code).toBe('server_error');
    expect(error.status).toBe(500);
  });
});
