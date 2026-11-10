import { expect, it } from 'vitest';
import { suggestFloat } from './float-suggestion';

it('suggests the default float over the last count', () => {
  expect(suggestFloat({ register: { defaultFloatMinor: 10000 }, lastCountedCashMinor: 8550 }))
    .toStrictEqual({ amountMinor: 10000, source: 'default' });
});

it('keeps a zero default float over the last count', () => {
  expect(suggestFloat({ register: { defaultFloatMinor: 0 }, lastCountedCashMinor: 8550 }))
    .toStrictEqual({ amountMinor: 0, source: 'default' });
});

it('falls back to the last count when the register has no default float', () => {
  expect(suggestFloat({ register: {}, lastCountedCashMinor: 8550 }))
    .toStrictEqual({ amountMinor: 8550, source: 'last_count' });
});

it('falls back to the last count when there is no register', () => {
  expect(suggestFloat({ register: null, lastCountedCashMinor: 8550 }))
    .toStrictEqual({ amountMinor: 8550, source: 'last_count' });
});

it('keeps a zero last count', () => {
  expect(suggestFloat({ lastCountedCashMinor: 0 }))
    .toStrictEqual({ amountMinor: 0, source: 'last_count' });
});

it('suggests nothing with neither', () => {
  expect(suggestFloat({})).toStrictEqual({ amountMinor: null, source: null });
  expect(suggestFloat({ register: {}, lastCountedCashMinor: null }))
    .toStrictEqual({ amountMinor: null, source: null });
});
