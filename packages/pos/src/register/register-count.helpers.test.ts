import { expect, it } from 'vitest';
import {
  countVariance,
  denominationTotal,
  overThreshold,
  parseMinor,
  validAmount,
  varianceText,
} from './register-count.helpers';

// A local stub in place of WCPOS's createTestT: it echoes the key, so the assertions below
// expect the raw translation keys ('register.exact' etc.) rather than English words.
const t = (key: string) => key;
const format = (n: number) => `£${n.toFixed(2)}`;

// Fixtures are minor units at exponent 2 (GBP-style): '463.30' becomes 46330.
it.each([
  [46330, '−£17.50 register.short'],
  [48380, '+£3.00 register.over'],
  [48080, 'register.exact'],
])('formats %s', (countedMinor, text) => {
  expect(varianceText(countVariance(countedMinor, 48080), 2, format, t)).toBe(text);
});

it.each([
  [null, -1750, false],
  [null, 1750, false],
  [500, -1750, true],
  [500, 1750, true],
  [500, 499, false],
  [500, 500, false],
])('threshold %s / %s', (thresholdMinor, variance, result) => {
  expect(overThreshold(variance, thresholdMinor)).toBe(result);
});

it('totals denominations in minor units', () => {
  expect(denominationTotal({ 2000: 2, 50: 3 })).toBe(4150);
});

it.each(['', ' ', '-1', 'no', 'Infinity', '1e2'])('rejects invalid amount %s', (value) =>
  expect(validAmount(value, 2)).toBe(false),
);

it('accepts fractional and zero amounts but rejects overflow', () => {
  expect(validAmount('.50', 2)).toBe(true);
  expect(validAmount('0', 2)).toBe(true);
  expect(validAmount('9'.repeat(400), 2)).toBe(false);
});

// TallyUI-only: WCPOS assumed two decimals everywhere; a JPY count (exponent 0) and a KWD
// count (exponent 3) must parse correctly too.
it('parses and validates minor units at a currency-specific exponent, not just two decimals (TallyUI-only)', () => {
  expect(parseMinor('1500', 0)).toBe(1500);
  expect(validAmount('1500', 0)).toBe(true);
  expect(validAmount('15.00', 0)).toBe(false);
  expect(parseMinor('12.345', 3)).toBe(12345);
  expect(validAmount('12.345', 3)).toBe(true);
  expect(validAmount('12.3456', 3)).toBe(false);
});
