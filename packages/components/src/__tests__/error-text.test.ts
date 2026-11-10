import { expect, it } from 'vitest';
import { errorText } from '../lib/error-text';

class FooError extends Error {
  name = 'FooError';
}

it("shows an Error subclass's message without its class name", () => {
  expect(errorText(new FooError('Finish first'))).toBe('Finish first');
});

it('falls back to a generic line for an Error with no message', () => {
  expect(errorText(new Error(''))).toBe('Something went wrong');
});

it('shows a thrown string as it is', () => {
  expect(errorText('offline')).toBe('offline');
});
